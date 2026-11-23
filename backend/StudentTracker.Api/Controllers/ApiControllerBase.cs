using Microsoft.AspNetCore.Mvc;
using StudentTracker.Api.Services;

namespace StudentTracker.Api.Controllers;

public abstract class ApiControllerBase : ControllerBase
{
    protected IActionResult Respond(ApiResult result) => result.Status switch
    {
        ApiResultStatus.Ok => Ok(result.Value),
        ApiResultStatus.Created => Created(result.Location!, result.Value),
        ApiResultStatus.NoContent => NoContent(),
        ApiResultStatus.BadRequest => BadRequest(new { message = result.Message }),
        ApiResultStatus.Unauthorized => Unauthorized(new { message = result.Message }),
        ApiResultStatus.Forbidden => Forbid(),
        ApiResultStatus.NotFound => NotFound(new { message = result.Message }),
        ApiResultStatus.Conflict => Conflict(new { message = result.Message }),
        ApiResultStatus.ServiceUnavailable => StatusCode(503, new { message = result.Message }),
        ApiResultStatus.InternalServerError => StatusCode(500, new { message = result.Message }),
        _ => throw new InvalidOperationException($"Unhandled API result status: {result.Status}")
    };
}
