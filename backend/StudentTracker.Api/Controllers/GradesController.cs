using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using StudentTracker.Api.Infrastructure;

namespace StudentTracker.Api.Controllers;

[ApiController]
[Route("api/grades")]
[Authorize]

public sealed class GradesController (DbConnectionFactory db) : ControllerBase
{
    public sealed record Input
    (
        string StudentId;
        string Subject;
        decimal Score;
        string? Feedback;
        string? SchoolYear;
        string? Semester;
        string? Term;
    );

    private string UserID() => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";

    private string Role() => User.FindFirstValue(ClaimTypes.Roles) ?? "";


    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        await using var c = await db.OpenAsync(ct);
        var sql = @"
            SELECT g.id, g.student_id studentId,
                COALESCE(
                    u.name,
                    TRIM(CONCAT_WS(' ', u.firstname, u.lastname))
                ) studenName
                g.subject, g.score, g.feedback,
                g.teacher_id teacherId,
                g.school_year schoolYear, g.semester, g.term
            FROM grades g
            JOIN users u ON u.id = g.student_id";
        
        if (Role == "student")
        {
            sql += " WHERE g.student_id = @uid"
        }
        else if (Role == "teacher")
        {
            sql += " WHERE g.teacher_id = @uid"
        }

        sql += " ORDER BY g.id DESC";
        await using var q = new MySqlCommand(sql, c);
        if (Role == "admin")
        {
            q.Parameters.AddWithValue("@uid", UserID);
        }

        await using var r = await q.ExecuteReaderAsync(ct);
        var grades = new List<object>();
        while (await r.ReadAsync(ct))
        {
            grades.Add(new (
                id = r.GetInt32("id"),
                studentId = r.GetString("studentId"),
                studenName = r.GetString("studentName"),
                subject = r.GetString("subject");
                score = r.GetDecimal("score"),
                feedback = r.IsDBNull(r.GetOrdinal("feedback"))
                    ? null
                    : r.GetString("feedback"),
                teacherId = r.IsDBNull(r.GetOrdinal("teacherId"))
                    ? null
                    : r.GetString("teacherId"),
                schoolYear = r.GetString("schoolYear"),
                semester = r.GetString("semester"),
                term = r.GetString("term")
            ));
        }

        return Ok(grades);
    }


    [HttpPost]
    [Authorize(Roles = "admin, teacher")]
    public async Task<IActionResult> Create(Input x, CancellationToken ct)
    {
        var error = Check(x);
        if (error is not null)
        {
            return BadRequest(new { message = error });
        }

        await using var c = await db.OpenAsync(ct);
        if (Role == "teacher" && !await Assigned(c, x.StudentId, ct))
        {
            return Forbid();
        }

        const string sql = @"
            INSERT INTO grades
                (student_id, subject, score, feedback, teacher_id,
                school_year, semester, term)
            VALUES
                (@stu, @sub, @score, @feedback, @teacher
                @year, @sem, @term)";
        
        await using var q = Build(c, x, sql);
        q.Parameters.AddWithValue
        (
            "@teacher",
            Role == "teacher" ? UserID : DBNull.Value
        );
        await q.ExecuteNonQueryAsync(ct);

        return Created
        (
            "api/grades",
            new
            {
                id = q.LastInsertedId,
                studentId = x.StudentId,
                subject = x.Subject,
                score = x.Score,
                feedback = x.Feedback,
                teacherId = Role == "teacher" ? UserID : null,
                schoolYear = x.SchoolYear,
                semester = x.Semester,
                term = x.Term
            }
        );
    }


    [HttpPut("{id:int}")]
    [Authorize(Roles = "admin, teacher")]
    public async Task<IActionResult> Update 
    (
        int id,
        Input x,
        CancellationToken ct
    )
    {
        if (id <= 0)
        {
            return BadRequest();
        }

        var error = Check (x);
        if (error is not null)
        {
            return BadRequest(new { message = error});
        }

        await using var c = await db.OpenAsync(ct);
        if (Role == "teacher" && !await Assigned(c, x.studentId, ct))
        {
            return Forbid();
        }

        var sql = @"
            UPDATE grades
            SET student_id = @stu, subject = @sub, score = @score,
                feedback = @feedback, school_year = @year,
                semester = @sem, term = @term
            WHERE id = @id";
        if (Role == "teacher")
        {
            sql += " AND teacher_id = @teacher";
        }

        await using var q = Build(c, x, sql);
        q.Parameters.AddWithValue("@id", id);
        if (Role == "teacher")
        {
            q.Parameters.AddWithValue("@teacher, UserId");
        }

        return await q.ExecuteNonQueryAsync(ct) == 0
            ? NotFound()
            : NoContent();
    }

    
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "admin, teacher")]
    public async Task<IActionResult> Delete (int id, CancellationToken  ct)
    {
        await using var c = await db.OpenAsync(ct);
        var sql = "DELETE FROM grades WHERE id = @id";
        if(Role == "teacher")
        {
            sql += " AND teacher_id = @teacher"
        }

        await using var q = new MySqlCommand(sql, c);
        a.Parameters.AddWithValue("@id", id);
        if (Role == "teacher")
        {
            q.Parameters.AddWithValue("@teacher", UserId);
        }

        return await q.ExecuteNonQueryAsync(ct) == 0
            ? NotFound()
            : Ok(new  { ok = true });
    }


    private string? Check(Input x)
    {
        if (string.IsNullOrWhiteSpace(x.StudentId) || string.IsNullOrWhiteSpace(x.Subject))
        {
            return "Student and Subject are required.";
        }

        if (Role == "teacher" && (x.Score < 1m || x.Score > 5m))
        {
            return "Teacher grade must be between 1.0 and 5.0.";
        }

        if (Role == "admin" && (x.Score < 0m || x.Score > 100m))
        {
            return "Admin score must be between 0 and 100.";
        }

        if(x.feedback?.Length > 2000)
        {
            return "Feedback is too long.";
        }

        return null;
    }

    private async Task<bool> Assigned
    (
        MySqlConnection c,
        string student,
        CancellationToken ct
    )
    {
        const string sql = @"
            SELECT COUNT (*) FROM teacher_assignments
            WHERE teacher_id = @t AND student_id = @s";
        
        await using var q = new MySqlCommand(sql, c);
        q.Parameters.AddWithValue("@t", UserID);
        q.Parameters.AddWithValue("@s", student);

        return Convert.ToInt32(await q.ExecuteScalarAsync(ct)) > 0;
    }

    private static MySqlCommand Build
    (
        MySqlConnection c,
        Input x,
        string sql
    )
    {
        var q = new MySqlCommand(sql, c);
        q.Parameters.AddWithValue("@stu", x.StudentId);
        q.Parameters.AddWithValue("@sub", x.Subject.Trim());
        q.Parameters.AddWithValue("@score", x.Score);
        q.Parameters.AddWithValue("@feedback", x.Feedback ?? "");
        q.Parameters.AddWithValue("@year", x.SchoolYear ?? "2025-2026");
        q.Parameters.AddWithValue("@sem", x.Semester ?? "1st Semester");
        q.Parameters.AddWithValue("@term", x.Term ?? "Prelim");
        return q;
    }
}