namespace StudentTracker.Api.Contracts;

public sealed class RestoreSnapshot
{
    public List<BackupUser>? Users { get; init; } = [];
    public List<BackupGrade>? Grades { get; init; } = [];
    public List<BackupAssignment>? Assignments { get; init; } = [];
    public List<BackupCourse>? Courses { get; init; } = [];
    public List<BackupSubject>? Subjects { get; init; } = [];
}

public sealed record BackupUser(string? Id, string? Email, string? Name, string? Role, string? Course,
    string? SchoolYear, string? Semester, string? PasswordHash);
public sealed record BackupGrade(int? Id, string? StudentId, string? Subject, decimal Score,
    string? Feedback, string? TeacherId, string? SchoolYear, string? Semester, string? Term);
public sealed record BackupAssignment(string? TeacherId, string? StudentId, string? Subject,
    string? Course, string? Section, string? SchoolYear, string? Semester);
public sealed record BackupCourse(string? Code, string? Name, string? Description,
    string? SchoolYear, string? Semester, string? TeacherId);
public sealed record BackupSubject(string? Name, string? TeacherId);
