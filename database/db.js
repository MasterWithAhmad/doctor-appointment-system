const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Use a specific file for the main application data
const dbPath = path.join(__dirname, 'app_data.sqlite');

// Connect to the database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDatabase();
    }
});

// Function to initialize database tables if they don't exist
function initializeDatabase() {
    db.serialize(() => {
        // Users table for authentication
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('Error creating users table', err.message);
            } else {
                console.log('Users table checked/created successfully.');
            }
        });

        // Appointments table
        db.run(`
            CREATE TABLE IF NOT EXISTS appointments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                patient_id INTEGER NOT NULL,
                appointment_date DATETIME NOT NULL,
                reason TEXT,
                status TEXT DEFAULT 'Scheduled', -- e.g., Scheduled, Completed, Cancelled
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE SET NULL
            )
        `, (err) => {
            if (err) {
                console.error('Error creating appointments table', err.message);
            } else {
                console.log('Appointments table checked/created successfully.');
            }
        });

        // Patients table
        db.run(`
            CREATE TABLE IF NOT EXISTS patients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                date_of_birth DATE,
                gender TEXT, -- e.g., Male, Female, Other
                contact_number TEXT,
                email TEXT,
                address TEXT,
                medical_history TEXT, -- Keep it simple for now
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) {
                console.error('Error creating patients table', err.message);
            } else {
                console.log('Patients table checked/created successfully.');
            }
        });

        // Add other core tables here later (e.g., reports data)
    });
}

module.exports = db; 