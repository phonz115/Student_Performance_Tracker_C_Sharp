using StudentTracker.Api.Contracts;
using StudentTracker.Api.Repositories;
using StudentTracker.Api.Security;

namespace StudentTracker.Api.Services;

public sealed class GradesService(GradesRepository repository)
{
    public Task<IReadOnlyList<object>> ListAsync(string role, string userId, CancellationToken ct) => repository.ListAsync(role, userId, ct);

    public async Task<ApiResult> CreateAsync(GradeInput input, string role, string userId, CancellationToken ct)
    {
        input = input with { SchoolYear = input.SchoolYear?.Trim() };
        var schoolYearError = SchoolYearRules.Validate(input.SchoolYear);
        if (schoolYearError is not null) return ApiResult.BadRequest(schoolYearError);
        var error = Validate(input.StudentId, input.Subject, input.Score, input.Feedback, role);
        if (error is not null) return ApiResult.BadRequest(error);
        if (role == "teacher" && !await repository.IsAssignedAsync(userId, input.StudentId, input.Subject, ct))
            return ApiResult.Forbidden();
        var id = await repository.CreateAsync(input, role, userId, ct);
        return ApiResult.Created("/api/grades", new
        {
            id, studentId = input.StudentId, subject = input.Subject.Trim(), score = input.Score,
            feedback = input.Feedback ?? "", teacherId = role == "teacher" ? userId : null,
            schoolYear = input.SchoolYear ?? "2025-2026", semester = input.Semester ?? "1st Semester",
            term = input.Term ?? "Prelim"
        });
    }

    public async Task<ApiResult> UpdateAsync(int id, GradeUpdateInput input, string role, string userId, CancellationToken ct)
    {
        input = input with { SchoolYear = input.SchoolYear?.Trim() };
        var schoolYearError = SchoolYearRules.Validate(input.SchoolYear);
        if (schoolYearError is not null) return ApiResult.BadRequest(schoolYearError);
        if (id <= 0) return ApiResult.BadRequest("Invalid grade ID.");
        var existing = await repository.FindAsync(id, ct);
        if (existing is null) return ApiResult.NotFound("Grade not found.");
        var error = Validate(existing.StudentId, input.Subject, input.Score, input.Feedback, role);
        if (error is not null) return ApiResult.BadRequest(error);
        if (role == "teacher" && (existing.TeacherId != userId ||
            !await repository.IsAssignedAsync(userId, existing.StudentId, input.Subject, ct)))
            return ApiResult.Forbidden();
        await repository.UpdateAsync(id, input, role == "teacher" ? userId : null, ct);
        var updated = await repository.ReadAsync(id, ct);
        return updated is null ? ApiResult.NotFound("Grade not found.") : ApiResult.Ok(updated);
    }

    public async Task<ApiResult> DeleteAsync(int id, string role, string userId, CancellationToken ct)
    {
        if (id <= 0) return ApiResult.BadRequest("Invalid grade ID.");
        return await repository.SoftDeleteAsync(id, role == "teacher" ? userId : null, ct) == 0
            ? ApiResult.NotFound("Grade not found.") : ApiResult.Ok(new { ok = true });
    }

    private static string? Validate(string studentId, string subject, decimal score, string? feedback, string role)
    {
        if (string.IsNullOrWhiteSpace(studentId) || string.IsNullOrWhiteSpace(subject)) return "Student and subject are required.";
        if (role == "teacher" && (score < 1m || score > 5m)) return "Teacher grade must be between 1.0 and 5.0.";
        if (role == "admin" && (score < 0m || score > 100m)) return "Admin score must be between 0 and 100.";
        if (feedback?.Length > 2000) return "Feedback is too long.";
        return null;
    }
}
