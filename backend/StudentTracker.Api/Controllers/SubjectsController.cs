using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Services;

namespace StudentTracker.Api.Controllers;

[ApiController]
[Route("api/subjects")]
[Authorize]
public sealed class SubjectsController(SubjectsService service) : ApiControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct) => Ok(await service.ListAsync(ct));
    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create(SubjectInput input, CancellationToken ct) => Respond(await service.CreateAsync(input, ct));
}
