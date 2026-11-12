using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using StudentTracker.Api.Infrastructure;
using StudentTracker.Api.Security;

namespace StudentTracker.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public sealed class UsersController(DbConnectionFactory db) : ControllerBase
{
    public sealed record NewUser(
        [Required] string Id,
        [Required, EmailAddress] string Email,
        string? FirstName,
        string? LastName,
        [Required] string Role,
        string? Course,
        string? SchoolYear,
        string? Semester,
        [Required, MinLength(8)] string Password);

    public sealed record EditUser(
        [Required, EmailAddress] string Email,
        string? FirstName,
        string? LastName,
        [Required] string Role,
        string? Course,
        string? SchoolYear,
        string? Semester);

    public sealed record PasswordInput([Required, MinLength(8)] string Password);

    [HttpGet]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> List([FromQuery] string? role, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        const string sql = """
            SELECT id, email, firstname, lastname,
                   COALESCE(name, TRIM(CONCAT_WS(' ', firstname, lastname))) AS name,
                   role, COALESCE(course, '') AS course,
                   COALESCE(school_year, '') AS schoolYear,
                   COALESCE(semester, '') AS semester
            FROM users
            WHERE (@role IS NULL OR role = @role)
            ORDER BY name
            """;

        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue(
            "@role",
            string.IsNullOrWhiteSpace(role) ? DBNull.Value : role.Trim().ToLowerInvariant());

        await using var reader = await command.ExecuteReaderAsync(ct);
        var users = new List<object>();

        while (await reader.ReadAsync(ct))
        {
            users.Add(new
            {
                id = reader.GetString("id"),
                email = reader.GetString("email"),
                firstName = reader.IsDBNull(reader.GetOrdinal("firstname"))
                    ? ""
                    : reader.GetString("firstname"),
                lastName = reader.IsDBNull(reader.GetOrdinal("lastname"))
                    ? ""
                    : reader.GetString("lastname"),
                name = reader.GetString("name"),
                role = reader.GetString("role"),
                course = reader.GetString("course"),
                schoolYear = reader.GetString("schoolYear"),
                semester = reader.GetString("semester")
            });
        }

        return Ok(users);
    }

    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create(NewUser input, CancellationToken ct)
    {
        if (!ModelState.IsValid ||
            input.Role is not ("admin" or "teacher" or "student") ||
            string.IsNullOrWhiteSpace(input.Id) ||
            string.IsNullOrWhiteSpace(input.Password))
        {
            return BadRequest(new { message = "Check the required fields and role." });
        }

        var firstName = input.FirstName?.Trim() ?? "";
        var lastName = input.LastName?.Trim() ?? "";
        var fullName = (firstName + " " + lastName).Trim();

        await using var connection = await db.OpenAsync(ct);
        const string sql = """
            INSERT INTO users
                (id, email, firstname, lastname, name, role, password,
                 course, school_year, semester)
            VALUES
                (@id, @email, @firstName, @lastName, @name, @role, @password,
                 @course, @schoolYear, @semester)
            """;

        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@id", input.Id.Trim());
        command.Parameters.AddWithValue("@email", input.Email.Trim().ToLowerInvariant());
        command.Parameters.AddWithValue("@firstName", firstName);
        command.Parameters.AddWithValue("@lastName", lastName);
        command.Parameters.AddWithValue("@name", fullName);
        command.Parameters.AddWithValue("@role", input.Role);
        command.Parameters.AddWithValue("@password", PasswordHash.Create(input.Password));
        command.Parameters.AddWithValue("@course", input.Course ?? "");
        command.Parameters.AddWithValue("@schoolYear", input.SchoolYear ?? "2025-2026");
        command.Parameters.AddWithValue("@semester", input.Semester ?? "1st Semester");

        try
        {
            await command.ExecuteNonQueryAsync(ct);
        }
        catch (MySqlException ex) when (ex.Number == 1062)
        {
            return Conflict(new { message = "That ID or email already exists." });
        }

        return Created(
            "/api/users",
            new
            {
                id = input.Id.Trim(),
                email = input.Email.Trim(),
                firstName,
                lastName,
                name = fullName,
                role = input.Role,
                course = input.Course,
                schoolYear = input.SchoolYear,
                semester = input.Semester
            });
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(string id, EditUser input, CancellationToken ct)
    {
        if (!ModelState.IsValid || input.Role is not ("admin" or "teacher" or "student"))
        {
            return BadRequest(new { message = "Check the required fields and role." });
        }

        var firstName = input.FirstName?.Trim() ?? "";
        var lastName = input.LastName?.Trim() ?? "";
        var fullName = (firstName + " " + lastName).Trim();

        await using var connection = await db.OpenAsync(ct);
        const string sql = """
            UPDATE users
            SET email = @email, firstname = @firstName, lastname = @lastName,
                name = @name, role = @role, course = @course,
                school_year = @schoolYear, semester = @semester
            WHERE id = @id
            """;

        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@email", input.Email.Trim().ToLowerInvariant());
        command.Parameters.AddWithValue("@firstName", firstName);
        command.Parameters.AddWithValue("@lastName", lastName);
        command.Parameters.AddWithValue("@name", fullName);
        command.Parameters.AddWithValue("@role", input.Role);
        command.Parameters.AddWithValue("@course", input.Course ?? "");
        command.Parameters.AddWithValue("@schoolYear", input.SchoolYear ?? "2025-2026");
        command.Parameters.AddWithValue("@semester", input.Semester ?? "1st Semester");
        command.Parameters.AddWithValue("@id", id);

        try
        {
            if (await command.ExecuteNonQueryAsync(ct) == 0)
            {
                return NotFound(new { message = "User not found." });
            }
        }
        catch (MySqlException ex) when (ex.Number == 1062)
        {
            return Conflict(new { message = "That email already exists." });
        }

        return NoContent();
    }

    [HttpPost("{id}/reset-password")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> ResetPassword(
        string id,
        PasswordInput input,
        CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }

        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand(
            "UPDATE users SET password = @password WHERE id = @id",
            connection);
        command.Parameters.AddWithValue("@password", PasswordHash.Create(input.Password));
        command.Parameters.AddWithValue("@id", id);

        return await command.ExecuteNonQueryAsync(ct) == 0
            ? NotFound(new { message = "User not found." })
            : Ok(new { ok = true });
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        if (User.FindFirstValue(ClaimTypes.NameIdentifier) == id)
        {
            return BadRequest(new { message = "You cannot delete the account currently signed in." });
        }

        await using var connection = await db.OpenAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);

        try
        {
            string? targetRole;
            await using (var findUser = new MySqlCommand(
                "SELECT role FROM users WHERE id = @id FOR UPDATE",
                connection,
                transaction))
            {
                findUser.Parameters.AddWithValue("@id", id);
                targetRole = await findUser.ExecuteScalarAsync(ct) as string;
            }

            if (targetRole is null)
            {
                return NotFound(new { message = "User not found." });
            }

            if (targetRole == "admin")
            {
                await using var countAdmins = new MySqlCommand(
                    "SELECT COUNT(*) FROM users WHERE role = 'admin'",
                    connection,
                    transaction);

                if (Convert.ToInt32(await countAdmins.ExecuteScalarAsync(ct)) <= 1)
                {
                    return BadRequest(new { message = "The last admin account cannot be deleted." });
                }
            }

            string[] cleanupSql =
            [
                "DELETE FROM grades WHERE student_id = @id",
                "UPDATE grades SET teacher_id = NULL WHERE teacher_id = @id",
                "UPDATE subjects SET teacher_id = NULL WHERE teacher_id = @id",
                "UPDATE courses SET teacher_id = NULL WHERE teacher_id = @id",
                "DELETE FROM teacher_assignments WHERE teacher_id = @id OR student_id = @id",
                "DELETE FROM users WHERE id = @id"
            ];

            foreach (var sql in cleanupSql)
            {
                await using var command = new MySqlCommand(sql, connection, transaction);
                command.Parameters.AddWithValue("@id", id);
                await command.ExecuteNonQueryAsync(ct);
            }

            await transaction.CommitAsync(ct);
            return Ok(new { ok = true });
        }
        catch
        {
            await transaction.RollbackAsync(ct);
            throw;
        }
    }
}