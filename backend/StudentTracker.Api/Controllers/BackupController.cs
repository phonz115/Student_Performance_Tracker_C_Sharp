using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Services;

namespace StudentTracker.Api.Controllers;

[ApiController]
[Route("api")]
[Authorize(Roles = "admin")]
public sealed class BackupController(BackupService service) : ApiControllerBase
{
    [HttpGet("backup")]
    public async Task<IActionResult> Download(CancellationToken ct) => Respond(await service.DownloadAsync(ct));

    [HttpPost("restore")]
    public async Task<IActionResult> Restore(RestoreSnapshot? snapshot, CancellationToken ct) =>
        Respond(await service.RestoreAsync(snapshot, ct));
}
