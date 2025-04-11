const express = require('express');
const db = require('../database/db');
const ensureAuthenticated = require('../middleware/authMiddleware');

const router = express.Router();

// Middleware to ensure user is authenticated for all patient routes
router.use(ensureAuthenticated);

// GET /patients - List all patients for the logged-in user with pagination
router.get('/', async (req, res) => {
    const userId = req.session.userId;
    const searchQuery = req.query.search || ''; 
    const page = parseInt(req.query.page) || 1; // Get current page or default to 1
    const limit = 15; // Items per page
    const offset = (page - 1) * limit;

    let baseSqlParams = [userId];
    let countSqlParams = [userId];
    let whereClauses = 'WHERE user_id = ?';

    if (searchQuery) {
        whereClauses += ` AND (first_name LIKE ? OR last_name LIKE ?)`;
        const searchTerm = `%${searchQuery}%`;
        baseSqlParams.push(searchTerm, searchTerm);
        countSqlParams.push(searchTerm, searchTerm);
    }

    // Query for total count (matching filters)
    const countSql = `SELECT COUNT(*) as count FROM patients ${whereClauses}`;
    
    // Query for paginated data
    let dataSql = `SELECT *, (strftime('%Y', 'now') - strftime('%Y', date_of_birth)) - (strftime('%m-%d', 'now') < strftime('%m-%d', date_of_birth)) AS age 
                   FROM patients 
                   ${whereClauses} 
                   ORDER BY last_name, first_name 
                   LIMIT ? OFFSET ?`;
    baseSqlParams.push(limit, offset);

    try {
        // Run count and data queries in parallel
        const countPromise = new Promise((resolve, reject) => {
            db.get(countSql, countSqlParams, (err, row) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            });
        });

        const dataPromise = new Promise((resolve, reject) => {
            db.all(dataSql, baseSqlParams, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const [totalItems, patients] = await Promise.all([countPromise, dataPromise]);

        const totalPages = Math.ceil(totalItems / limit);

        res.render('patients/list', { 
            title: 'Patients', 
            username: req.session.username, 
            patients: patients, 
            activePage: 'patients',
            searchQuery: searchQuery,
            currentPage: page,
            totalPages: totalPages,
            totalItems: totalItems // Optional: for display like "Showing X-Y of Z"
        });

    } catch (err) {
        console.error('Error fetching patients with pagination:', err.message);
        res.render('patients/list', { 
            title: 'Patients', 
            username: req.session.username, 
            patients: [], 
            activePage: 'patients',
            searchQuery: searchQuery, 
            currentPage: 1,
            totalPages: 0,
            totalItems: 0,
            errorMsg: 'Error fetching patients.'
        });
    }
});

// GET /patients/add - Display form to add a new patient
router.get('/add', (req, res) => {
    res.render('patients/add', { 
        title: 'Add Patient', 
        username: req.session.username, 
        activePage: 'patients',
        error: null,
        formData: {}
    });
});

// POST /patients/add - Handle adding a new patient
router.post('/add', (req, res) => {
    const userId = req.session.userId;
    // Extract all fields from the form
    const { first_name, last_name, date_of_birth, gender, contact_number, email, address, medical_history } = req.body;

    // Basic validation (at least first and last name)
    if (!first_name || !last_name) {
        return res.render('patients/add', { 
            title: 'Add Patient', 
            username: req.session.username, 
            activePage: 'patients',
            error: 'First Name and Last Name are required.',
            formData: req.body // Send back submitted data
        });
    }

    const sql = `INSERT INTO patients (user_id, first_name, last_name, date_of_birth, gender, contact_number, email, address, medical_history) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [userId, first_name, last_name, date_of_birth || null, gender || null, contact_number || null, email || null, address || null, medical_history || null];
    
    db.run(sql, params, function(err) {
        if (err) {
            console.error('Error adding patient:', err.message);
            return res.render('patients/add', { 
                title: 'Add Patient', 
                username: req.session.username, 
                activePage: 'patients',
                error: 'Failed to add patient. Please try again.',
                formData: req.body
            });
        }
        req.flash('success_msg', 'Patient added successfully!');
        res.redirect('/patients');
    });
});

// GET /patients/edit/:id - Display form to edit a patient
router.get('/edit/:id', (req, res) => {
    const userId = req.session.userId;
    const patientId = req.params.id;

    const sql = `SELECT * FROM patients WHERE id = ? AND user_id = ?`;

    db.get(sql, [patientId, userId], (err, patient) => {
        if (err) {
            console.error('Error fetching patient for edit:', err.message);
            return res.status(500).redirect('/patients');
        }
        if (!patient) {
            console.log(`Edit attempt failed: Patient ${patientId} not found or doesn't belong to user ${userId}`);
            return res.status(404).redirect('/patients');
        }
        
        res.render('patients/edit', { 
            title: 'Edit Patient', 
            username: req.session.username, 
            activePage: 'patients',
            error: null,
            patient: patient
        });
    });
});

