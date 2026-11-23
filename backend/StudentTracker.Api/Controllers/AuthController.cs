using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Services;

namespace StudentTracker.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class AuthController(AuthService service) : ApiControllerBase
{
    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginInput input, CancellationToken ct)
    {
        var result = await service.LoginAsync(input, ct);
        if (result.Session is null) return Respond(result.Response);
        var user = result.Session;
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id), new Claim(ClaimTypes.Name, user.Name),
            new Claim(ClaimTypes.Email, user.Email), new Claim(ClaimTypes.Role, user.Role),
            new Claim("course", user.Course), new Claim("schoolYear", user.SchoolYear),
            new Claim("semester", user.Semester)
        };
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
        return Ok(new { id = user.Id, email = user.Email, name = user.Name, role = user.Role,
            course = user.Course, schoolYear = user.SchoolYear, semester = user.Semester });
    }

    [Authorize]
    [HttpGet("session")]
    public IActionResult Session() => Ok(new
    {
        id = User.FindFirstValue(ClaimTypes.NameIdentifier), name = User.Identity?.Name,
        email = User.FindFirstValue(ClaimTypes.Email), role = User.FindFirstValue(ClaimTypes.Role),
        course = User.FindFirstValue("course") ?? "", schoolYear = User.FindFirstValue("schoolYear") ?? "",
        semester = User.FindFirstValue("semester") ?? ""
    });

    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Ok(new { ok = true });
    }

    [AllowAnonymous]
    [EnableRateLimiting("password-reset")]
    [HttpPost("password-reset/request")]
    public async Task<IActionResult> RequestPasswordReset(PasswordResetRequest input, CancellationToken ct) =>
        Respond(await service.RequestPasswordResetAsync(input, ct));

    [AllowAnonymous]
    [EnableRateLimiting("password-reset")]
    [HttpPost("password-reset/confirm")]
    public async Task<IActionResult> ConfirmPasswordReset(PasswordResetConfirmation input, CancellationToken ct)
    {
        var result = await service.ConfirmPasswordResetAsync(input, ct);
        if (result.Status == ApiResultStatus.Ok)
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Respond(result);
    }
}
