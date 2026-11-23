using System.ComponentModel.DataAnnotations;

namespace StudentTracker.Api.Contracts;

public sealed record CourseInput(
    [Required] string Code,
    [Required] string Name,
    string? Description,
    string? SchoolYear,
    string? Semester,
    string? TeacherId);

public sealed record SubjectInput([Required] string Name, [Required] string TeacherId);

public sealed record AssignmentInput(
    string TeacherId,
    string StudentId,
    string Subject,
    string? Course,
    string? Section,
    string? SchoolYear,
    string? Semester);

public sealed record GradeInput(
    [Required] string StudentId,
    [Required] string Subject,
    decimal Score,
    string? Feedback,
    string? SchoolYear,
    string? Semester,
    string? Term);

public sealed record GradeUpdateInput(
    [Required] string Subject,
    decimal Score,
    string? Feedback,
    string? SchoolYear,
    string? Semester,
    string? Term);

public sealed record NewUserInput(
    string? Id,
    [Required, EmailAddress] string Email,
    string? FirstName,
    string? LastName,
    [Required] string Role,
    string? Course,
    string? SchoolYear,
    string? Semester,
    [Required, MinLength(8)] string Password,
    string? Name);

public sealed record EditUserInput(
    [Required, EmailAddress] string Email,
    string? FirstName,
    string? LastName,
    [Required] string Role,
    string? Course,
    string? SchoolYear,
    string? Semester,
    string? Name);

public sealed record PasswordInput([Required, MinLength(8)] string Password);

public sealed record LoginInput(
    [Required] string Identifier,
    [Required] string Password,
    [Required] string Role);

public sealed record PasswordResetRequest(
    [Required] string Identifier,
    [Required] string Role);

public sealed record PasswordResetConfirmation(
    [Required] string Token,
    [Required, MinLength(8)] string Password,
    [Required] string ConfirmPassword);
