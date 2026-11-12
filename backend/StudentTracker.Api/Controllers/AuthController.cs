using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using StudentTracker.Api.Infrastructure;
using StudentTracker.Api.Security;

namespace StudentTracker.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class AuthController(DbConnectionFactory db) : ControllerBase
{
    public sealed record LoginInput(
        [Required] string Identifier,
        [Required] string Password,
        [Required] string Role);

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginInput input, CancellationToken cancellationToken)
    {
        var role = input.Role?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(input.Identifier) ||
            string.IsNullOrWhiteSpace(input.Password) ||
            role is not ("admin" or "teacher" or "student"))
        {
            return BadRequest(new { message = "Required login fields are missing or invalid." });
        }

        // The selected column is limited to these two fixed values; user input remains parameterized.
        var identifierColumn = role == "student" ? "id" : "email";
        await using var connection = await db.OpenAsync(cancellationToken);
        var sql = $"""
            SELECT id, email,
                   COALESCE(name, TRIM(CONCAT_WS(' ', firstname, lastname))) AS name,
                   role, password
            FROM users
            WHERE {identifierColumn} = @identifier AND role = @role
            LIMIT 1
            """;

        string id;
        string email;
        string name;
        string storedPassword;
        await using (var command = new MySqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("@identifier", input.Identifier.Trim());
            command.Parameters.AddWithValue("@role", role);

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return Unauthorized(new { message = "Invalid credentials." });
            }

            storedPassword = reader.GetString("password");
            if (!PasswordHash.Verify(input.Password, storedPassword))
            {
                return Unauthorized(new { message = "Invalid credentials." });
            }

            id = reader.GetString("id");
            email = reader.GetString("email");
            name = reader.IsDBNull(reader.GetOrdinal("name"))
                ? ""
                : reader.GetString("name");
        }

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, id),
            new Claim(ClaimTypes.Name, name),
            new Claim(ClaimTypes.Email, email),
            new Claim(ClaimTypes.Role, role)
        };
        var identity = new ClaimsIdentity(
            claims,
            CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity));

        return Ok(new { id, email, name, role });
    }

    [Authorize]
    [HttpGet("session")]
    public IActionResult Session() =>
        Ok(new
        {
            id = User.FindFirstValue(ClaimTypes.NameIdentifier),
            name = User.Identity?.Name,
            role = User.FindFirstValue(ClaimTypes.Role)
        });

    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(
            CookieAuthenticationDefaults.AuthenticationScheme);
        return Ok(new { ok = true });
    }
}