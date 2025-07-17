const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database/db');
const ensureAuthenticated = require('../middleware/authMiddleware');

const router = express.Router();
const saltRounds = 10;

// Middleware for authentication
router.use(ensureAuthenticated);

// GET /settings - Display settings page (user info + password change form)
router.get('/', (req, res) => {
    const userId = req.session.userId;
    // Fetch current user info (excluding password hash)
    const sql = `SELECT id, username, email, created_at, last_password_change FROM users WHERE id = ?`;
    db.get(sql, [userId], (err, user) => {
        if (err || !user) {
            console.error('Error fetching user for settings:', err?.message);
            // Handle error - maybe redirect to dashboard with a message
            return res.redirect('/dashboard');
        }
        res.render('settings/index', { 
            title: 'Settings', 
            username: req.session.username, 
            activePage: 'settings',
            userInfo: user,
            message: null, // For success/error messages
            error: null // Separate error for form validation
        });
    });
});

// POST /settings/change-password - Handle password change logic
router.post('/change-password', async (req, res) => {
    const userId = req.session.userId;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Basic validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        req.flash('error_msg', 'All password fields are required.');
        return res.redirect('/settings');
    }

    if (newPassword !== confirmPassword) {
        req.flash('error_msg', 'New passwords do not match.');
        return res.redirect('/settings');
    }

    // Fetch user data first (including password hash) to verify current password
    const userSql = `SELECT id, username, email, created_at, password FROM users WHERE id = ?`;
    db.get(userSql, [userId], async (err, user) => {
        if (err || !user) {
            console.error('Error fetching user for password change:', err?.message);
            req.flash('error_msg', 'Could not retrieve user information.');
            return res.redirect('/settings');
        }

        try {
            // Check if current password is correct
            const match = await bcrypt.compare(currentPassword, user.password);
            if (!match) {
                req.flash('error_msg', 'Incorrect current password.');
                return res.redirect('/settings');
            }

            // --- Add Password Strength Check (Optional but recommended) ---
            if (newPassword.length < 8) { // Example: Minimum length check
                req.flash('error_msg', 'New password must be at least 8 characters long.');
                return res.redirect('/settings');
            }
            // Add more checks here (e.g., complexity) if desired
            // ---

            // Hash the new password
            const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

            // Update the password in the database
            const updateSql = `UPDATE users SET password = ?, last_password_change = CURRENT_TIMESTAMP WHERE id = ?`;
            db.run(updateSql, [hashedNewPassword, userId], function(updateErr) {
                if (updateErr) {
                    console.error('Error updating password:', updateErr.message);
                    req.flash('error_msg', 'Failed to update password. Please try again.');
                    return res.redirect('/settings');
                }
                
                console.log(`Password updated for user ${userId}`);
                req.flash('success_msg', 'Password updated successfully!');
                res.redirect('/settings');
            });

        } catch (error) {
            console.error('Error during password change process:', error);
            req.flash('error_msg', 'An unexpected error occurred during password change.');
            res.redirect('/settings');
        }
    });
});

// POST /settings/update-info - Handle user info (username/email) update
router.post('/update-info', (req, res) => {
    const userId = req.session.userId;
    const { username, email } = req.body;

    // Basic validation
    if (!username || !email) {
        req.flash('error_msg', 'Username and email are required.');
        return res.redirect('/settings');
    }

    // Check if username or email already exists for another user
    const checkSql = `SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?`;
    db.get(checkSql, [username, email, userId], (err, existingUser) => {
        if (err) {
            console.error('Error checking for existing user:', err.message);
            req.flash('error_msg', 'Database error. Please try again.');
            return res.redirect('/settings');
        }
        if (existingUser) {
            req.flash('error_msg', 'Username or email already in use.');
            return res.redirect('/settings');
        }

        // Update user info
        const updateSql = `UPDATE users SET username = ?, email = ? WHERE id = ?`;
        db.run(updateSql, [username, email, userId], function(updateErr) {
            if (updateErr) {
                console.error('Error updating user info:', updateErr.message);
                req.flash('error_msg', 'Failed to update user info. Please try again.');
                return res.redirect('/settings');
            }
            req.session.username = username; // Update session username
            req.flash('success_msg', 'User information updated successfully!');
            res.redirect('/settings');
        });
    });
});

