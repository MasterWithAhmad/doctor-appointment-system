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

module.exports = router; 