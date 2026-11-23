using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Services;

namespace StudentTracker.Api.Controllers;

[ApiController]
[Route("api/teacher-assignments")]
[Authorize]
public sealed class TeacherAssignmentsController(TeacherAssignmentsService service) : ApiControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct) => Ok(await service.ListAsync(
        User.FindFirstValue(ClaimTypes.Role) ?? "",
        User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "", ct));
    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create(AssignmentInput input, CancellationToken ct) => Respond(await service.CreateAsync(input, ct));
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct) => Respond(await service.DeleteAsync(id, ct));
}
