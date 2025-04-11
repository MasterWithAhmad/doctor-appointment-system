const express = require('express');
const db = require('../database/db');
const ensureAuthenticated = require('../middleware/authMiddleware');

const router = express.Router();

// Middleware to ensure user is authenticated for all appointment routes
router.use(ensureAuthenticated);

// GET /appointments - List all appointments for the logged-in user with pagination & filters
router.get('/', async (req, res) => {
    const userId = req.session.userId;
    const searchPatient = req.query.search_patient || '';
    const filterStatus = req.query.status || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 15;
    const offset = (page - 1) * limit;

    let baseSqlParams = [userId];
    let countSqlParams = [userId];
    let whereClauses = 'WHERE a.user_id = ?';
    // Always need the join for displaying patient name
    const joinClause = 'LEFT JOIN patients p ON a.patient_id = p.id AND a.user_id = p.user_id'; 

    if (searchPatient) {
        whereClauses += ` AND (p.first_name LIKE ? OR p.last_name LIKE ?)`;
        const searchTerm = `%${searchPatient}%`;
        baseSqlParams.push(searchTerm, searchTerm);
        countSqlParams.push(searchTerm, searchTerm);
    }

    if (filterStatus && ['Scheduled', 'Completed', 'Cancelled'].includes(filterStatus)) {
        whereClauses += ` AND a.status = ?`;
        baseSqlParams.push(filterStatus);
        countSqlParams.push(filterStatus);
    }

    // Count query needs the JOIN only if filtering by patient name
    const countSql = `SELECT COUNT(a.id) as count FROM appointments a ${searchPatient ? joinClause : ''} ${whereClauses}`;

    // Data query always needs the join
    const dataSql = `SELECT 
                       a.id, a.patient_id, 
                       p.first_name || ' ' || p.last_name as patient_name, 
                       strftime('%Y-%m-%d %H:%M', a.appointment_date) as formatted_date, 
                       a.reason, a.status
                     FROM appointments a
                     ${joinClause} 
                     ${whereClauses} 
                     ORDER BY a.appointment_date DESC 
                     LIMIT ? OFFSET ?`;
    baseSqlParams.push(limit, offset);

    try {
        // Use Promise.all to run queries concurrently
        const [totalItems, appointments] = await Promise.all([
            new Promise((resolve, reject) => { // Count Promise
                db.get(countSql, countSqlParams, (err, row) => {
                    if (err) reject(err);
                    else resolve(row?.count || 0);
                });
            }),
            new Promise((resolve, reject) => { // Data Promise
                db.all(dataSql, baseSqlParams, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            })
        ]);

        const totalPages = Math.ceil(totalItems / limit);

        // Render view with data and pagination info
        res.render('appointments/list', { 
            title: 'Appointments', 
            username: req.session.username, 
            appointments: appointments, 
            activePage: 'appointments',
            searchPatient: searchPatient, 
            filterStatus: filterStatus,
            currentPage: page,
            totalPages: totalPages,
            totalItems: totalItems
        });

    } catch (err) {
        // Handle errors gracefully
        console.error('Error fetching appointments with pagination:', err.message);
        res.render('appointments/list', { 
            title: 'Appointments', 
            username: req.session.username, 
            appointments: [], 
            activePage: 'appointments',
            searchPatient: searchPatient, 
            filterStatus: filterStatus,
            currentPage: 1,
            totalPages: 0,
            totalItems: 0,
            errorMsg: 'Error fetching appointments.'
        });
    }
});

// GET /appointments/add - Display form to add a new appointment
router.get('/add', async (req, res) => {
    const userId = req.session.userId;
    const preselectedPatientId = req.query.patient_id; // Get preselected ID from query

    try {
        // Fetch patients for the dropdown
        const patientsSql = `SELECT id, first_name, last_name FROM patients WHERE user_id = ? ORDER BY last_name, first_name`;
        const patients = await new Promise((resolve, reject) => {
             db.all(patientsSql, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('appointments/add', { 
            title: 'Add Appointment', 
            username: req.session.username, 
            activePage: 'appointments',
            error: null,
            formData: { patient_id: preselectedPatientId || '' }, // Pre-fill formData if ID exists
            patients: patients 
        });

    } catch (err) {
        console.error("Error fetching patients for add appointment form:", err.message);
        // Handle error - perhaps redirect back or render with an error message
        // For simplicity, render with empty patients list
         res.render('appointments/add', { 
            title: 'Add Appointment', 
            username: req.session.username, 
            activePage: 'appointments',
            error: 'Could not load patient list.',
            formData: { patient_id: preselectedPatientId || '' }, // Still try to pre-fill on error
            patients: []
        });
    }
});

// POST /appointments/add - Handle adding a new appointment
router.post('/add', (req, res) => {
    const userId = req.session.userId;
    const { patient_id, appointment_date, reason } = req.body;

    // Basic validation
    if (!patient_id || !appointment_date) {
        // Need to re-fetch patients if validation fails
        const patientsSql = `SELECT id, first_name, last_name FROM patients WHERE user_id = ? ORDER BY last_name, first_name`;
        db.all(patientsSql, [userId], (patErr, patients) => {
            return res.render('appointments/add', { 
                title: 'Add Appointment', 
                username: req.session.username, 
                activePage: 'appointments',
                error: 'Patient and Appointment Date are required.',
                formData: req.body, // Keep submitted data (including potentially wrong patient_id)
                patients: patErr ? [] : patients 
            });
        });
        return; 
    }

    const sql = `INSERT INTO appointments (user_id, patient_id, appointment_date, reason) VALUES (?, ?, ?, ?)`;
    const params = [userId, patient_id, appointment_date, reason || null];

    db.run(sql, params, function(err) {
        if (err) {
            console.error('Error adding appointment:', err.message);
             // Need to re-fetch patients on error too
            const patientsSql = `SELECT id, first_name, last_name FROM patients WHERE user_id = ? ORDER BY last_name, first_name`;
            db.all(patientsSql, [userId], (patErr, patients) => {
                return res.render('appointments/add', { 
                    title: 'Add Appointment', 
                    username: req.session.username, 
                    activePage: 'appointments',
                    error: 'Failed to add appointment. Please try again.',
                    formData: req.body,
                    patients: patErr ? [] : patients
                });
             });
            return; // Stop execution here
        }
        req.flash('success_msg', 'Appointment added successfully!');
        res.redirect('/appointments'); // Redirect to the list view
    });
});

// GET /appointments/edit/:id - Display form to edit an appointment
router.get('/edit/:id', async (req, res) => {
    const userId = req.session.userId;
    const appointmentId = req.params.id;

    try {
        // Fetch the specific appointment
        const appointmentSql = `SELECT *, strftime('%Y-%m-%dT%H:%M', appointment_date) as datetime_local_format 
                              FROM appointments 
                              WHERE id = ? AND user_id = ?`;
        const appointmentPromise = new Promise((resolve, reject) => {
            db.get(appointmentSql, [appointmentId, userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Fetch all patients for the dropdown
        const patientsSql = `SELECT id, first_name, last_name FROM patients WHERE user_id = ? ORDER BY last_name, first_name`;
        const patientsPromise = new Promise((resolve, reject) => {
             db.all(patientsSql, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Wait for both queries
        const [appointment, patients] = await Promise.all([appointmentPromise, patientsPromise]);

        if (!appointment) {
            console.log(`Edit attempt failed: Appointment ${appointmentId} not found or doesn't belong to user ${userId}`);
            return res.status(404).redirect('/appointments'); // Not found or not authorized
        }
        
        res.render('appointments/edit', { 
            title: 'Edit Appointment', 
            username: req.session.username, 
            activePage: 'appointments',
            error: null,
            appointment: appointment, // Pass appointment details
            patients: patients      // Pass full patient list
        });

    } catch (err) {
         console.error('Error fetching data for edit appointment form:', err.message);
         return res.status(500).redirect('/appointments');
    }
});

// POST /appointments/edit/:id - Handle updating an appointment
router.post('/edit/:id', async (req, res) => {
    const userId = req.session.userId;
    const appointmentId = req.params.id;
    const { patient_id, appointment_date, reason, status } = req.body;

    // Function to re-fetch data and render edit form on error
    const renderEditWithError = async (errorMsg) => {
        try {
            const appointmentSql = `SELECT *, strftime('%Y-%m-%dT%H:%M', appointment_date) as datetime_local_format FROM appointments WHERE id = ? AND user_id = ?`;
            const appointmentPromise = db.get(appointmentSql, [appointmentId, userId]);
            const patientsSql = `SELECT id, first_name, last_name FROM patients WHERE user_id = ? ORDER BY last_name, first_name`;
            const patientsPromise = db.all(patientsSql, [userId]);
            const [appointment, patients] = await Promise.all([appointmentPromise, patientsPromise]);
            
            if (!appointment) return res.redirect('/appointments');

            // Merge original data with attempted changes for repopulation
            const mergedData = { 
                ...appointment, 
                patient_id: patient_id, 
                appointment_date: appointment_date, 
                reason: reason, 
                status: status 
            };

            res.render('appointments/edit', { 
                title: 'Edit Appointment', 
                username: req.session.username, 
                activePage: 'appointments',
                error: errorMsg,
                appointment: mergedData,
                patients: patients
            });
        } catch (fetchErr) {
            console.error('Error re-fetching data for edit form render:', fetchErr.message);
            res.redirect('/appointments'); // Redirect on nested error
        }
    };

    // Basic validation
    if (!patient_id || !appointment_date || !status) {
         return renderEditWithError('Patient, Appointment Date, and Status are required.');
    }

    const sql = `UPDATE appointments SET patient_id = ?, appointment_date = ?, reason = ?, status = ? WHERE id = ? AND user_id = ?`;
    const params = [patient_id, appointment_date, reason || null, status, appointmentId, userId];

    try {
        const result = await new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ changes: this.changes }); 
            });
        });

        if (result.changes === 0) {
             req.flash('error_msg', 'Appointment not found or no changes made.');
             res.redirect('/appointments');
        } else {
            req.flash('success_msg', 'Appointment updated successfully!');
            res.redirect('/appointments'); 
        }
    } catch (err) {
         return renderEditWithError('Failed to update appointment. Please try again.');
    }
});

// POST /appointments/delete/:id - Handle deleting an appointment
// Note: Using POST for delete to prevent accidental deletion via simple links/GET requests
router.post('/delete/:id', (req, res) => { 
    const userId = req.session.userId;
    const appointmentId = req.params.id;

    const sql = `DELETE FROM appointments WHERE id = ? AND user_id = ?`;

    db.run(sql, [appointmentId, userId], function(err) {
        if (err) {
            console.error('Error deleting appointment:', err.message);
            req.flash('error_msg', 'Error deleting appointment. Please try again.');
        } else if (this.changes === 0) {
            console.log(`Delete attempt failed: Appointment ${appointmentId} not found or doesn't belong to user ${userId}`);
            req.flash('error_msg', 'Appointment not found.');
        } else {
            console.log(`Appointment ${appointmentId} deleted for user ${userId}`);
            req.flash('success_msg', 'Appointment deleted successfully.');
        }
        res.redirect('/appointments'); // Redirect back to the list view
    });
});

// POST /appointments/mark-complete/:id - Quick action to mark as completed
router.post('/mark-complete/:id', (req, res) => {
    const userId = req.session.userId;
    const appointmentId = req.params.id;
    const newStatus = 'Completed';

    const sql = `UPDATE appointments SET status = ? WHERE id = ? AND user_id = ?`;
    db.run(sql, [newStatus, appointmentId, userId], function(err) {
        if (err) {
            console.error('Error marking appointment complete:', err.message);
            req.flash('error_msg', 'Failed to update appointment status.');
        } else if (this.changes === 0) {
             req.flash('error_msg', 'Appointment not found or already updated.');
        } else {
             req.flash('success_msg', 'Appointment marked as Completed.');
        }
        // Redirect back to the appointments list (or potentially previous page if stored)
        res.redirect('/appointments' + (req.headers.referer ? '?' + req.headers.referer.split('?')[1] : '')); 
    });
});

// POST /appointments/cancel/:id - Quick action to mark as cancelled
router.post('/cancel/:id', (req, res) => {
    const userId = req.session.userId;
    const appointmentId = req.params.id;
    const newStatus = 'Cancelled';

    const sql = `UPDATE appointments SET status = ? WHERE id = ? AND user_id = ?`;
     db.run(sql, [newStatus, appointmentId, userId], function(err) {
        if (err) {
            console.error('Error cancelling appointment:', err.message);
            req.flash('error_msg', 'Failed to update appointment status.');
        } else if (this.changes === 0) {
             req.flash('error_msg', 'Appointment not found or already updated.');
        } else {
             req.flash('success_msg', 'Appointment marked as Cancelled.');
        }
       res.redirect('/appointments' + (req.headers.referer ? '?' + req.headers.referer.split('?')[1] : '')); 
    });
});

module.exports = router; 