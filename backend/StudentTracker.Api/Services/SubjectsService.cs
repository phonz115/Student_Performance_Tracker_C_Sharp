using StudentTracker.Api.Contracts;
using StudentTracker.Api.Repositories;

namespace StudentTracker.Api.Services;

public sealed class SubjectsService(SubjectsRepository repository)
{
    public Task<IReadOnlyList<object>> ListAsync(CancellationToken ct) => repository.ListAsync(ct);
    public async Task<ApiResult> CreateAsync(SubjectInput input, CancellationToken ct)
    {
        var name = input.Name?.Trim() ?? "";
        var teacherId = input.TeacherId?.Trim() ?? "";
        if (name.Length == 0 || teacherId.Length == 0)
            return ApiResult.BadRequest("Subject name and teacher are required.");
        if (!await repository.IsTeacherAsync(teacherId, ct))
            return ApiResult.BadRequest("Choose an existing teacher.");
        var id = await repository.CreateAsync(name, teacherId, ct);
        return ApiResult.Created("/api/subjects", new { id, name, teacherId });
    }
}
