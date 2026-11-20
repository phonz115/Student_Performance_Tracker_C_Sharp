using System.ComponentModel.DataAnnotations;
using System.Net;
using System.Net.Mail;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MySqlConnector;
using StudentTracker.Api.Infrastructure;
using StudentTracker.Api.Security;

namespace StudentTracker.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class AuthController(
    DbConnectionFactory db,
    IConfiguration configuration,
    IWebHostEnvironment environment,
    ILogger<AuthController> logger) : ControllerBase
{
    private static readonly TimeSpan ResetTokenLifetime = TimeSpan.FromMinutes(20);

    public sealed record LoginInput(
        [Required] string Identifier,
        [Required] string Password,
        [Required] string Role);

    public sealed record PasswordResetRequest(
        [Required] string Identifier,
        [Required] string Role);

    public sealed record PasswordResetConfirmation(
        [Required] string Token,
        [Required, MinLength(8)] string Password,
        [Required] string ConfirmPassword);

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
                   role, password, COALESCE(course, '') AS course,
                   COALESCE(school_year, '') AS schoolYear,
                   COALESCE(semester, '') AS semester
            FROM users
            WHERE {identifierColumn} = @identifier AND role = @role
            LIMIT 1
            """;

        string id;
        string email;
        string name;
        string storedPassword;
        string course;
        string schoolYear;
        string semester;
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
            course = reader.GetString("course");
            schoolYear = reader.GetString("schoolYear");
            semester = reader.GetString("semester");
        }

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, id),
            new Claim(ClaimTypes.Name, name),
            new Claim(ClaimTypes.Email, email),
            new Claim(ClaimTypes.Role, role),
            new Claim("course", course),
            new Claim("schoolYear", schoolYear),
            new Claim("semester", semester)
        };
        var identity = new ClaimsIdentity(
            claims,
            CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity));

        return Ok(new { id, email, name, role, course, schoolYear, semester });
    }

    [Authorize]
    [HttpGet("session")]
    public IActionResult Session() =>
        Ok(new
        {
            id = User.FindFirstValue(ClaimTypes.NameIdentifier),
            name = User.Identity?.Name,
            email = User.FindFirstValue(ClaimTypes.Email),
            role = User.FindFirstValue(ClaimTypes.Role),
            course = User.FindFirstValue("course") ?? "",
            schoolYear = User.FindFirstValue("schoolYear") ?? "",
            semester = User.FindFirstValue("semester") ?? ""
        });

    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(
            CookieAuthenticationDefaults.AuthenticationScheme);
        return Ok(new { ok = true });
    }

    [AllowAnonymous]
    [EnableRateLimiting("password-reset")]
    [HttpPost("password-reset/request")]
    public async Task<IActionResult> RequestPasswordReset(
        PasswordResetRequest input,
        CancellationToken ct)
    {
        var identifier = input.Identifier.Trim();
        var role = input.Role.Trim().ToLowerInvariant();
        if (identifier.Length == 0 || role is not ("admin" or "teacher" or "student"))
        {
            return BadRequest(new { message = "Identifier and valid role are required." });
        }

        var smtpUser = Environment.GetEnvironmentVariable("SMTP_USER")
            ?? configuration["SMTP_USER"];
        var smtpPassword = Environment.GetEnvironmentVariable("SMTP_APP_PASSWORD")
            ?? configuration["SMTP_APP_PASSWORD"];
        if (string.IsNullOrWhiteSpace(smtpUser) ||
            string.IsNullOrWhiteSpace(smtpPassword))
        {
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new { message = "Password reset email is not configured. Please contact the administrator." });
        }

        var identifierColumn = role == "student" ? "id" : "email";
        const string genericMessage =
            "If the account exists, a password reset link has been sent to its registered email address.";

        await using var connection = await db.OpenAsync(ct);
        string? userId;
        string? email;
        await using (var findUser = new MySqlCommand(
            $"SELECT id, email FROM users WHERE {identifierColumn} = @identifier AND role = @role LIMIT 1",
            connection))
        {
            findUser.Parameters.AddWithValue("@identifier", identifier);
            findUser.Parameters.AddWithValue("@role", role);
            await using var reader = await findUser.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct))
            {
                return Ok(new { message = genericMessage });
            }

            userId = reader.GetString("id");
            email = reader.GetString("email");
        }

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var tokenHash = HashResetToken(token);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var expiresAt = DateTimeOffset.UtcNow.Add(ResetTokenLifetime).ToUnixTimeMilliseconds();

        await using (var deleteOld = new MySqlCommand(
            "DELETE FROM password_reset_tokens WHERE user_id = @userId OR expires_at <= @now",
            connection))
        {
            deleteOld.Parameters.AddWithValue("@userId", userId);
            deleteOld.Parameters.AddWithValue("@now", now);
            await deleteOld.ExecuteNonQueryAsync(ct);
        }

        await using (var saveToken = new MySqlCommand(
            """
            INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at)
            VALUES (@tokenHash, @userId, @expiresAt, @createdAt)
            """,
            connection))
        {
            saveToken.Parameters.AddWithValue("@tokenHash", tokenHash);
            saveToken.Parameters.AddWithValue("@userId", userId);
            saveToken.Parameters.AddWithValue("@expiresAt", expiresAt);
            saveToken.Parameters.AddWithValue("@createdAt", now);
            await saveToken.ExecuteNonQueryAsync(ct);
        }

        try
        {
            await SendPasswordResetEmail(email!, token, role, smtpUser, smtpPassword, ct);
        }
        catch (SmtpException ex)
        {
            logger.LogError(ex, "Password reset email could not be sent.");
            await DeleteResetToken(connection, tokenHash, ct);
            return StatusCode(
                StatusCodes.Status500InternalServerError,
                new { message = "We could not send the reset email. Please contact the administrator." });
        }
        catch (Exception ex) when (ex is InvalidOperationException or FormatException)
        {
            logger.LogError(ex, "Password reset email configuration is invalid.");
            await DeleteResetToken(connection, tokenHash, ct);
            return StatusCode(
                StatusCodes.Status500InternalServerError,
                new { message = "We could not send the reset email. Please contact the administrator." });
        }

        return Ok(new { message = genericMessage });
    }

    [AllowAnonymous]
    [EnableRateLimiting("password-reset")]
    [HttpPost("password-reset/confirm")]
    public async Task<IActionResult> ConfirmPasswordReset(
        PasswordResetConfirmation input,
        CancellationToken ct)
    {
        var token = input.Token.Trim();
        if (!System.Text.RegularExpressions.Regex.IsMatch(token, "^[a-fA-F0-9]{64}$"))
        {
            return BadRequest(new { message = "Password reset link is invalid or expired." });
        }

        if (input.Password != input.ConfirmPassword)
        {
            return BadRequest(new { message = "Passwords do not match." });
        }

        var passwordError = PasswordPolicy.Validate(input.Password);
        if (passwordError is not null)
        {
            return BadRequest(new { message = passwordError });
        }

        await using var connection = await db.OpenAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        string? userId;
        await using (var findToken = new MySqlCommand(
            """
            SELECT user_id
            FROM password_reset_tokens
            WHERE token_hash = @tokenHash AND expires_at > @now
            LIMIT 1
            FOR UPDATE
            """,
            connection,
            transaction))
        {
            findToken.Parameters.AddWithValue("@tokenHash", HashResetToken(token));
            findToken.Parameters.AddWithValue(
                "@now",
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            userId = await findToken.ExecuteScalarAsync(ct) as string;
        }

        if (userId is null)
        {
            await transaction.RollbackAsync(ct);
            return BadRequest(new { message = "Password reset link is invalid or expired." });
        }

        await using (var updatePassword = new MySqlCommand(
            "UPDATE users SET password = @password WHERE id = @userId",
            connection,
            transaction))
        {
            updatePassword.Parameters.AddWithValue(
                "@password",
                PasswordHash.Create(input.Password));
            updatePassword.Parameters.AddWithValue("@userId", userId);
            if (await updatePassword.ExecuteNonQueryAsync(ct) != 1)
            {
                await transaction.RollbackAsync(ct);
                return BadRequest(new { message = "Password reset link is invalid or expired." });
            }
        }

        await using (var deleteTokens = new MySqlCommand(
            "DELETE FROM password_reset_tokens WHERE user_id = @userId",
            connection,
            transaction))
        {
            deleteTokens.Parameters.AddWithValue("@userId", userId);
            await deleteTokens.ExecuteNonQueryAsync(ct);
        }

        await transaction.CommitAsync(ct);
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Ok(new { message = "Password has been reset successfully." });
    }

    private static string HashResetToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    private async Task SendPasswordResetEmail(
        string email,
        string token,
        string role,
        string smtpUser,
        string smtpPassword,
        CancellationToken ct)
    {
        var appBaseUrl = Environment.GetEnvironmentVariable("APP_BASE_URL")
            ?? configuration["APP_BASE_URL"]
            ?? "http://localhost:5173";
        if (!Uri.TryCreate(appBaseUrl, UriKind.Absolute, out var baseUri))
        {
            throw new InvalidOperationException("APP_BASE_URL must be a valid absolute URL.");
        }

        if (environment.IsProduction() && baseUri.Scheme != Uri.UriSchemeHttps)
        {
            throw new InvalidOperationException("APP_BASE_URL must use HTTPS in production.");
        }

        var resetUrl = new UriBuilder(baseUri)
        {
            Path = "/reset-password",
            Query = $"token={Uri.EscapeDataString(token)}&role={Uri.EscapeDataString(role)}"
        }.Uri.ToString();

        using var message = new MailMessage
        {
            From = new MailAddress(smtpUser, "ClassIQ"),
            Subject = "Reset your ClassIQ password",
            Body = $"Use this one-time link to reset your ClassIQ password. It expires in 20 minutes: {resetUrl}",
            IsBodyHtml = false
        };
        message.To.Add(email);

        using var client = new SmtpClient("smtp.gmail.com", 587)
        {
            EnableSsl = true,
            Credentials = new NetworkCredential(smtpUser, smtpPassword.Replace(" ", ""))
        };
        await client.SendMailAsync(message, ct);
    }

    private static async Task DeleteResetToken(
        MySqlConnection connection,
        string tokenHash,
        CancellationToken ct)
    {
        await using var command = new MySqlCommand(
            "DELETE FROM password_reset_tokens WHERE token_hash = @tokenHash",
            connection);
        command.Parameters.AddWithValue("@tokenHash", tokenHash);
        await command.ExecuteNonQueryAsync(ct);
    }
}