using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using StudentTracker.Api.Infrastructure;

namespace StudentTracker.Api.Controllers;

[ApiController]
[Route("api/grades")]
[Authorize]
public sealed class GradesController(DbConnectionFactory db) : ControllerBase
{
    public sealed record Input(
        [Required] string StudentId,
        [Required] string Subject,
        decimal Score,
        string? Feedback,
        string? SchoolYear,
        string? Semester,
        string? Term);

    public sealed record UpdateInput(
        [Required] string Subject,
        decimal Score,
        string? Feedback,
        string? SchoolYear,
        string? Semester,
        string? Term);

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";

    private string Role => User.FindFirstValue(ClaimTypes.Role) ?? "";

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var sql = """
            SELECT g.id, g.student_id AS studentId,
                   COALESCE(u.name, TRIM(CONCAT_WS(' ', u.firstname, u.lastname))) AS studentName,
                   COALESCE(g.subject, '') AS subject, g.score,
                   COALESCE(g.feedback, '') AS feedback,
                   g.teacher_id AS teacherId,
                   g.school_year AS schoolYear, g.semester, g.term
            FROM grades g
            JOIN users u ON u.id = g.student_id
            """;

        if (Role == "student")
        {
            sql += " WHERE g.student_id = @uid";
        }
        else if (Role == "teacher")
        {
            sql += " " + """
                 WHERE g.teacher_id = @uid
                    OR g.student_id IN (
                        SELECT student_id FROM teacher_assignments WHERE teacher_id = @uid
                    )
                """;
        }

        sql += " ORDER BY g.id DESC";

        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand(sql, connection);
        if (Role != "admin")
        {
            command.Parameters.AddWithValue("@uid", UserId);
        }

        await using var reader = await command.ExecuteReaderAsync(ct);
        var grades = new List<object>();
        while (await reader.ReadAsync(ct))
        {
            grades.Add(new
            {
                id = reader.GetInt32("id"),
                studentId = reader.GetString("studentId"),
                studentName = reader.GetString("studentName"),
                subject = reader.GetString("subject"),
                score = reader.GetDecimal("score"),
                feedback = reader.GetString("feedback"),
                teacherId = reader.IsDBNull(reader.GetOrdinal("teacherId"))
                    ? null
                    : reader.GetString("teacherId"),
                schoolYear = reader.GetString("schoolYear"),
                semester = reader.GetString("semester"),
                term = reader.GetString("term")
            });
        }

