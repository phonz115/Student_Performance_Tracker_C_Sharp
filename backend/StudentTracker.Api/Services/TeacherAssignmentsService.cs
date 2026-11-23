using MySqlConnector;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Repositories;
using StudentTracker.Api.Security;

namespace StudentTracker.Api.Services;

public sealed class TeacherAssignmentsService(TeacherAssignmentsRepository repository)
{
    public Task<IReadOnlyList<object>> ListAsync(string role, string userId, CancellationToken ct) =>
        repository.ListAsync(role, userId, ct);
    public async Task<ApiResult> CreateAsync(AssignmentInput input, CancellationToken ct)
    {
        input = input with { SchoolYear = input.SchoolYear?.Trim() };
        var schoolYearError = SchoolYearRules.Validate(input.SchoolYear);
        if (schoolYearError is not null) return ApiResult.BadRequest(schoolYearError);
        var teacherId = input.TeacherId?.Trim() ?? "";
        var studentId = input.StudentId?.Trim() ?? "";
        var subject = input.Subject?.Trim() ?? "";
        if (teacherId.Length == 0 || studentId.Length == 0 || subject.Length == 0)
            return ApiResult.BadRequest("Teacher, student, and subject are required.");
        if (!await repository.UsersExistAsync(teacherId, studentId, ct))
            return ApiResult.BadRequest("Choose existing teacher and student accounts.");
        try
        {
            var id = await repository.CreateAsync(input with { TeacherId = teacherId, StudentId = studentId, Subject = subject }, ct);
            return ApiResult.Created("/api/teacher-assignments", new
            {
                id, teacherId, studentId, subject, course = input.Course,
                section = input.Section, schoolYear = input.SchoolYear, semester = input.Semester
            });
        }
        catch (MySqlException ex) when (ex.Number == 1062) { return ApiResult.Conflict("Assignment already exists."); }
    }
    public async Task<ApiResult> DeleteAsync(int id, CancellationToken ct)
    {
        if (id <= 0) return ApiResult.BadRequest("Invalid assignment ID.");
        return await repository.SoftDeleteAsync(id, ct) == 0
            ? ApiResult.NotFound("Assignment not found.") : ApiResult.Ok(new { ok = true });
    }
}
