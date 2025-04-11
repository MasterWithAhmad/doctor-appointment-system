const express = require('express');
const db = require('../database/db');
const ensureAuthenticated = require('../middleware/authMiddleware');

const router = express.Router();

// Helper function to get dates for the last N days (YYYY-MM-DD)
function getLastNDates(n) {
    const dates = [];
    for (let i = 0; i < n; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
    }
    return dates.reverse(); // Return in chronological order
}

// Middleware for authentication
router.use(ensureAuthenticated);

// GET /reports - Display various reports and charts
router.get('/', async (req, res) => {
    const userId = req.session.userId;
    const daysToTrack = 7; // For trend charts

    try {
        // --- Promises for Data Fetching ---

        // 1. Existing Appointment Status Counts
        const appointmentStatusPromise = new Promise((resolve, reject) => {
            const sql = `SELECT status, COUNT(*) as count
                         FROM appointments
                         WHERE user_id = ?
                         GROUP BY status`;
            db.all(sql, [userId], (err, rows) => {
                if (err) reject(err);
                else {
                    // Ensure all statuses are present, even if count is 0
                    const counts = { Scheduled: 0, Completed: 0, Cancelled: 0 };
                    rows.forEach(row => {
                        if (counts.hasOwnProperty(row.status)) {
                            counts[row.status] = row.count;
                        }
                    });
                    resolve(counts);
                }
            });
        });

        // 2. Existing Patient Gender Counts
        const patientGenderPromise = new Promise((resolve, reject) => {
            const sql = `SELECT gender, COUNT(*) as count
                         FROM patients
                         WHERE user_id = ? AND gender IS NOT NULL AND gender != ''
                         GROUP BY gender`;
            db.all(sql, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.reduce((acc, row) => { // Convert array to object { Male: x, Female: y }
                    acc[row.gender] = row.count;
                    return acc;
                }, {}));
            });
        });

        // 3. Appointments Over Time (Last 7 Days)
        const appointmentTrendPromise = new Promise((resolve, reject) => {
            const sql = `SELECT date(appointment_date) as day, COUNT(*) as count
                         FROM appointments
                         WHERE user_id = ? AND date(appointment_date) >= date('now', '-${daysToTrack - 1} days')
                         GROUP BY day
                         ORDER BY day ASC`;
            db.all(sql, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows); // Array of {day: 'YYYY-MM-DD', count: N}
            });
        });

        // 4. Patient Age Distribution
        const ageDistributionPromise = new Promise((resolve, reject) => {
            // Calculate age and group into brackets
            const sql = `
                SELECT
                    CASE
                        WHEN CAST(strftime('%Y.%m%d', 'now') - strftime('%Y.%m%d', date_of_birth) AS INTEGER) BETWEEN 0 AND 10 THEN '0-10'
                        WHEN CAST(strftime('%Y.%m%d', 'now') - strftime('%Y.%m%d', date_of_birth) AS INTEGER) BETWEEN 11 AND 20 THEN '11-20'
                        WHEN CAST(strftime('%Y.%m%d', 'now') - strftime('%Y.%m%d', date_of_birth) AS INTEGER) BETWEEN 21 AND 30 THEN '21-30'
                        WHEN CAST(strftime('%Y.%m%d', 'now') - strftime('%Y.%m%d', date_of_birth) AS INTEGER) BETWEEN 31 AND 40 THEN '31-40'
                        WHEN CAST(strftime('%Y.%m%d', 'now') - strftime('%Y.%m%d', date_of_birth) AS INTEGER) BETWEEN 41 AND 50 THEN '41-50'
                        WHEN CAST(strftime('%Y.%m%d', 'now') - strftime('%Y.%m%d', date_of_birth) AS INTEGER) BETWEEN 51 AND 60 THEN '51-60'
                        WHEN CAST(strftime('%Y.%m%d', 'now') - strftime('%Y.%m%d', date_of_birth) AS INTEGER) > 60 THEN '60+'
                        ELSE 'Unknown'
                    END as age_group,
                    COUNT(*) as count
                FROM patients
                WHERE user_id = ? AND date_of_birth IS NOT NULL
                GROUP BY age_group
                ORDER BY age_group;
            `;
            db.all(sql, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows); // Array of {age_group: 'X-Y', count: N}
            });
        });

        // 5. New Patients Over Time (Last 7 Days)
        const newPatientTrendPromise = new Promise((resolve, reject) => {
            const sql = `SELECT date(created_at) as day, COUNT(*) as count
                         FROM patients
                         WHERE user_id = ? AND date(created_at) >= date('now', '-${daysToTrack - 1} days')
                         GROUP BY day
                         ORDER BY day ASC`;
            db.all(sql, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows); // Array of {day: 'YYYY-MM-DD', count: N}
            });
        });

         // 6. Upcoming Appointments (Next 7 Days)
        const upcomingAppointmentsPromise = new Promise((resolve, reject) => {
            const sql = `SELECT
                            a.id,
                            a.appointment_date,
                            strftime('%Y-%m-%d %H:%M', a.appointment_date) as formatted_date,
                            a.reason,
                            p.first_name || ' ' || p.last_name as patient_name
                         FROM appointments a
                         JOIN patients p ON a.patient_id = p.id AND a.user_id = p.user_id
                         WHERE a.user_id = ?
                           AND date(a.appointment_date) >= date('now')
                           AND date(a.appointment_date) <= date('now', '+7 days')
                           AND a.status = 'Scheduled' -- Only show scheduled ones
                         ORDER BY a.appointment_date ASC`;
             db.all(sql, [userId], (err, rows) => {
                 if (err) reject(err);
                 else resolve(rows);
             });
         });

        // --- Wait for all promises ---
        const [
            appointmentStatusCounts,
            patientGenderCounts,
            appointmentTrendRaw,
            ageDistributionRaw,
            newPatientTrendRaw,
            upcomingAppointments
        ] = await Promise.all([
            appointmentStatusPromise,
            patientGenderPromise,
            appointmentTrendPromise,
            ageDistributionPromise,
            newPatientTrendPromise,
            upcomingAppointmentsPromise
        ]);

        // --- Process Data for Charts ---

        // Calculate Cancellation Rate
        const totalAppointments = Object.values(appointmentStatusCounts).reduce((sum, count) => sum + count, 0);
        const cancellationRate = totalAppointments > 0
            ? ((appointmentStatusCounts.Cancelled / totalAppointments) * 100).toFixed(1)
            : 0;

        // Format Trend Data (fill gaps with 0)
        const lastNDates = getLastNDates(daysToTrack);
        const formatTrendData = (rawData) => {
            const trendMap = rawData.reduce((map, item) => {
                map[item.day] = item.count;
                return map;
            }, {});
            return lastNDates.map(date => trendMap[date] || 0);
        };

        const appointmentTrendData = formatTrendData(appointmentTrendRaw);
        const newPatientTrendData = formatTrendData(newPatientTrendRaw);

        // Format Age Distribution
        const ageLabels = ageDistributionRaw.map(item => item.age_group);
        const ageCounts = ageDistributionRaw.map(item => item.count);

        // Total Patient Count (from gender or separate query if needed, using gender counts for now)
        const totalPatients = Object.values(patientGenderCounts).reduce((sum, count) => sum + count, 0);


        // --- Render the View ---
        res.render('reports/index', {
            title: 'Reports',
            username: req.session.username,
            activePage: 'reports',

            // Raw Counts/Stats
            totalAppointments: totalAppointments,
            totalPatients: totalPatients,
            cancellationRate: cancellationRate,

            // Data for Charts (already processed for Chart.js)
            appointmentStatusData: Object.values(appointmentStatusCounts), // [Scheduled, Completed, Cancelled] counts
            patientGenderLabels: Object.keys(patientGenderCounts), // ['Male', 'Female', ...]
            patientGenderData: Object.values(patientGenderCounts), // [count, count, ...]

            trendLabels: lastNDates, // ['YYYY-MM-DD', ...] - For both trend charts
            appointmentTrendData: appointmentTrendData, // [count, count, ...]
            newPatientTrendData: newPatientTrendData, // [count, count, ...]

            ageDistributionLabels: ageLabels, // ['0-10', '11-20', ...]
            ageDistributionData: ageCounts, // [count, count, ...]

            // List Data
            upcomingAppointments: upcomingAppointments // Array of upcoming appointments
        });

    } catch (err) {
        console.error("Error fetching reports data:", err.message);
        // Render with an error message or default state
        res.render('reports/index', {
            title: 'Reports',
            username: req.session.username,
            activePage: 'reports',
            error: 'Could not load report data.'
            // Include default empty structures for other variables if needed by the template
        });
    }
});

// Add routes for specific reports later, e.g.:
// router.get('/appointment-summary', (req, res) => { ... });
// router.get('/patient-demographics', (req, res) => { ... });

module.exports = router; 