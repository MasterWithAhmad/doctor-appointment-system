const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database/db');

const router = express.Router();
const saltRounds = 10; // For bcrypt password hashing

// GET /auth/register - Display registration form
router.get('/register', (req, res) => {
    res.render('register', { title: 'Register', error: null }); // We'll create register.ejs next
});

// POST /auth/register - Handle registration logic
router.post('/register', async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        return res.render('register', { title: 'Register', error: 'Passwords do not match' });
    }

    try {
        // Check if username or email already exists
        const checkUserSql = `SELECT * FROM users WHERE username = ? OR email = ?`;
        db.get(checkUserSql, [username, email], async (err, row) => {
            if (err) {
                console.error('Database error during registration check:', err.message);
                return res.render('register', { title: 'Register', error: 'An error occurred. Please try again.' });
            }
            if (row) {
                return res.render('register', { title: 'Register', error: 'Username or Email already exists.' });
            }

            // Hash the password
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Insert the new user into the database
            const insertSql = `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`;
            db.run(insertSql, [username, email, hashedPassword], function(err) {
                if (err) {
                    console.error('Database error during registration:', err.message);
                    return res.render('register', { title: 'Register', error: 'Failed to register user.' });
                }
                console.log(`User ${username} registered with ID: ${this.lastID}`);
                // Redirect to login page after successful registration
                res.redirect('/auth/login');
            });
        });
    } catch (error) {
        console.error('Error during registration process:', error);
        res.render('register', { title: 'Register', error: 'An unexpected error occurred.' });
    }
});

// GET /auth/login - Display login form
router.get('/login', (req, res) => {
    res.render('login', { title: 'Login', error: null }); // We'll create login.ejs next
});

// POST /auth/login - Handle login logic
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    const sql = `SELECT * FROM users WHERE username = ?`;
    db.get(sql, [username], async (err, user) => {
        if (err) {
            console.error('Database error during login:', err.message);
            return res.render('login', { title: 'Login', error: 'An error occurred. Please try again.' });
        }

        if (!user) {
            return res.render('login', { title: 'Login', error: 'Invalid username or password.' });
        }

        // Compare submitted password with hashed password from DB
        const match = await bcrypt.compare(password, user.password);

        if (match) {
            // Passwords match - Set up session
            req.session.userId = user.id;
            req.session.username = user.username;
            console.log(`User ${user.username} logged in.`);
            // Redirect to a protected dashboard page (we'll create this later)
            res.redirect('/dashboard');
        } else {
            // Passwords don't match
            res.render('login', { title: 'Login', error: 'Invalid username or password.' });
        }
    });
});

// POST /auth/logout - Handle logout (Changed from GET)
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            // Handle error appropriately, maybe redirect with an error message
            // Optionally flash an error message here if needed
            return res.redirect('/'); // Redirect to home/dashboard in case of error
        }
        // Redirect to login page after successful logout
        res.redirect('/auth/login');
    });
});

module.exports = router; 