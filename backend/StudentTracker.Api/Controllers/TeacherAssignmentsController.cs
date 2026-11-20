using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using StudentTracker.Api.Infrastructure;
namespace StudentTracker.Api.Controllers;
[ApiController]
[Route("api/teacher-assignments")]
[Authorize]
public sealed class TeacherAssignmentsController(DbConnectionFactory db)
    : ControllerBase
{
    public sealed record Input(
        string TeacherId,
        string StudentId,
        string Subject,
        string? Course,
        string? Section,
        string? SchoolYear,
        string? Semester);
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var role = User.FindFirstValue(ClaimTypes.Role);
        var uid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        await using var c = await db.OpenAsync(ct);
        var sql = @"
            SELECT id, teacher_id teacherId, student_id studentId, subject,
                   COALESCE(course, '') course,
                   COALESCE(section, '') section,
                   school_year schoolYear, semester
            FROM teacher_assignments";
        if (role == "teacher")
        {
            sql += " WHERE teacher_id = @uid";
        }
        else if (role == "student")
        {
            sql += " WHERE student_id = @uid";
        }
        sql += " ORDER BY school_year DESC, semester, subject";
        await using var q = new MySqlCommand(sql, c);
        if (role != "admin")
        {
            q.Parameters.AddWithValue("@uid", uid);
        }
        await using var r = await q.ExecuteReaderAsync(ct);
        var assignments = new List<object>();
        while (await r.ReadAsync(ct))
        {
            assignments.Add(new
            {
                id = r.GetInt32("id"),
                teacherId = r.GetString("teacherId"),
                studentId = r.GetString("studentId"),
                subject = r.GetString("subject"),
                course = r.GetString("course"),
                section = r.GetString("section"),
                schoolYear = r.GetString("schoolYear"),
                 semester = r.GetString("semester")
            });
        }
        return Ok(assignments);
    }
    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create(Input x, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(x.TeacherId) ||
            string.IsNullOrWhiteSpace(x.StudentId) ||
            string.IsNullOrWhiteSpace(x.Subject))
        {
            return BadRequest();
        }
        await using var c = await db.OpenAsync(ct);
        const string checkSql = @"
            SELECT COUNT(*) FROM users
            WHERE (id = @t AND role = 'teacher')
               OR (id = @s AND role = 'student')";
        await using (var check = new MySqlCommand(checkSql, c))
        {
            check.Parameters.AddWithValue("@t", x.TeacherId.Trim());
            check.Parameters.AddWithValue("@s", x.StudentId.Trim());
            if (Convert.ToInt32(await check.ExecuteScalarAsync(ct)) != 2)
            {
                return BadRequest(
                    new { message = "Choose existing teacher and student accounts." });
            }
        }
        const string insertSql = @"
            INSERT INTO teacher_assignments
                (teacher_id, student_id, subject, course, section,
                 school_year, semester)
            VALUES
                (@t, @s, @sub, @course, @section, @year, @sem)";
        await using var q = new MySqlCommand(insertSql, c);
        q.Parameters.AddWithValue("@t", x.TeacherId.Trim());
        q.Parameters.AddWithValue("@s", x.StudentId.Trim());
        q.Parameters.AddWithValue("@sub", x.Subject.Trim());
        q.Parameters.AddWithValue("@course", x.Course ?? "");
        q.Parameters.AddWithValue("@section", x.Section ?? "");
        q.Parameters.AddWithValue("@year", x.SchoolYear ?? "2025-2026");
        q.Parameters.AddWithValue("@sem", x.Semester ?? "1st Semester");
        try
        {
            await q.ExecuteNonQueryAsync(ct);
        }
        catch (MySqlException e) when (e.Number == 1062)
        {
            return Conflict(new { message = "Assignment already exists." });
        }
        return Created(
            "/api/teacher-assignments",
            new
            {
                id = q.LastInsertedId,
                teacherId = x.TeacherId,
                studentId = x.StudentId,
                   subject = x.Subject,
                course = x.Course,
                section = x.Section,
                schoolYear = x.SchoolYear,
                semester = x.Semester
            });
    }
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await using var c = await db.OpenAsync(ct);
        await using var q = new MySqlCommand(
            "DELETE FROM teacher_assignments WHERE id = @id",
            c);
        q.Parameters.AddWithValue("@id", id);
    }
}
        return await q.ExecuteNonQueryAsync(ct) == 0
            ? NotFound()
            : Ok(new { ok = true });
