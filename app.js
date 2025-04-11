require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const db = require('./database/db'); // We'll create this next
const authRoutes = require('./routes/auth'); // Import auth routes
const ensureAuthenticated = require('./middleware/authMiddleware'); // Import auth middleware
const appointmentRoutes = require('./routes/appointments'); // Import appointment routes
const patientRoutes = require('./routes/patients'); // Import patient routes
const reportRoutes = require('./routes/reports'); // Import report routes
const settingsRoutes = require('./routes/settings'); // Import settings routes
const flash = require('connect-flash'); // Import connect-flash

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.sqlite', // We'll store sessions in a separate file
        dir: './database',
        concurrentDB: true
    }),
    secret: process.env.SESSION_SECRET || 'your_secret_key', // Change this in production
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 1 week
}));
app.use(flash()); // Use flash middleware AFTER session

// Middleware to create SweetAlert script from flash messages
app.use((req, res, next) => {
    const successMsg = req.flash('success_msg')[0];
    const errorMsg = req.flash('error_msg')[0] || req.flash('error')[0]; // Check both error keys

    // Make raw messages available to views
    res.locals.success_msg = successMsg;
    res.locals.error_msg = errorMsg;

    // Reset flashScript
    res.locals.flashScript = null; 

    if (errorMsg) {
        // Prioritize error messages
        res.locals.flashScript = `<script>Swal.fire({ title: 'Error!', text: '${errorMsg.replace(/'/g, "\\'")}', icon: 'error' });</script>`;
    } else if (successMsg) {
        res.locals.flashScript = `<script>Swal.fire({ title: 'Success!', text: '${successMsg.replace(/'/g, "\\'")}', icon: 'success', timer: 3000, timerProgressBar: true });</script>`;
    }

    next();
});

// Mount Routers
app.use('/auth', authRoutes); // Mount authentication routes
app.use('/appointments', ensureAuthenticated, appointmentRoutes); // Mount appointment routes, protected
app.use('/patients', ensureAuthenticated, patientRoutes); // Mount patient routes, protected
app.use('/reports', ensureAuthenticated, reportRoutes); // Mount report routes, protected
app.use('/settings', ensureAuthenticated, settingsRoutes); // Mount settings routes, protected

// Basic route (temporary) - Change this to redirect to login if not authenticated
app.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/auth/login');
    }
});

