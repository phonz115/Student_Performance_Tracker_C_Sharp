using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Services;

namespace StudentTracker.Api.Controllers;

[ApiController]
[Route("api/grades")]
[Authorize]
public sealed class GradesController(GradesService service) : ApiControllerBase
{
    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    private string Role => User.FindFirstValue(ClaimTypes.Role) ?? "";

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct) => Ok(await service.ListAsync(Role, UserId, ct));
    [HttpPost]
    [Authorize(Roles = "admin,teacher")]
    public async Task<IActionResult> Create(GradeInput input, CancellationToken ct) => Respond(await service.CreateAsync(input, Role, UserId, ct));
    [HttpPut("{id:int}")]
    [Authorize(Roles = "admin,teacher")]
    public async Task<IActionResult> Update(int id, GradeUpdateInput input, CancellationToken ct) => Respond(await service.UpdateAsync(id, input, Role, UserId, ct));
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "admin,teacher")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct) => Respond(await service.DeleteAsync(id, Role, UserId, ct));
}
