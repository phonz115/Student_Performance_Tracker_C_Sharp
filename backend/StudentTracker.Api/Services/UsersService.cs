using MySqlConnector;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Repositories;
using StudentTracker.Api.Security;

namespace StudentTracker.Api.Services;

public sealed class UsersService(UsersRepository repository)
{
    private static readonly string[] Roles = ["admin", "teacher", "student"];

    public async Task<ApiResult> ListAsync(string currentRole, string currentUserId, string? requestedRole, CancellationToken ct)
    {
        if (!Roles.Contains(currentRole)) return ApiResult.Forbidden();
        return ApiResult.Ok(await repository.ListAsync(currentRole, currentUserId, requestedRole, ct));
    }

    public async Task<ApiResult> CreateAsync(NewUserInput input, CancellationToken ct)
    {
        input = input with { SchoolYear = input.SchoolYear?.Trim() };
        var schoolYearError = SchoolYearRules.Validate(input.SchoolYear);
        if (schoolYearError is not null) return ApiResult.BadRequest(schoolYearError);

        var role = input.Role.Trim().ToLowerInvariant();
        var generatedIdRole = role is "student" or "teacher";
        if (!Roles.Contains(role) || (!generatedIdRole && string.IsNullOrWhiteSpace(input.Id)) || string.IsNullOrWhiteSpace(input.Password))
            return ApiResult.BadRequest("Check the required fields and role.");
        var passwordError = PasswordPolicy.Validate(input.Password);
        if (passwordError is not null) return ApiResult.BadRequest(passwordError);
        var (first, last, full) = ResolveName(input.Name, input.FirstName, input.LastName);
        if (full.Length == 0) return ApiResult.BadRequest("A user name is required.");
        var email = input.Email.Trim().ToLowerInvariant();
        var passwordHash = PasswordHash.Create(input.Password);

        if (generatedIdRole)
        {
            var id = input.Id?.Trim();
            if (id is null || id.Length != 6 || !id.All(char.IsDigit))
                return ApiResult.BadRequest("A generated six-digit ID is required.");

            var nextId = await repository.GetNextGeneratedIdAsync(ct);
            if (nextId > 999999)
                return ApiResult.BadRequest("No six-digit IDs remain. Contact the administrator.");
            if (id != nextId.ToString("D6"))
                return ApiResult.Conflict("The ID preview expired. A new ID is shown; please try again.");

            try
            {
                await repository.CreateAsync(id, email, first, last, full, role, passwordHash, input.Course, input.SchoolYear, input.Semester, ct);
            }
            catch (MySqlException ex) when (ex.Number == 1062)
            {
                return await repository.EmailExistsAsync(email, ct)
                    ? ApiResult.Conflict("That email already exists.")
                    : ApiResult.Conflict("Another account took that ID. A new ID is shown; please try again.");
            }
            return CreatedUser(input, id, email, first, last, full, role);
        }

        var manualId = input.Id!.Trim();
        try
        {
            await repository.CreateAsync(manualId, email, first, last, full, role, passwordHash, input.Course, input.SchoolYear, input.Semester, ct);
        }
        catch (MySqlException ex) when (ex.Number == 1062) { return ApiResult.Conflict("That ID or email already exists."); }
        return CreatedUser(input, manualId, email, first, last, full, role);
    }

    public async Task<ApiResult> GetNextGeneratedIdAsync(CancellationToken ct)
    {
        var id = await repository.GetNextGeneratedIdAsync(ct);
        return id > 999999
            ? ApiResult.BadRequest("No six-digit IDs remain. Contact the administrator.")
            : ApiResult.Ok(new { id = id.ToString("D6") });
    }

    private static ApiResult CreatedUser(NewUserInput input, string id, string email, string first, string last, string full, string role) =>
        ApiResult.Created("/api/users", new
        {
            id, email, firstName = first, lastName = last, name = full, role,
            course = input.Course, schoolYear = input.SchoolYear, semester = input.Semester
        });

    public async Task<ApiResult> UpdateAsync(string id, EditUserInput input, CancellationToken ct)
    {
        input = input with { SchoolYear = input.SchoolYear?.Trim() };
        var schoolYearError = SchoolYearRules.Validate(input.SchoolYear);
        if (schoolYearError is not null) return ApiResult.BadRequest(schoolYearError);

        var role = input.Role.Trim().ToLowerInvariant();
        if (!Roles.Contains(role)) return ApiResult.BadRequest("Check the required fields and role.");
        var (first, last, full) = ResolveName(input.Name, input.FirstName, input.LastName);
        if (full.Length == 0) return ApiResult.BadRequest("A user name is required.");
        var email = input.Email.Trim().ToLowerInvariant();
        try
        {
            if (await repository.UpdateAsync(id, email, first, last, full, role, input.Course, input.SchoolYear, input.Semester, ct) == 0)
                return ApiResult.NotFound("User not found.");
        }
        catch (MySqlException ex) when (ex.Number == 1062) { return ApiResult.Conflict("That email already exists."); }
        return ApiResult.Ok(new { id, email, firstName = first, lastName = last, name = full, role,
            course = input.Course ?? "", schoolYear = input.SchoolYear ?? "2025-2026", semester = input.Semester ?? "1st Semester" });
    }

    public async Task<ApiResult> ResetPasswordAsync(string id, string password, CancellationToken ct)
    {
        var error = PasswordPolicy.Validate(password);
        if (error is not null) return ApiResult.BadRequest(error);
        return await repository.ResetPasswordAsync(id, PasswordHash.Create(password), ct) == 0
            ? ApiResult.NotFound("User not found.") : ApiResult.Ok(new { message = "Password reset successfully" });
    }

    public async Task<ApiResult> DeleteAsync(string id, string currentUserId, CancellationToken ct)
    {
        if (currentUserId == id) return ApiResult.BadRequest("You cannot delete the account currently signed in.");
        var info = await repository.GetDeleteInfoAsync(id, ct);
        if (info is null) return ApiResult.NotFound("User not found.");
        if (info.Role == "admin" && info.AdminCount <= 1) return ApiResult.BadRequest("The last admin account cannot be deleted.");
        return await repository.SoftDeleteAsync(id, ct) == 0
            ? ApiResult.NotFound("User not found.") : ApiResult.Ok(new { ok = true });
    }

    private static (string First, string Last, string Full) ResolveName(string? name, string? firstName, string? lastName)
    {
        var first = firstName?.Trim() ?? "";
        var last = lastName?.Trim() ?? "";
        if (first.Length == 0 && last.Length == 0 && !string.IsNullOrWhiteSpace(name))
        {
            var parts = name.Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
            first = parts[0]; last = parts.Length > 1 ? parts[1] : "";
        }
        var full = string.Join(' ', new[] { first, last }.Where(part => part.Length > 0));
        if (full.Length == 0) full = name?.Trim() ?? "";
        return (first, last, full);
    }
}
