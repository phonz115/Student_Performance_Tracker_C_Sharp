using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using StudentTracker.Api.Infrastructure;
using StudentTracker.Api.Security;

namespace StudentTracker.Api.Controllers;

[ApiController]
[Route("api")]
[Authorize(Roles = "admin")]
public sealed class BackupController(DbConnectionFactory db) : ControllerBase
{
    public sealed class RestoreSnapshot
    {
        public List<BackupUser> Users { get; init; } = [];
        public List<BackupGrade> Grades { get; init; } = [];
        public List<BackupAssignment> Assignments { get; init; } = [];
        public List<BackupCourse> Courses { get; init; } = [];
        public List<BackupSubject> Subjects { get; init; } = [];
    }

    public sealed record BackupUser(
        string? Id,
        string? Email,
        string? Name,
        string? Role,
        string? Course,
        string? SchoolYear,
        string? Semester,
        string? PasswordHash);

    public sealed record BackupGrade(
        int? Id,
        string? StudentId,
        string? Subject,
        decimal Score,
        string? Feedback,
        string? TeacherId,
        string? SchoolYear,
        string? Semester,
        string? Term);

    public sealed record BackupAssignment(
        string? TeacherId,
        string? StudentId,
        string? Subject,
        string? Course,
        string? Section,
        string? SchoolYear,
        string? Semester);

    public sealed record BackupCourse(
        string? Code,
        string? Name,
        string? Description,
        string? SchoolYear,
        string? Semester,
        string? TeacherId);

    public sealed record BackupSubject(string? Name, string? TeacherId);

    [HttpGet("backup")]
    public async Task<IActionResult> Download(CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);

