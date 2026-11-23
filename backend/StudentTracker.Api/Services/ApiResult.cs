namespace StudentTracker.Api.Services;

public enum ApiResultStatus
{
    Ok,
    Created,
    NoContent,
    BadRequest,
    Unauthorized,
    Forbidden,
    NotFound,
    Conflict,
    ServiceUnavailable,
    InternalServerError
}

public sealed record ApiResult(
    ApiResultStatus Status,
    object? Value = null,
    string? Message = null,
    string? Location = null)
{
    public static ApiResult Ok(object? value) => new(ApiResultStatus.Ok, value);
    public static ApiResult Created(string location, object? value) =>
        new(ApiResultStatus.Created, value, Location: location);
    public static ApiResult NoContent() => new(ApiResultStatus.NoContent);
    public static ApiResult BadRequest(string message) => new(ApiResultStatus.BadRequest, Message: message);
    public static ApiResult Unauthorized(string message) => new(ApiResultStatus.Unauthorized, Message: message);
    public static ApiResult Forbidden() => new(ApiResultStatus.Forbidden);
    public static ApiResult NotFound(string message) => new(ApiResultStatus.NotFound, Message: message);
    public static ApiResult Conflict(string message) => new(ApiResultStatus.Conflict, Message: message);
    public static ApiResult ServiceUnavailable(string message) =>
        new(ApiResultStatus.ServiceUnavailable, Message: message);
    public static ApiResult InternalServerError(string message) =>
        new(ApiResultStatus.InternalServerError, Message: message);
}
