using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Services;

namespace StudentTracker.Api.Controllers;

[ApiController]
[Route("api/courses")]
[Authorize]
public sealed class CoursesController(CoursesService service) : ApiControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct) => Ok(await service.ListAsync(ct));
    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create(CourseInput input, CancellationToken ct) => Respond(await service.CreateAsync(input, ct));
    [HttpPut("{id:int}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(int id, CourseInput input, CancellationToken ct) => Respond(await service.UpdateAsync(id, input, ct));
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct) => Respond(await service.DeleteAsync(id, ct));
}
