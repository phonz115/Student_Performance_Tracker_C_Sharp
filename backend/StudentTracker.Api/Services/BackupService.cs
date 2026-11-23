using System.ComponentModel.DataAnnotations;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Repositories;
using StudentTracker.Api.Security;

namespace StudentTracker.Api.Services;

public sealed class BackupService(BackupRepository repository)
{
    public async Task<ApiResult> DownloadAsync(CancellationToken ct) => ApiResult.Ok(await repository.DownloadAsync(ct));

    public async Task<ApiResult> RestoreAsync(RestoreSnapshot? snapshot, CancellationToken ct)
    {
        if (snapshot is null) return ApiResult.BadRequest("Backup snapshot is required.");
        if (snapshot.Users is null || snapshot.Grades is null || snapshot.Assignments is null || snapshot.Courses is null || snapshot.Subjects is null)
            return ApiResult.BadRequest("Backup snapshot sections must be arrays.");
        var error = Validate(snapshot);
        if (error is not null) return ApiResult.BadRequest(error);
        var users = snapshot.Users.Select(user => user with
        {
            Role = user.Role!.Trim().ToLowerInvariant(),
            PasswordHash = IsPasswordHash(user.PasswordHash!) ? user.PasswordHash : PasswordHash.Create(user.PasswordHash!)
        }).ToList();
        var normalized = new RestoreSnapshot
        {
            Users = users, Grades = snapshot.Grades, Assignments = snapshot.Assignments,
            Courses = snapshot.Courses, Subjects = snapshot.Subjects
        };
        await repository.RestoreAsync(normalized, ct);
        return ApiResult.Ok(new
        {
            message = "Backup snapshot restored",
            restored = new { users = users.Count, courses = snapshot.Courses.Count,
                subjects = snapshot.Subjects.Count, assignments = snapshot.Assignments.Count,
                grades = snapshot.Grades.Count }
        });
    }

    private static string? Validate(RestoreSnapshot snapshot)
    {
        var email = new EmailAddressAttribute();
        if (snapshot.Users!.Any(user => string.IsNullOrWhiteSpace(user.Id) || string.IsNullOrWhiteSpace(user.Email) ||
            !email.IsValid(user.Email) || string.IsNullOrWhiteSpace(user.Name) ||
            user.Role?.Trim().ToLowerInvariant() is not ("admin" or "teacher" or "student") || string.IsNullOrWhiteSpace(user.PasswordHash)))
            return "Backup contains an invalid user record.";
        if (snapshot.Courses!.Any(course => string.IsNullOrWhiteSpace(course.Code) || string.IsNullOrWhiteSpace(course.Name)))
            return "Backup contains an invalid course record.";
        if (snapshot.Subjects!.Any(subject => string.IsNullOrWhiteSpace(subject.Name)))
            return "Backup contains an invalid subject record.";
        if (snapshot.Assignments!.Any(item => string.IsNullOrWhiteSpace(item.TeacherId) || string.IsNullOrWhiteSpace(item.StudentId) || string.IsNullOrWhiteSpace(item.Subject)))
            return "Backup contains an invalid assignment record.";
        if (snapshot.Grades!.Any(grade => string.IsNullOrWhiteSpace(grade.StudentId) || string.IsNullOrWhiteSpace(grade.Subject) || grade.Score is < 0 or > 100))
            return "Backup contains an invalid grade record.";
        if (snapshot.Users!.Any(user => SchoolYearRules.Validate(user.SchoolYear) is not null) ||
            snapshot.Courses!.Any(course => SchoolYearRules.Validate(course.SchoolYear) is not null) ||
            snapshot.Assignments!.Any(item => SchoolYearRules.Validate(item.SchoolYear) is not null) ||
            snapshot.Grades!.Any(grade => SchoolYearRules.Validate(grade.SchoolYear) is not null))
            return $"Backup contains an invalid school year. {SchoolYearRules.ErrorMessage}";
        return null;
    }

    private static bool IsPasswordHash(string value) => value.StartsWith("p2$", StringComparison.Ordinal) ||
        value.StartsWith("pbkdf2_sha256$", StringComparison.Ordinal);
}