// Protected Dashboard Route
app.get('/dashboard', ensureAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    const username = req.session.username;

    try {
        // Define promises for each query
        // Existing: Today's Appointments Count
        const todayAppointmentsPromise = new Promise((resolve, reject) => {
            const sql = `SELECT COUNT(*) as count FROM appointments WHERE user_id = ? AND date(appointment_date) = date('now')`;
            db.get(sql, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            });
        });

        // 1a. Completed Appointments Today Count (New)
        const completedTodayPromise = new Promise((resolve, reject) => {
            const sql = `SELECT COUNT(*) as count FROM appointments WHERE user_id = ? AND date(appointment_date) = date('now') AND status = 'Completed'`;
            db.get(sql, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            });
        });

        // Existing: Total Patients Count
        const totalPatientsPromise = new Promise((resolve, reject) => {
            const sql = `SELECT COUNT(*) as count FROM patients WHERE user_id = ?`;
            db.get(sql, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            });
        });

        // 2a. New Patients This Week Count (New)
        const newPatientsWeekPromise = new Promise((resolve, reject) => {
            const sql = `SELECT COUNT(*) as count FROM patients WHERE user_id = ? AND date(created_at) >= date('now', '-6 days')`; // Includes today + past 6 days
            db.get(sql, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            });
        });

        // Existing: Scheduled Appointments Count (Future/Today)
        const scheduledAppointmentsPromise = new Promise((resolve, reject) => {
             // Count appointments that are 'Scheduled' and are today or in the future
            const sql = `SELECT COUNT(*) as count FROM appointments WHERE user_id = ? AND status = 'Scheduled' AND date(appointment_date) >= date('now')`;
            db.get(sql, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            });
        });

        // Existing: Upcoming Appointments Count (Next 7 Days)
        const upcomingAppointmentsPromise = new Promise((resolve, reject) => {
            const sql = `SELECT COUNT(*) as count 
                         FROM appointments 
                         WHERE user_id = ? 
                           AND status = 'Scheduled' 
                           AND date(appointment_date) > date('now') 
                           AND date(appointment_date) <= date('now', '+7 days')`;
            db.get(sql, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            });
        });

        // Existing: Today's Schedule Details
        const todaysSchedulePromise = new Promise((resolve, reject) => {
            const sql = `SELECT 
                            a.id, 
                            a.patient_id, 
                            p.first_name || ' ' || p.last_name as patient_name, 
                            strftime('%H:%M', a.appointment_date) as time, 
                            a.reason, 
                            a.status
                         FROM appointments a
                         LEFT JOIN patients p ON a.patient_id = p.id AND a.user_id = p.user_id
                         WHERE a.user_id = ? AND date(a.appointment_date) = date('now')
                         ORDER BY a.appointment_date ASC
                         LIMIT 10`; // Limit the number shown on dashboard
            db.all(sql, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

         // 3. Mini Forecast Data (Today + Next 4 Days) (New)
        const forecastPromise = new Promise((resolve, reject) => {
            const sql = `
                WITH RECURSIVE dates(date) AS (
                    SELECT date('now')
                    UNION ALL
                    SELECT date(date, '+1 day') FROM dates WHERE date < date('now', '+4 days')
                )
                SELECT
                    d.date,
                    COUNT(a.id) as count
                FROM dates d
                LEFT JOIN appointments a ON date(a.appointment_date) = d.date AND a.user_id = ? AND a.status = 'Scheduled'
                GROUP BY d.date
                ORDER BY d.date ASC;
            `;
            db.all(sql, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows); 
            });
        });

        // 4. Needs Attention: Past Due Scheduled Appointments (New)
        const pastDuePromise = new Promise((resolve, reject) => {
            const sql = `SELECT
                            a.id,
                            strftime('%Y-%m-%d %H:%M', a.appointment_date) as formatted_date,
                            p.first_name || ' ' || p.last_name as patient_name,
                            p.id as patient_id
                         FROM appointments a
                         JOIN patients p ON a.patient_id = p.id AND a.user_id = p.user_id
                         WHERE a.user_id = ?
                           AND date(a.appointment_date) < date('now')
                           AND a.status = 'Scheduled'
                         ORDER BY a.appointment_date DESC
                         LIMIT 5`; 
             db.all(sql, [userId], (err, rows) => {
                 if (err) reject(err);
                 else resolve(rows);
             });
         });


        // Wait for all promises to resolve
        const [
            todayAppointmentsCount,
            completedTodayCount, 
            totalPatientsCount,
            newPatientsWeekCount, 
            scheduledAppointmentsCount,
            upcomingAppointmentsCount,
            todaysSchedule,
            forecastDataRaw, 
            pastDueAppointments 
        ] = await Promise.all([
            todayAppointmentsPromise,
            completedTodayPromise, 
            totalPatientsPromise,
            newPatientsWeekPromise, 
            scheduledAppointmentsPromise,
            upcomingAppointmentsPromise,
            todaysSchedulePromise,
            forecastPromise, 
            pastDuePromise 
        ]);

         // Process forecast data for chart
        const forecastLabels = forecastDataRaw.map(item => {
            const date = new Date(item.date + 'T00:00:00');
             return date.toLocaleDateString(undefined, { weekday: 'short' });
        });
        const forecastCounts = forecastDataRaw.map(item => item.count);

        // Render the dashboard with all the fetched data
        res.render('dashboard', {
            title: 'Dashboard',
            username: username,
            activePage: 'dashboard',
            stats: {
                todayAppointments: todayAppointmentsCount,
                completedToday: completedTodayCount,
                totalPatients: totalPatientsCount,
                newPatientsWeek: newPatientsWeekCount,
                scheduledAppointments: scheduledAppointmentsCount,
                upcomingAppointments: upcomingAppointmentsCount
            },
            todaysSchedule: todaysSchedule,
            forecastLabels: forecastLabels, 
            forecastData: forecastCounts,   
            pastDueAppointments: pastDueAppointments
        });

    } catch (err) {
        console.error("Error fetching dashboard data:", err.message);
        res.render('dashboard', {
            title: 'Dashboard',
            username: req.session.username,
            activePage: 'dashboard',
            stats: { 
                todayAppointments: 'N/A', completedToday: 'N/A',
                totalPatients: 'N/A', newPatientsWeek: 'N/A',
                scheduledAppointments: 'N/A', upcomingAppointments: 'N/A'
            },
            todaysSchedule: [],
            forecastLabels: [], forecastData: [],
            pastDueAppointments: [],
            error: 'Could not load dashboard statistics.'
        });
    }
});

// Placeholder routes for other features (add later)
// app.use('/reports', ensureAuthenticated, require('./routes/reports'));
// app.use('/settings', ensureAuthenticated, require('./routes/settings'));

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
}); 