        return Ok(grades);
    }

    [HttpPost]
    [Authorize(Roles = "admin,teacher")]
    public async Task<IActionResult> Create(Input input, CancellationToken ct)
    {
        var error = Validate(input.StudentId, input.Subject, input.Score, input.Feedback);
        if (error is not null)
        {
            return BadRequest(new { message = error });
        }

        await using var connection = await db.OpenAsync(ct);
        if (Role == "teacher" &&
            !await IsAssigned(connection, input.StudentId, input.Subject, ct))
        {
            return Forbid();
        }

        const string sql = """
            INSERT INTO grades
                (student_id, subject, score, feedback, teacher_id,
                 school_year, semester, term)
            VALUES
                (@student, @subject, @score, @feedback, @teacher,
                 @schoolYear, @semester, @term)
            """;

        await using var command = Build(connection, input, sql);
        command.Parameters.AddWithValue(
            "@teacher",
            Role == "teacher" ? UserId : DBNull.Value);
        await command.ExecuteNonQueryAsync(ct);

        return Created(
            "/api/grades",
            new
            {
                id = command.LastInsertedId,
                studentId = input.StudentId,
                subject = input.Subject.Trim(),
                score = input.Score,
                feedback = input.Feedback ?? "",
                teacherId = Role == "teacher" ? UserId : null,
                schoolYear = input.SchoolYear ?? "2025-2026",
                semester = input.Semester ?? "1st Semester",
                term = input.Term ?? "Prelim"
            });
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "admin,teacher")]
    public async Task<IActionResult> Update(int id, UpdateInput input, CancellationToken ct)
    {
        if (id <= 0)
        {
            return BadRequest();
        }

        await using var connection = await db.OpenAsync(ct);
        string studentId;
        string? teacherId;
        await using (var findGrade = new MySqlCommand(
            "SELECT student_id, teacher_id FROM grades WHERE id = @id",
            connection))
        {
            findGrade.Parameters.AddWithValue("@id", id);
            await using var reader = await findGrade.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct))
            {
                return NotFound(new { message = "Grade not found." });
            }

            studentId = reader.GetString("student_id");
            teacherId = reader.IsDBNull(reader.GetOrdinal("teacher_id"))
                ? null
                : reader.GetString("teacher_id");
        }

        var error = Validate(studentId, input.Subject, input.Score, input.Feedback);
        if (error is not null)
        {
            return BadRequest(new { message = error });
        }

        if (Role == "teacher" &&
            (teacherId != UserId ||
             !await IsAssigned(connection, studentId, input.Subject, ct)))
        {
            return Forbid();
        }

        var sql = """
            UPDATE grades
            SET subject = @subject, score = @score,
                feedback = @feedback, school_year = @schoolYear,
                semester = @semester, term = @term
            WHERE id = @id
            """;
        if (Role == "teacher")
        {
            sql += " AND teacher_id = @teacher";
        }

        await using var command = BuildUpdate(connection, input, sql);
        command.Parameters.AddWithValue("@id", id);
        if (Role == "teacher")
        {
            command.Parameters.AddWithValue("@teacher", UserId);
        }

        await command.ExecuteNonQueryAsync(ct);
        var updatedGrade = await ReadGrade(connection, id, ct);
        return updatedGrade is null
            ? NotFound(new { message = "Grade not found." })
            : Ok(updatedGrade);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "admin,teacher")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var sql = "DELETE FROM grades WHERE id = @id";
        if (Role == "teacher")
        {
            sql += " AND teacher_id = @teacher";
        }

        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@id", id);
        if (Role == "teacher")
        {
            command.Parameters.AddWithValue("@teacher", UserId);
        }

        return await command.ExecuteNonQueryAsync(ct) == 0
            ? NotFound(new { message = "Grade not found." })
            : Ok(new { ok = true });
    }

    private string? Validate(
        string studentId,
        string subject,
        decimal score,
        string? feedback)
    {
        if (string.IsNullOrWhiteSpace(studentId) ||
            string.IsNullOrWhiteSpace(subject))
        {
            return "Student and subject are required.";
        }

        if (Role == "teacher" && (score < 1m || score > 5m))
        {
            return "Teacher grade must be between 1.0 and 5.0.";
        }

        if (Role == "admin" && (score < 0m || score > 100m))
        {
            return "Admin score must be between 0 and 100.";
        }

        if (feedback?.Length > 2000)
        {
            return "Feedback is too long.";
        }

        return null;
    }

    private async Task<bool> IsAssigned(
        MySqlConnection connection,
        string studentId,
        string subject,
        CancellationToken ct)
    {
        const string sql = """
            SELECT COUNT(*)
            FROM teacher_assignments
            WHERE teacher_id = @teacher AND student_id = @student AND subject = @subject
            """;

        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@teacher", UserId);
        command.Parameters.AddWithValue("@student", studentId.Trim());
        command.Parameters.AddWithValue("@subject", subject.Trim());
        return Convert.ToInt32(await command.ExecuteScalarAsync(ct)) > 0;
    }

    private static MySqlCommand Build(
        MySqlConnection connection,
        Input input,
        string sql)
    {
        var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@student", input.StudentId.Trim());
        command.Parameters.AddWithValue("@subject", input.Subject.Trim());
        command.Parameters.AddWithValue("@score", input.Score);
        command.Parameters.AddWithValue("@feedback", input.Feedback ?? "");
        command.Parameters.AddWithValue("@schoolYear", input.SchoolYear ?? "2025-2026");
        command.Parameters.AddWithValue("@semester", input.Semester ?? "1st Semester");
        command.Parameters.AddWithValue("@term", input.Term ?? "Prelim");
        return command;
    }

    private static MySqlCommand BuildUpdate(
        MySqlConnection connection,
        UpdateInput input,
        string sql)
    {
        var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@subject", input.Subject.Trim());
        command.Parameters.AddWithValue("@score", input.Score);
        command.Parameters.AddWithValue("@feedback", input.Feedback ?? "");
        command.Parameters.AddWithValue("@schoolYear", input.SchoolYear ?? "2025-2026");
        command.Parameters.AddWithValue("@semester", input.Semester ?? "1st Semester");
        command.Parameters.AddWithValue("@term", input.Term ?? "Prelim");
        return command;
    }

    private static async Task<object?> ReadGrade(
        MySqlConnection connection,
        int id,
        CancellationToken ct)
    {
        const string sql = """
            SELECT g.id, g.student_id AS studentId,
                   COALESCE(u.name, TRIM(CONCAT_WS(' ', u.firstname, u.lastname))) AS studentName,
                   COALESCE(g.subject, '') AS subject, g.score,
                   COALESCE(g.feedback, '') AS feedback,
                   g.teacher_id AS teacherId,
                   g.school_year AS schoolYear, g.semester, g.term
            FROM grades g
            JOIN users u ON u.id = g.student_id
            WHERE g.id = @id
            """;

        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@id", id);
        await using var reader = await command.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return null;
        }

        return new
        {
            id = reader.GetInt32("id"),
            studentId = reader.GetString("studentId"),
            studentName = reader.GetString("studentName"),
            subject = reader.GetString("subject"),
            score = reader.GetDecimal("score"),
            feedback = reader.GetString("feedback"),
            teacherId = reader.IsDBNull(reader.GetOrdinal("teacherId"))
                ? null
                : reader.GetString("teacherId"),
            schoolYear = reader.GetString("schoolYear"),
            semester = reader.GetString("semester"),
            term = reader.GetString("term")
        };
    }
}
