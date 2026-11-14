using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using StudentTracker.Api.Infrastructure;

namespace StudentTracker.Api.Controllers;
[ApiController]
[Route("api/courses")]
[Authorize]

public sealed class CoursesController(DbConnectionFactory db) : ControllerBase
{
    public sealed record Input(
        [Required] string Code,
        [Required] string Name,
        string? Description,
        string? SchoolYear,
        string? Semester,
        string? TeacherId);
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        await using var c = await db.OpenAsync(ct);
        const string sql = @"
            SELECT id, code, name, COALESCE(description, '') description,
                   school_year schoolYear, semester, teacher_id teacherId
            FROM courses
            ORDER BY name";
        await using var q = new MySqlCommand(sql, c);
        await using var r = await q.ExecuteReaderAsync(ct);
        var courses = new List<object>();
        while (await r.ReadAsync(ct))
        {
            courses.Add(new
            {
                id = r.GetInt32("id"),
                code = r.GetString("code"),
                name = r.GetString("name"),
                description = r.GetString("description"),
                schoolYear = r.GetString("schoolYear"),
                semester = r.GetString("semester"),
                teacherId = r.IsDBNull(r.GetOrdinal("teacherId"))
                    ? null
                    : r.GetString("teacherId")
            });
        }
        return Ok(courses);
    }
    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create(Input x, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest();
        }
        await using var c = await db.OpenAsync(ct);
        await using var q = Bind(
            c, 
             x,
            @"INSERT INTO courses
                (code, name, description, school_year, semester, teacher_id)
              VALUES
                (@code, @name, @d, @y, @s, @t)");
        try
        {
            await q.ExecuteNonQueryAsync(ct);
        }
        catch (MySqlException e) when (e.Number == 1062)
        {
            return Conflict(new { message = "Course code already exists." });
        }
        return Created(
            "/api/courses",
            new
            {
                id = q.LastInsertedId,
                code = x.Code,
                name = x.Name,
                description = x.Description,
                schoolYear = x.SchoolYear,
                semester = x.Semester,
                teacherId = x.TeacherId
            });
    }
    [HttpPut("{id:int}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(int id, Input x, CancellationToken ct)
    {
        if (id <= 0 || !ModelState.IsValid)
        {
            return BadRequest();
        }
        await using var c = await db.OpenAsync(ct);
        await using var q = Bind(
            c,
            x,
            @"UPDATE courses
              SET code = @code, name = @name, description = @d,
                  school_year = @y, semester = @s, teacher_id = @t
              WHERE id = @id");
        q.Parameters.AddWithValue("@id", id);
        try
        {
            return await q.ExecuteNonQueryAsync(ct) == 0
                ? NotFound()
                : NoContent();
        }
        catch (MySqlException e) when (e.Number == 1062)
        {
            return Conflict(new { message = "Course code already exists." });
        }
    }
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await using var c = await db.OpenAsync(ct);
         await using var q = new MySqlCommand(
            "DELETE FROM courses WHERE id = @id",
            c);
        q.Parameters.AddWithValue("@id", id);
        return await q.ExecuteNonQueryAsync(ct) == 0
            ? NotFound()
            : Ok(new { ok = true });
    }
    private static MySqlCommand Bind(MySqlConnection c, Input x, string sql)
    {
        var q = new MySqlCommand(sql, c);
        q.Parameters.AddWithValue("@code", x.Code.Trim().ToUpperInvariant());
        q.Parameters.AddWithValue("@name", x.Name.Trim());
        q.Parameters.AddWithValue("@d", x.Description ?? "");
        q.Parameters.AddWithValue("@y", x.SchoolYear ?? "2025-2026");
        q.Parameters.AddWithValue("@s", x.Semester ?? "1st Semester");
        q.Parameters.AddWithValue(
            "@t",
            string.IsNullOrWhiteSpace(x.TeacherId)
                ? DBNull.Value
                : x.TeacherId.Trim());
        return q;
    }
}