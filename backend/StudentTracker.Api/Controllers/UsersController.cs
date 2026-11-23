using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Services;

namespace StudentTracker.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public sealed class UsersController(UsersService service) : ApiControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? role, CancellationToken ct) =>
        Respond(await service.ListAsync(User.FindFirstValue(ClaimTypes.Role) ?? "",
            User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "", role, ct));

    [HttpGet("next-id")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> NextId(CancellationToken ct) =>
        Respond(await service.GetNextGeneratedIdAsync(ct));

    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create(NewUserInput input, CancellationToken ct) => Respond(await service.CreateAsync(input, ct));

    [HttpPut("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(string id, EditUserInput input, CancellationToken ct) => Respond(await service.UpdateAsync(id, input, ct));

    [HttpPost("{id}/reset-password")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> ResetPassword(string id, PasswordInput input, CancellationToken ct) => Respond(await service.ResetPasswordAsync(id, input.Password, ct));

    [HttpDelete("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(string id, CancellationToken ct) => Respond(await service.DeleteAsync(
        id, User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "", ct));
}
