const db = require('./db');
const bcrypt = require('bcrypt');
const saltRounds = 10;

async function seedDatabase() {
    console.log('Starting database seeding...');

    try {
        // --- Seed User ---
        const username = 'ahmad';
        const email = 'ahmad@gmail.com';
        const password = '123'; // Simple password for seeding
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const insertUserSql = `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`;
        // Using async/await with db.run wrapped in a promise for simplicity
        const userResult = await new Promise((resolve, reject) => {
             // Check if user already exists first to make seeder idempotent
            db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email], (err, row) => {
                if (err) return reject(err);
                if (row) {
                    console.log(`User ${username} or email ${email} already exists.`);
                    return resolve({ lastID: row.id, changes: 0 }); // Return existing user ID
                }
                // Insert if not found
                db.run(insertUserSql, [username, email, hashedPassword], function(err) {
                    if (err) reject(err);
                    else resolve({ lastID: this.lastID, changes: this.changes });
                });
            });
        });

        const userId = userResult.lastID;
        if (userResult.changes > 0) {
            console.log(`User '${username}' created with ID: ${userId}`);
        }
        
        if (!userId) {
            throw new Error("Could not get user ID for seeding subsequent data.");
        }

        // --- Seed Patients ---
        const patientsData = [
            { first_name: 'Alice', last_name: 'Smith', date_of_birth: '1985-05-15', gender: 'Female', contact_number: '555-1234', email: 'alice@mail.com' },
            { first_name: 'Bob', last_name: 'Johnson', date_of_birth: '1992-08-22', gender: 'Male', contact_number: '555-5678' },
            { first_name: 'Charlie', last_name: 'Brown', date_of_birth: '1978-11-01', gender: 'Male', email: 'charlie@mail.com' },
            { first_name: 'Diana', last_name: 'Williams', date_of_birth: '2001-02-10', gender: 'Female' },
             { first_name: 'Ethan', last_name: 'Davis', date_of_birth: '1995-07-30', gender: 'Male', contact_number: '555-9900' }
        ];

        const insertPatientSql = `INSERT INTO patients (user_id, first_name, last_name, date_of_birth, gender, contact_number, email) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        const patientIds = [];

        for (const patient of patientsData) {
            // Check if patient exists (simple check by name and DOB for idempotency)
            const existingPatient = await new Promise((resolve, reject) => {
                db.get('SELECT id FROM patients WHERE user_id = ? AND first_name = ? AND last_name = ? AND date_of_birth = ?', 
                    [userId, patient.first_name, patient.last_name, patient.date_of_birth], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (existingPatient) {
                console.log(`Patient ${patient.first_name} ${patient.last_name} already exists.`);
                patientIds.push(existingPatient.id); // Use existing ID
                continue;
            }

            // Insert if not found
            const patientResult = await new Promise((resolve, reject) => {
                db.run(insertPatientSql, [userId, patient.first_name, patient.last_name, patient.date_of_birth, patient.gender, patient.contact_number, patient.email], function(err) {
                    if (err) reject(err);
                    else resolve({ lastID: this.lastID });
                });
            });
            console.log(`Patient '${patient.first_name} ${patient.last_name}' created with ID: ${patientResult.lastID}`);
            patientIds.push(patientResult.lastID);
        }

        // --- Seed Appointments ---
        if (patientIds.length < 3) {
            console.log('Not enough patients created to seed appointments effectively.');
            return;
        }
        
         // Clear existing appointments for this user first to avoid duplicates if run multiple times
        await new Promise((resolve, reject) => {
            db.run(`DELETE FROM appointments WHERE user_id = ?`, [userId], function(err) {
                if (err) reject(err);
                else {
                    console.log(`Cleared ${this.changes} existing appointments for user ${userId}.`);
                    resolve();
                }
            });
        });

        const appointmentsData = [
            // Past completed
            { patient_id: patientIds[0], appointment_date: '2024-03-10 10:00:00', reason: 'Checkup', status: 'Completed' }, 
            { patient_id: patientIds[1], appointment_date: '2024-03-15 14:30:00', reason: 'Follow-up', status: 'Completed' },
            // Past cancelled
            { patient_id: patientIds[2], appointment_date: '2024-04-01 09:00:00', reason: 'Consultation', status: 'Cancelled' },
            // Today scheduled
            { patient_id: patientIds[0], appointment_date: new Date().toISOString().slice(0, 10) + ' 11:00:00', reason: 'Flu Shot', status: 'Scheduled' },
            // Future scheduled
            { patient_id: patientIds[3], appointment_date: getFutureDate(3) + ' 15:00:00', reason: 'Annual Physical', status: 'Scheduled' },
            { patient_id: patientIds[4], appointment_date: getFutureDate(7) + ' 09:30:00', reason: 'Allergy Test', status: 'Scheduled' },
            { patient_id: patientIds[1], appointment_date: getFutureDate(10) + ' 16:00:00', reason: 'Checkup', status: 'Scheduled' },
        ];

        const insertAppointmentSql = `INSERT INTO appointments (user_id, patient_id, appointment_date, reason, status) VALUES (?, ?, ?, ?, ?)`;

        for (const appt of appointmentsData) {
             await new Promise((resolve, reject) => {
                db.run(insertAppointmentSql, [userId, appt.patient_id, appt.appointment_date, appt.reason, appt.status], function(err) {
                    if (err) reject(err);
                    else resolve({ lastID: this.lastID });
                });
            });
        }
        console.log(`${appointmentsData.length} appointments created successfully.`);

        console.log('Database seeding completed successfully!');

    } catch (error) {
        console.error('Error seeding database:', error);
    } finally {
        // Close the database connection if opened here (or ensure it closes elsewhere)
        // db.close(); // Only if db was opened *only* for seeding
    }
}

// Helper function to get a future date string
function getFutureDate(daysToAdd) {
    const date = new Date();
    date.setDate(date.getDate() + daysToAdd);
    return date.toISOString().slice(0, 10); // YYYY-MM-DD format
}

// Run the seeder function
seedDatabase(); 