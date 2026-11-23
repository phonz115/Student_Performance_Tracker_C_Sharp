using System.Net;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Repositories;
using StudentTracker.Api.Security;

namespace StudentTracker.Api.Services;

public sealed record AuthSession(string Id, string Email, string Name, string Role, string Course, string SchoolYear, string Semester);
public sealed record AuthenticationResult(ApiResult Response, AuthSession? Session = null);

public sealed class AuthService(
    AuthRepository repository,
    IConfiguration configuration,
    IWebHostEnvironment environment,
    ILogger<AuthService> logger)
{
    private static readonly TimeSpan ResetTokenLifetime = TimeSpan.FromMinutes(20);
    private const string GenericResetMessage = "If the account exists, a password reset link has been sent to its registered email address.";

    public async Task<AuthenticationResult> LoginAsync(LoginInput input, CancellationToken ct)
    {
        var role = input.Role?.Trim().ToLowerInvariant() ?? "";
        var identifier = input.Identifier?.Trim() ?? "";
        if (identifier.Length == 0 || string.IsNullOrWhiteSpace(input.Password) || role is not ("admin" or "teacher" or "student"))
            return new(ApiResult.BadRequest("Required login fields are missing or invalid."));
        var user = await repository.FindLoginUserAsync(identifier, role, ct);
        if (user is null || !PasswordHash.Verify(input.Password, user.PasswordHash))
            return new(ApiResult.Unauthorized("Invalid credentials."));
        var session = new AuthSession(user.Id, user.Email, user.Name, user.Role, user.Course, user.SchoolYear, user.Semester);
        return new(ApiResult.Ok(session), session);
    }

    public async Task<ApiResult> RequestPasswordResetAsync(PasswordResetRequest input, CancellationToken ct)
    {
        var identifier = input.Identifier?.Trim() ?? "";
        var role = input.Role?.Trim().ToLowerInvariant() ?? "";
        if (identifier.Length == 0 || role is not ("admin" or "teacher" or "student"))
            return ApiResult.BadRequest("Identifier and valid role are required.");
        var smtpUser = Environment.GetEnvironmentVariable("SMTP_USER") ?? configuration["SMTP_USER"];
        var smtpPassword = Environment.GetEnvironmentVariable("SMTP_APP_PASSWORD") ?? configuration["SMTP_APP_PASSWORD"];
        if (string.IsNullOrWhiteSpace(smtpUser) || string.IsNullOrWhiteSpace(smtpPassword))
            return ApiResult.ServiceUnavailable("Password reset email is not configured. Please contact the administrator.");
        var user = await repository.FindResetUserAsync(identifier, role, ct);
        if (user is null) return ApiResult.Ok(new { message = GenericResetMessage });
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var hash = HashResetToken(token);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await repository.SaveResetTokenAsync(hash, user.Id, DateTimeOffset.UtcNow.Add(ResetTokenLifetime).ToUnixTimeMilliseconds(), now, ct);
        try
        {
            await SendPasswordResetEmailAsync(user.Email, token, role, smtpUser, smtpPassword, ct);
        }
        catch (SmtpException ex)
        {
            logger.LogError(ex, "Password reset email could not be sent.");
            await repository.RevokeResetTokenAsync(hash, ct);
            return ApiResult.InternalServerError("We could not send the reset email. Please contact the administrator.");
        }
        catch (Exception ex) when (ex is InvalidOperationException or FormatException)
        {
            logger.LogError(ex, "Password reset email configuration is invalid.");
            await repository.RevokeResetTokenAsync(hash, ct);
            return ApiResult.InternalServerError("We could not send the reset email. Please contact the administrator.");
        }
        return ApiResult.Ok(new { message = GenericResetMessage });
    }

    public async Task<ApiResult> ConfirmPasswordResetAsync(PasswordResetConfirmation input, CancellationToken ct)
    {
        var token = input.Token?.Trim() ?? "";
        if (!System.Text.RegularExpressions.Regex.IsMatch(token, "^[a-fA-F0-9]{64}$"))
            return ApiResult.BadRequest("Password reset link is invalid or expired.");
        if (input.Password != input.ConfirmPassword) return ApiResult.BadRequest("Passwords do not match.");
        var passwordError = PasswordPolicy.Validate(input.Password);
        if (passwordError is not null) return ApiResult.BadRequest(passwordError);
        var ok = await repository.CompletePasswordResetAsync(HashResetToken(token), PasswordHash.Create(input.Password), DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), ct);
        return ok ? ApiResult.Ok(new { message = "Password has been reset successfully." })
            : ApiResult.BadRequest("Password reset link is invalid or expired.");
    }

    private async Task SendPasswordResetEmailAsync(string email, string token, string role, string smtpUser, string smtpPassword, CancellationToken ct)
    {
        var appBaseUrl = Environment.GetEnvironmentVariable("APP_BASE_URL") ?? configuration["APP_BASE_URL"] ?? "http://localhost:5173";
        if (!Uri.TryCreate(appBaseUrl, UriKind.Absolute, out var baseUri))
            throw new InvalidOperationException("APP_BASE_URL must be a valid absolute URL.");
        if (environment.IsProduction() && baseUri.Scheme != Uri.UriSchemeHttps)
            throw new InvalidOperationException("APP_BASE_URL must use HTTPS in production.");
        var resetUrl = new UriBuilder(baseUri)
        {
            Path = "/reset-password",
            Query = $"token={Uri.EscapeDataString(token)}&role={Uri.EscapeDataString(role)}"
        }.Uri.ToString();
        using var message = new MailMessage
        {
            From = new MailAddress(smtpUser, "ClassIQ"), Subject = "Reset your ClassIQ password",
            Body = $"Use this one-time link to reset your ClassIQ password. It expires in 20 minutes: {resetUrl}",
            IsBodyHtml = false
        };
        message.To.Add(email);
        using var client = new SmtpClient("smtp.gmail.com", 587)
        {
            EnableSsl = true, Credentials = new NetworkCredential(smtpUser, smtpPassword.Replace(" ", ""))
        };
        await client.SendMailAsync(message, ct);
    }

    private static string HashResetToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
}