        var users = new List<object>();
        await using (var command = new MySqlCommand(
            """
            SELECT id, email,
                   COALESCE(NULLIF(name, ''), TRIM(CONCAT_WS(' ', firstname, lastname))) AS name,
                   role, course, school_year AS schoolYear, semester,
                   password AS passwordHash
            FROM users
            ORDER BY id
            """,
            connection))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                users.Add(new
                {
                    id = reader.GetString("id"),
                    email = reader.GetString("email"),
                    name = reader.GetString("name"),
                    role = reader.GetString("role"),
                    course = reader.GetString("course"),
                    schoolYear = reader.GetString("schoolYear"),
                    semester = reader.GetString("semester"),
                    passwordHash = reader.GetString("passwordHash")
                });
            }
        }

        var grades = new List<object>();
        await using (var command = new MySqlCommand(
            """
            SELECT id, student_id AS studentId, subject, score, feedback,
                   teacher_id AS teacherId, school_year AS schoolYear, semester, term
            FROM grades
            ORDER BY id
            """,
            connection))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                grades.Add(new
                {
                    id = reader.GetInt32("id"),
                    studentId = reader.GetString("studentId"),
                    subject = reader.IsDBNull(reader.GetOrdinal("subject"))
                        ? ""
                        : reader.GetString("subject"),
                    score = reader.GetDecimal("score"),
                    feedback = reader.IsDBNull(reader.GetOrdinal("feedback"))
                        ? ""
                        : reader.GetString("feedback"),
                    teacherId = reader.IsDBNull(reader.GetOrdinal("teacherId"))
                        ? null
                        : reader.GetString("teacherId"),
                    schoolYear = reader.GetString("schoolYear"),
                    semester = reader.GetString("semester"),
                    term = reader.GetString("term")
                });
            }
        }

        var assignments = new List<object>();
        await using (var command = new MySqlCommand(
            """
            SELECT id, teacher_id AS teacherId, student_id AS studentId, subject,
                   course, section, school_year AS schoolYear, semester
            FROM teacher_assignments
            ORDER BY id
            """,
            connection))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                assignments.Add(new
                {
                    id = reader.GetInt32("id"),
                    teacherId = reader.GetString("teacherId"),
                    studentId = reader.GetString("studentId"),
                    subject = reader.GetString("subject"),
                    course = reader.IsDBNull(reader.GetOrdinal("course"))
                        ? ""
                        : reader.GetString("course"),
                    section = reader.IsDBNull(reader.GetOrdinal("section"))
                        ? ""
                        : reader.GetString("section"),
                    schoolYear = reader.GetString("schoolYear"),
                    semester = reader.GetString("semester")
                });
            }
        }

        var courses = new List<object>();
        await using (var command = new MySqlCommand(
            """
            SELECT id, code, name, description, school_year AS schoolYear,
                   semester, teacher_id AS teacherId
            FROM courses
            ORDER BY id
            """,
            connection))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                courses.Add(new
                {
                    id = reader.GetInt32("id"),
                    code = reader.GetString("code"),
                    name = reader.GetString("name"),
                    description = reader.IsDBNull(reader.GetOrdinal("description"))
                        ? ""
                        : reader.GetString("description"),
                    schoolYear = reader.GetString("schoolYear"),
                    semester = reader.GetString("semester"),
                    teacherId = reader.IsDBNull(reader.GetOrdinal("teacherId"))
                        ? null
                        : reader.GetString("teacherId")
                });
            }
        }

        var subjects = new List<object>();
        await using (var command = new MySqlCommand(
            """
            SELECT subject_id AS id, subject_name AS name, teacher_id AS teacherId
            FROM subjects
            ORDER BY subject_id
            """,
            connection))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                subjects.Add(new
                {
                    id = reader.GetInt32("id"),
                    name = reader.GetString("name"),
                    teacherId = reader.IsDBNull(reader.GetOrdinal("teacherId"))
                        ? null
                        : reader.GetString("teacherId")
                });
            }
        }

        return Ok(new
        {
            exportedAt = DateTimeOffset.UtcNow,
            users,
            grades,
            assignments,
            courses,
            subjects
        });
    }

    [HttpPost("restore")]
    public async Task<IActionResult> Restore(RestoreSnapshot? snapshot, CancellationToken ct)
    {
        if (snapshot is null)
        {
            return BadRequest(new { message = "Backup snapshot is required." });
        }

        if (snapshot.Users is null ||
            snapshot.Grades is null ||
            snapshot.Assignments is null ||
            snapshot.Courses is null ||
            snapshot.Subjects is null)
        {
            return BadRequest(new { message = "Backup snapshot sections must be arrays." });
        }

        var validationError = ValidateSnapshot(snapshot);
        if (validationError is not null)
        {
            return BadRequest(new { message = validationError });
        }

        await using var connection = await db.OpenAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        foreach (var user in snapshot.Users)
        {
            var (firstName, lastName) = SplitName(user.Name!);
            var role = user.Role!.Trim().ToLowerInvariant();
            var storedPassword = IsPasswordHash(user.PasswordHash!)
                ? user.PasswordHash!
                : PasswordHash.Create(user.PasswordHash!);

            const string sql = """
                INSERT INTO users
                    (id, email, firstname, lastname, name, role, password,
                     course, school_year, semester)
                VALUES
                    (@id, @email, @firstName, @lastName, @name, @role, @password,
                     @course, @schoolYear, @semester)
                ON DUPLICATE KEY UPDATE
                    email = VALUES(email), firstname = VALUES(firstname),
                    lastname = VALUES(lastname), name = VALUES(name),
                    role = VALUES(role), course = VALUES(course),
                    school_year = VALUES(school_year), semester = VALUES(semester)
                """;
            await using var command = new MySqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("@id", user.Id!.Trim());
            command.Parameters.AddWithValue("@email", user.Email!.Trim().ToLowerInvariant());
            command.Parameters.AddWithValue("@firstName", firstName);
            command.Parameters.AddWithValue("@lastName", lastName);
            command.Parameters.AddWithValue("@name", user.Name!.Trim());
            command.Parameters.AddWithValue("@role", role);
            command.Parameters.AddWithValue("@password", storedPassword);
            command.Parameters.AddWithValue("@course", user.Course ?? "");
            command.Parameters.AddWithValue("@schoolYear", user.SchoolYear ?? "2025-2026");
            command.Parameters.AddWithValue("@semester", user.Semester ?? "1st Semester");
            await command.ExecuteNonQueryAsync(ct);
        }

        foreach (var course in snapshot.Courses)
        {
            const string sql = """
                INSERT INTO courses
                    (code, name, description, school_year, semester, teacher_id)
                VALUES
                    (@code, @name, @description, @schoolYear, @semester, @teacherId)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name), description = VALUES(description),
                    school_year = VALUES(school_year), semester = VALUES(semester),
                    teacher_id = VALUES(teacher_id)
                """;
            await using var command = new MySqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("@code", course.Code!.Trim().ToUpperInvariant());
            command.Parameters.AddWithValue("@name", course.Name!.Trim());
            command.Parameters.AddWithValue("@description", course.Description ?? "");
            command.Parameters.AddWithValue("@schoolYear", course.SchoolYear ?? "2025-2026");
            command.Parameters.AddWithValue("@semester", course.Semester ?? "1st Semester");
            command.Parameters.AddWithValue(
                "@teacherId",
                string.IsNullOrWhiteSpace(course.TeacherId) ? DBNull.Value : course.TeacherId.Trim());
            await command.ExecuteNonQueryAsync(ct);
        }

        foreach (var subject in snapshot.Subjects)
        {
            const string sql = """
                INSERT INTO subjects (subject_name, teacher_id)
                SELECT @name, @teacherId
                WHERE NOT EXISTS (
                    SELECT 1 FROM subjects
                        WHERE subject_name = @name AND teacher_id <=> @teacherId
                )
                """;
            await using var command = new MySqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("@name", subject.Name!.Trim());
            command.Parameters.AddWithValue(
                "@teacherId",
                string.IsNullOrWhiteSpace(subject.TeacherId)
                    ? DBNull.Value
                    : subject.TeacherId.Trim());
            await command.ExecuteNonQueryAsync(ct);
        }

        foreach (var assignment in snapshot.Assignments)
        {
            const string sql = """
                INSERT INTO teacher_assignments
                    (teacher_id, student_id, subject, course, section, school_year, semester)
                VALUES
                    (@teacherId, @studentId, @subject, @course, @section, @schoolYear, @semester)
                ON DUPLICATE KEY UPDATE
                    course = VALUES(course), section = VALUES(section)
                """;
            await using var command = new MySqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("@teacherId", assignment.TeacherId!.Trim());
            command.Parameters.AddWithValue("@studentId", assignment.StudentId!.Trim());
            command.Parameters.AddWithValue("@subject", assignment.Subject!.Trim());
            command.Parameters.AddWithValue("@course", assignment.Course ?? "");
            command.Parameters.AddWithValue("@section", assignment.Section ?? "");
            command.Parameters.AddWithValue("@schoolYear", assignment.SchoolYear ?? "2025-2026");
            command.Parameters.AddWithValue("@semester", assignment.Semester ?? "1st Semester");
            await command.ExecuteNonQueryAsync(ct);
        }

        foreach (var grade in snapshot.Grades)
        {
            const string sql = """
                INSERT INTO grades
                    (id, student_id, subject, score, feedback, teacher_id,
                     school_year, semester, term)
                VALUES
                    (@id, @studentId, @subject, @score, @feedback, @teacherId,
                     @schoolYear, @semester, @term)
                ON DUPLICATE KEY UPDATE
                    student_id = VALUES(student_id), subject = VALUES(subject),
                    score = VALUES(score), feedback = VALUES(feedback),
                    teacher_id = VALUES(teacher_id), school_year = VALUES(school_year),
                    semester = VALUES(semester), term = VALUES(term)
                """;
            await using var command = new MySqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue(
                "@id",
                grade.Id.HasValue ? grade.Id.Value : DBNull.Value);
            command.Parameters.AddWithValue("@studentId", grade.StudentId!.Trim());
            command.Parameters.AddWithValue("@subject", grade.Subject!.Trim());
            command.Parameters.AddWithValue("@score", grade.Score);
            command.Parameters.AddWithValue("@feedback", grade.Feedback ?? "");
            command.Parameters.AddWithValue(
                "@teacherId",
                string.IsNullOrWhiteSpace(grade.TeacherId) ? DBNull.Value : grade.TeacherId.Trim());
            command.Parameters.AddWithValue("@schoolYear", grade.SchoolYear ?? "2025-2026");
            command.Parameters.AddWithValue("@semester", grade.Semester ?? "1st Semester");
            command.Parameters.AddWithValue("@term", grade.Term ?? "Prelim");
            await command.ExecuteNonQueryAsync(ct);
        }

        await transaction.CommitAsync(ct);
        return Ok(new
        {
            message = "Backup snapshot restored",
            restored = new
            {
                users = snapshot.Users.Count,
                courses = snapshot.Courses.Count,
                subjects = snapshot.Subjects.Count,
                assignments = snapshot.Assignments.Count,
                grades = snapshot.Grades.Count
            }
        });
    }

    private static string? ValidateSnapshot(RestoreSnapshot snapshot)
    {
        if (snapshot.Users.Any(user =>
                string.IsNullOrWhiteSpace(user.Id) ||
                string.IsNullOrWhiteSpace(user.Email) ||
                !new EmailAddressAttribute().IsValid(user.Email) ||
                string.IsNullOrWhiteSpace(user.Name) ||
                user.Role?.Trim().ToLowerInvariant() is not ("admin" or "teacher" or "student") ||
                string.IsNullOrWhiteSpace(user.PasswordHash)))
        {
            return "Backup contains an invalid user record.";
        }

        if (snapshot.Courses.Any(course =>
                string.IsNullOrWhiteSpace(course.Code) ||
                string.IsNullOrWhiteSpace(course.Name)))
        {
            return "Backup contains an invalid course record.";
        }

        if (snapshot.Subjects.Any(subject =>
                string.IsNullOrWhiteSpace(subject.Name)))
        {
            return "Backup contains an invalid subject record.";
        }

        if (snapshot.Assignments.Any(assignment =>
                string.IsNullOrWhiteSpace(assignment.TeacherId) ||
                string.IsNullOrWhiteSpace(assignment.StudentId) ||
                string.IsNullOrWhiteSpace(assignment.Subject)))
        {
            return "Backup contains an invalid assignment record.";
        }

        if (snapshot.Grades.Any(grade =>
                string.IsNullOrWhiteSpace(grade.StudentId) ||
                string.IsNullOrWhiteSpace(grade.Subject) ||
                grade.Score is < 0 or > 100))
        {
            return "Backup contains an invalid grade record.";
        }

        return null;
    }

    private static (string FirstName, string LastName) SplitName(string name)
    {
        var parts = name.Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        return parts.Length == 1 ? (parts[0], "") : (parts[0], parts[1]);
    }

    private static bool IsPasswordHash(string value) =>
        value.StartsWith("p2$", StringComparison.Ordinal) ||
        value.StartsWith("pbkdf2_sha256$", StringComparison.Ordinal);
}
