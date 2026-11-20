using System.ComponenetModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using StudentTracker.Api.Infrastructure;

namespace StudentTracker.Api.Controllers;

[ApiController]
[Route("api/subjects")]
[Authorize]

public sealed class SubjectsController(DbConnectFactory db) : ControllerBase
{
    public sealed record Input(
        [Required] string Name,
        [Required] string TeacherId);
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        await using var c = await db.OpenAsync(ct);
        const string sql = @"
            SELECT subject_id id, subject_name name, teacher_id teacherId
            FROM subjects
            ORDER BY subject_name";
        await using var q = new MySqlCommand(sql, c);
        await using var r = await q.ExecuteReaderAsync(ct);
        var subjects = new List<object>();
        while (await r.ReadAsync(ct))
        {
            subjects.Add(new
            {
                id = r.GetInt32("id"),
                name = r.GetString("name"),
                teacherId = r.IsDBNull(r.GetOrdinal("teacherId"))
                    ? null
                    : r.GetString("teacherId")
            });
        }
        return Ok(subjects);
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
        const string checkSql =
            "SELECT COUNT(*) FROM users WHERE id = @id AND role = 'teacher'";
        await using (var check = new MySqlCommand(checkSql, c))
        {
            check.Parameters.AddWithValue("@id", x.TeacherId);
            if (Convert.ToInt32(await check.ExecuteScalarAsync(ct)) == 0)
            {
                return BadRequest(
                    new { message = "Choose an existing teacher." });
            }
        }
 await using var q = new MySqlCommand(
            "INSERT INTO subjects (subject_name, teacher_id) " +
            "VALUES (@name, @teacher)",
            c);
        q.Parameters.AddWithValue("@name", x.Name.Trim());
        q.Parameters.AddWithValue("@teacher", x.TeacherId.Trim());
        await q.ExecuteNonQueryAsync(ct);
        return Created(
            "/api/subjects",
            new
            {
                id = q.LastInsertedId,
                name = x.Name.Trim(),
                teacherId = x.TeacherId.Trim()
            });
    }
}
