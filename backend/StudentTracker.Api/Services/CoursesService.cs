using MySqlConnector;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Repositories;
using StudentTracker.Api.Security;

namespace StudentTracker.Api.Services;

public sealed class CoursesService(CoursesRepository repository)
{
    public Task<IReadOnlyList<object>> ListAsync(CancellationToken ct) => repository.ListAsync(ct);
    public async Task<ApiResult> CreateAsync(CourseInput input, CancellationToken ct)
    {
        input = input with { SchoolYear = input.SchoolYear?.Trim() };
        var schoolYearError = SchoolYearRules.Validate(input.SchoolYear);
        if (schoolYearError is not null) return ApiResult.BadRequest(schoolYearError);
        if (string.IsNullOrWhiteSpace(input.Code) || string.IsNullOrWhiteSpace(input.Name))
            return ApiResult.BadRequest("Course code and name are required.");
        try
        {
            var id = await repository.CreateAsync(input, ct);
            return ApiResult.Created("/api/courses", new
            {
                id, code = input.Code.Trim().ToUpperInvariant(), name = input.Name.Trim(),
                description = input.Description, schoolYear = input.SchoolYear,
                semester = input.Semester, teacherId = input.TeacherId
            });
        }
        catch (MySqlException ex) when (ex.Number == 1062) { return ApiResult.Conflict("Course code already exists."); }
    }
    public async Task<ApiResult> UpdateAsync(int id, CourseInput input, CancellationToken ct)
    {
        input = input with { SchoolYear = input.SchoolYear?.Trim() };
        var schoolYearError = SchoolYearRules.Validate(input.SchoolYear);
        if (schoolYearError is not null) return ApiResult.BadRequest(schoolYearError);
        if (id <= 0 || string.IsNullOrWhiteSpace(input.Code) || string.IsNullOrWhiteSpace(input.Name))
            return ApiResult.BadRequest("Check the course ID, code, and name.");
        try
        {
            return await repository.UpdateAsync(id, input, ct) == 0
                ? ApiResult.NotFound("Course not found.") : ApiResult.NoContent();
        }
        catch (MySqlException ex) when (ex.Number == 1062) { return ApiResult.Conflict("Course code already exists."); }
    }
    public async Task<ApiResult> DeleteAsync(int id, CancellationToken ct)
    {
        if (id <= 0) return ApiResult.BadRequest("Invalid course ID.");
        return await repository.SoftDeleteAsync(id, ct) == 0
            ? ApiResult.NotFound("Course not found.") : ApiResult.Ok(new { ok = true });
    }
}
