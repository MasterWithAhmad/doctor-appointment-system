// --- routes/patients.js --- 

// POST /patients/add
router.post('/add', (req, res) => {
    // ... validation ...
    db.run(sql, [...params...], function(err) {
        if (err) {
             // ... error handling ... (keep rendering with error)
        } else {
            console.log(`Patient ${first_name} ${last_name} added...`);
            req.flash('success_msg', 'Patient added successfully!'); // Add flash message
            res.redirect('/patients'); 
        }
    });
});

// POST /patients/edit/:id
router.post('/edit/:id', (req, res) => {
    // ... validation ...
    db.run(sql, [...params...], function(err) {
        if (err) {
             // ... error handling ... (keep rendering with error)
        } else if (this.changes === 0) {
             // ... not found handling ...
             req.flash('error_msg', 'Patient not found.'); // Add flash message
             return res.status(404).redirect('/patients');
        } else {
            console.log(`Patient ${patientId} updated...`);
            req.flash('success_msg', 'Patient updated successfully!'); // Add flash message
            res.redirect('/patients');
        }
    });
});

// --- routes/appointments.js --- 

// POST /appointments/add
router.post('/add', (req, res) => {
    // ... validation ...
    db.run(sql, [...params...], function(err) {
        if (err) {
             // ... error handling ... (keep rendering with error)
        } else {
            console.log(`Appointment added...`);
            req.flash('success_msg', 'Appointment added successfully!'); // Add flash message
            res.redirect('/appointments'); 
        }
    });
});

// POST /appointments/edit/:id
router.post('/edit/:id', async (req, res) => {
    // ... validation and renderEditWithError function ...
    try {
        // ... db.run wrapped in promise ...
        if (result.changes === 0) {
            // ... not found handling ...
             req.flash('error_msg', 'Appointment not found.'); // Add flash message
             return res.status(404).redirect('/appointments');
        } else {
            console.log(`Appointment ${appointmentId} updated...`);
            req.flash('success_msg', 'Appointment updated successfully!'); // Add flash message
            res.redirect('/appointments'); 
        }
    } catch (err) {
        // ... error handling using renderEditWithError ...
    }
});

// --- routes/settings.js --- 

// POST /settings/change-password 
router.post('/change-password', async (req, res) => {
    // ... validation and error rendering ...
    try {
        // ... password check ...
         db.run(updateSql, [...params...], function(err) {
                if (err) {
                    // ... error handling (render with error) ...
                } else {
                    console.log(`Password updated for user ${userId}`);
                    req.flash('success_msg', 'Password updated successfully!'); // Use flash message
                    // Redirect to settings page to display flash message
                    res.redirect('/settings'); 
                    /* Remove the direct render here:
                     res.render('settings/index', { 
                        // ... data ...
                        message: 'Password updated successfully!', // Remove this
                        error: null
                    });
                    */
                }
         });
    } catch (error) {
        // ... error handling (render with error) ...
    }
}); 