// POST /settings/delete-account - Delete the current user account
router.post('/delete-account', (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        req.flash('error_msg', 'You must be logged in to delete your account.');
        return res.redirect('/settings');
    }
    const deleteSql = `DELETE FROM users WHERE id = ?`;
    db.run(deleteSql, [userId], function(err) {
        if (err) {
            console.error('Error deleting user:', err.message);
            req.flash('error_msg', 'Failed to delete account. Please try again.');
            return res.redirect('/settings');
        }
        req.session.destroy(() => {
            req.flash('success_msg', 'Your account has been deleted.');
            res.redirect('/auth/login');
        });
    });
});

// POST /settings/factory-reset - Delete all user data except the user account
router.post('/factory-reset', (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        req.flash('error_msg', 'You must be logged in to perform a factory reset.');
        return res.redirect('/settings');
    }
    // Delete appointments and patients for this user
    db.serialize(() => {
        db.run('DELETE FROM appointments WHERE user_id = ?', [userId], (err) => {
            if (err) {
                console.error('Error deleting appointments:', err.message);
                req.flash('error_msg', 'Failed to delete appointments.');
                return res.redirect('/settings');
            }
            db.run('DELETE FROM patients WHERE user_id = ?', [userId], (err2) => {
                if (err2) {
                    console.error('Error deleting patients:', err2.message);
                    req.flash('error_msg', 'Failed to delete patients.');
                    return res.redirect('/settings');
                }
                req.flash('success_msg', 'All your data has been erased. Your account remains.');
                res.redirect('/settings');
            });
        });
    });
});

// GET /settings/download-data - Download user data as CSV
router.get('/download-data', async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        req.flash('error_msg', 'You must be logged in to download your data.');
        return res.redirect('/settings');
    }
    try {
        // Fetch user profile
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT id, username, email, created_at, last_password_change FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });
        // Fetch appointments
        const appointments = await new Promise((resolve, reject) => {
            db.all('SELECT id, patient_id, appointment_date, reason, status, created_at FROM appointments WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
        // Fetch patients
        const patients = await new Promise((resolve, reject) => {
            db.all('SELECT id, first_name, last_name, date_of_birth, gender, contact_number, email, address, medical_history, created_at FROM patients WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
        // Build CSV
        let csv = '';
        // Profile section
        csv += 'Profile\n';
        csv += 'id,username,email,created_at,last_password_change\n';
        csv += `${user.id},${user.username},${user.email},${user.created_at},${user.last_password_change || ''}\n\n`;
        // Appointments section
        csv += 'Appointments\n';
        csv += 'id,patient_id,appointment_date,reason,status,created_at\n';
        appointments.forEach(a => {
            csv += `${a.id},${a.patient_id},${a.appointment_date},"${(a.reason||'').replace(/"/g,'""')}",${a.status},${a.created_at}\n`;
        });
        csv += '\n';
        // Patients section
        csv += 'Patients\n';
        csv += 'id,first_name,last_name,date_of_birth,gender,contact_number,email,address,medical_history,created_at\n';
        patients.forEach(p => {
            csv += `${p.id},"${(p.first_name||'').replace(/"/g,'""')}","${(p.last_name||'').replace(/"/g,'""')}",${p.date_of_birth||''},${p.gender||''},${p.contact_number||''},${p.email||''},"${(p.address||'').replace(/"/g,'""')}","${(p.medical_history||'').replace(/"/g,'""')}",${p.created_at}\n`;
        });
        // Send as file
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="my_data.csv"');
        res.send(csv);
    } catch (err) {
        console.error('Error generating CSV:', err);
        req.flash('error_msg', 'Failed to generate CSV. Please try again.');
        res.redirect('/settings');
    }
});

module.exports = router; 