// POST /patients/edit/:id - Handle updating a patient
router.post('/edit/:id', (req, res) => {
    const userId = req.session.userId;
    const patientId = req.params.id;
    const { first_name, last_name, date_of_birth, gender, contact_number, email, address, medical_history } = req.body;

    // Basic validation
    if (!first_name || !last_name) {
        const fetchSql = `SELECT * FROM patients WHERE id = ? AND user_id = ?`;
         db.get(fetchSql, [patientId, userId], (fetchErr, patient) => {
            if(fetchErr || !patient){
                return res.redirect('/patients');
            }
            return res.render('patients/edit', { 
                title: 'Edit Patient', 
                username: req.session.username, 
                activePage: 'patients',
                error: 'First Name and Last Name are required.',
                patient: { ...patient, ...req.body } 
            });
         });
         return;
    }

    const sql = `UPDATE patients SET first_name = ?, last_name = ?, date_of_birth = ?, gender = ?, contact_number = ?, email = ?, address = ?, medical_history = ? WHERE id = ? AND user_id = ?`;
    const params = [first_name, last_name, date_of_birth || null, gender || null, contact_number || null, email || null, address || null, medical_history || null, patientId, userId];

    db.run(sql, params, function(err) {
        if (err) {
            console.error('Error updating patient:', err.message);
            const fetchSql = `SELECT * FROM patients WHERE id = ? AND user_id = ?`;
            db.get(fetchSql, [patientId, userId], (fetchErr, patient) => {
                if(fetchErr || !patient){
                     return res.redirect('/patients');
                }
                return res.render('patients/edit', { 
                    title: 'Edit Patient', 
                    username: req.session.username, 
                    activePage: 'patients',
                    error: 'Failed to update patient. Please try again.',
                    patient: { ...patient, ...req.body }
                });
            });
            return;
        }
        if (this.changes === 0) {
            req.flash('error_msg', 'Patient not found or no changes made.');
            res.redirect('/patients');
        } else {
            req.flash('success_msg', 'Patient updated successfully!');
            res.redirect('/patients');
        }
    });
});

// POST /patients/delete/:id - Handle deleting a patient
router.post('/delete/:id', (req, res) => { 
    const userId = req.session.userId;
    const patientId = req.params.id;

    // Optional: Check for appointments first
    const checkAppointmentsSql = `SELECT COUNT(*) as count FROM appointments WHERE patient_id = ? AND user_id = ?`;
    db.get(checkAppointmentsSql, [patientId, userId], (err, row) => {
        if (err) {
            console.error('Error checking appointments before deleting patient:', err.message);
            req.flash('error_msg', 'Error checking existing appointments. Patient not deleted.');
            return res.redirect('/patients');
        }
        if (row && row.count > 0) {
             req.flash('error_msg', `Cannot delete patient. They have ${row.count} associated appointment(s). Delete or reassign appointments first.`);
             return res.redirect('/patients');
        }

        // Proceed with deletion if no appointments
        const deleteSql = `DELETE FROM patients WHERE id = ? AND user_id = ?`;
        db.run(deleteSql, [patientId, userId], function(err) {
            if (err) {
                console.error('Error deleting patient:', err.message);
                req.flash('error_msg', 'Error deleting patient. Please try again.');
            } else if (this.changes === 0) {
                console.log(`Delete attempt failed: Patient ${patientId} not found or doesn't belong to user ${userId}`);
                req.flash('error_msg', 'Patient not found.');
            } else {
                console.log(`Patient ${patientId} deleted for user ${userId}`);
                req.flash('success_msg', 'Patient deleted successfully.');
            }
            res.redirect('/patients');
        });
    });
});

// GET /patients/details/:id - Show patient details and appointment history
router.get('/details/:id', async (req, res) => {
    const userId = req.session.userId;
    const patientId = req.params.id;

    try {
        // Fetch patient details
        const patientSql = `SELECT *, strftime('%Y-%m-%d', date_of_birth) as formatted_dob, 
                               (strftime('%Y', 'now') - strftime('%Y', date_of_birth)) - (strftime('%m-%d', 'now') < strftime('%m-%d', date_of_birth)) AS age
                          FROM patients 
                          WHERE id = ? AND user_id = ?`;
        const patientPromise = new Promise((resolve, reject) => {
            db.get(patientSql, [patientId, userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Fetch patient's appointment history
        const appointmentsSql = `SELECT id, strftime('%Y-%m-%d %H:%M', appointment_date) as formatted_date, reason, status 
                               FROM appointments 
                               WHERE patient_id = ? AND user_id = ? 
                               ORDER BY appointment_date DESC`;
        const appointmentsPromise = new Promise((resolve, reject) => {
            db.all(appointmentsSql, [patientId, userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Run in parallel
        const [patient, appointments] = await Promise.all([patientPromise, appointmentsPromise]);

        if (!patient) {
            console.log(`Details view failed: Patient ${patientId} not found or doesn't belong to user ${userId}`);
            return res.status(404).redirect('/patients'); // Or render a 'not found' page
        }

        res.render('patients/details', {
            title: `Patient: ${patient.first_name} ${patient.last_name}`,
            username: req.session.username,
            activePage: 'patients', // Keep patients section active
            patient: patient,
            appointments: appointments
        });

    } catch (err) {
        console.error("Error fetching patient details:", err.message);
        res.status(500).redirect('/patients'); // Redirect on error
    }
});

module.exports = router; 