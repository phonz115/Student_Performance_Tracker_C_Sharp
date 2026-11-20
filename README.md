# Student Performance Tracker

The React/Vite frontend uses the ASP.NET Core API and MySQL database.

## Requirements

- Node.js and npm
- .NET 10 SDK
- MySQL

## Local setup

1. Create the database using `server/student_tracker.sql`. For an existing database, apply the schema additions for `users.course`, `users.school_year`, `users.semester`, and `password_reset_tokens` if they are missing.
2. In PowerShell, set the MySQL connection string for the current terminal. Replace the placeholders with your local database values; do not commit credentials.

   ```powershell
   $env:MYSQL_CONNECTION_STRING = "Server=localhost;Database=student_tracker;User ID=YOUR_DB_USER;Password=YOUR_DB_PASSWORD;"
   ```

3. From the repository root, install frontend dependencies and start the C# API and Vite:

   ```powershell
   npm install
   npm run dev
   ```

   Vite runs at `http://localhost:5173`; the API runs at `http://localhost:5001`. The frontend API base defaults to `http://localhost:5001/api`.

Password-reset email is optional for local development. To enable it, set `SMTP_USER` and `SMTP_APP_PASSWORD` in the same terminal before starting the app. Use a Gmail app password, not your account password. `APP_BASE_URL` defaults to `http://localhost:5173`.

## Checks

```powershell
dotnet build backend\StudentTracker.Api
npm run check
npm run build
```

Admin backups include password hashes. Keep exported backup files private.
