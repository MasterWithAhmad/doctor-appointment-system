# Doctor Appointment System


A web-based application designed for doctors to manage patient records and appointments efficiently. Built with Node.js, Express, EJS, SQLite, and Bootstrap.

## Key Features

*   **User Authentication:** Secure login and registration for doctors using bcrypt password hashing.
*   **Dashboard:** At-a-glance overview of today's appointments, key statistics (total patients, upcoming appointments), appointment forecast, and items needing attention (past due scheduled appointments).
*   **Patient Management (CRUD):** Add, view, edit, and delete patient records including personal details, contact information, and medical history.
*   **Appointment Scheduling (CRUD):** Create, view, edit, and delete appointments linked to patients. Includes date/time selection and reason for visit.
*   **Quick Status Updates:** Easily mark appointments as 'Completed' or 'Cancelled' directly from the list view with confirmation prompts.
*   **Data Isolation:** Each doctor only sees their own patient and appointment data.
*   **Search & Filtering:** Search patients by name and filter appointments by status or patient name.
*   **Pagination:** Efficiently navigate through long lists of patients and appointments.
*   **Reporting:** Visual reports including appointment status distribution, patient gender distribution, patient age distribution, and trends for appointments booked and new patients added over the last 7 days. Includes upcoming appointment summary.
*   **Settings:** Change account password securely.
*   **Responsive UI:** User-friendly interface built with Bootstrap 5, suitable for various screen sizes.
*   **Notifications & Confirmations:** Uses SweetAlert2 for non-intrusive user feedback and confirmation dialogs.

## Screenshots

### Login Page
![Login Page](screenshots/login.png?raw=true)

### Dashboard
![Dashboard](screenshots/dashboard.png?raw=true)

### Appointments List
![Appointments List](screenshots/appointments.png?raw=true)

### Patient Details
![Patient Details](screenshots/patient-details.png?raw=true)

### Reports Page (with Charts)
![Reports Page](screenshots/reports.png?raw=true)
![Charts Example](screenshots/charts.png?raw=true)

## Technologies Used

*   **Backend:** Node.js, Express.js
*   **Frontend:** EJS (Embedded JavaScript templates), Bootstrap 5, HTML5, CSS3
*   **Database:** SQLite3
*   **Authentication:** bcrypt (hashing), express-session, connect-sqlite3 (session store)
*   **Charting:** Chart.js
*   **Notifications:** SweetAlert2
*   **Environment Variables:** dotenv
*   **Development:** nodemon

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/MasterWithAhmad/doctor-appointment-system.git
    cd doctor-appointment-system
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    *   Create a `.env` file in the root directory.
    *   Add the following variables (replace `your_secret_key` with a strong, random secret):
        ```dotenv
        SESSION_SECRET=your_secret_key
        PORT=3000 
        # Add any other environment variables if needed (e.g., database path if made configurable)
        ```

4.  **Initialize and Seed the Database:**
    *   The database file (`database/app_data.sqlite`) and session store (`database/sessions.sqlite`) will be created automatically when the application starts or when seeding.
    *   Run the seed script to create tables and add initial test data (a test user, patients, appointments):
        ```bash
        npm run seed
        ```
        *(Seed user credentials - Update if changed: username: `testdoctor`, password: `password`)*

## Running the Application

1.  **Start the development server:**
    ```bash
    npm start
    ```
    This uses `nodemon` to automatically restart the server on file changes.

2.  **Access the application:**
    Open your web browser and navigate to `http://localhost:3000` (or the port specified in your `.env` file).

## Database Schema

The application uses SQLite. Key tables include:

*   `users`: Stores doctor login information (username, email, hashed password).
*   `patients`: Stores patient details (name, DOB, gender, contact, address, medical history, `user_id` foreign key).
*   `appointments`: Stores appointment details (date/time, reason, status, `user_id` foreign key, `patient_id` foreign key).
*   `sessions`: Stores user session data (managed by `connect-sqlite3`).

*(Refer to `database/db.js` for the exact table creation SQL)*

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## License

Distributed under the MIT License. See `LICENSE` file for more information (or choose a different license).

---

_This README was generated with assistance from AI._