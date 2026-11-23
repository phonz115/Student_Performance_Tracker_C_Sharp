using MySqlConnector;
using StudentTracker.Api.Infrastructure;

namespace StudentTracker.Api.Repositories;

public sealed record UserDeleteInfo(string Role, int AdminCount);

public sealed class UsersRepository(DbConnectionFactory db)
{
    public async Task<long> GetNextGeneratedIdAsync(CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand(
            "SELECT MAX(id) FROM users WHERE id >= '100000' AND id <= '999999' AND CHAR_LENGTH(id) = 6 AND id REGEXP '^[0-9]{6}$'",
            connection);
        var highestId = await command.ExecuteScalarAsync(ct) as string;
        return highestId is null ? 100000 : Convert.ToInt64(highestId) + 1;
    }

    public async Task<bool> EmailExistsAsync(string email, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand("SELECT COUNT(*) FROM users WHERE email = @email", connection);
        command.Parameters.AddWithValue("@email", email);
        return Convert.ToInt32(await command.ExecuteScalarAsync(ct)) > 0;
    }

    public async Task<IReadOnlyList<object>> ListAsync(string currentRole, string currentUserId, string? requestedRole, CancellationToken ct)
    {
        var sql = """
            SELECT u.id, u.email, u.firstname, u.lastname,
                   COALESCE(u.name, TRIM(CONCAT_WS(' ', u.firstname, u.lastname))) name,
                   u.role, COALESCE(u.course, '') course, COALESCE(u.school_year, '') schoolYear,
                   COALESCE(u.semester, '') semester
            FROM users u WHERE u.is_deleted = 0
            """;
        if (currentRole == "teacher") sql += " AND u.role = 'student' AND (EXISTS (SELECT 1 FROM teacher_assignments ta WHERE ta.student_id = u.id AND ta.teacher_id = @uid AND ta.is_deleted = 0) OR EXISTS (SELECT 1 FROM grades g WHERE g.student_id = u.id AND g.teacher_id = @uid AND g.is_deleted = 0))";
        else if (currentRole == "student") sql += " AND u.id = @uid";
        else sql += " AND (@role IS NULL OR u.role = @role)";
        sql += " ORDER BY name";
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand(sql, connection);
        if (currentRole == "admin") command.Parameters.AddWithValue("@role", string.IsNullOrWhiteSpace(requestedRole) ? DBNull.Value : requestedRole.Trim().ToLowerInvariant());
        else command.Parameters.AddWithValue("@uid", currentUserId);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var rows = new List<object>();
        while (await reader.ReadAsync(ct)) rows.Add(new
        {
            id = reader.GetString("id"), email = reader.GetString("email"),
            firstName = reader.IsDBNull(reader.GetOrdinal("firstname")) ? "" : reader.GetString("firstname"),
            lastName = reader.IsDBNull(reader.GetOrdinal("lastname")) ? "" : reader.GetString("lastname"),
            name = reader.GetString("name"), role = reader.GetString("role"),
            course = reader.GetString("course"), schoolYear = reader.GetString("schoolYear"),
            semester = reader.GetString("semester")
        });
        return rows;
    }

    public async Task CreateAsync(string id, string email, string firstName, string lastName, string name, string role, string passwordHash, string? course, string? year, string? semester, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        const string sql = """
            INSERT INTO users (id, email, firstname, lastname, name, role, password, course, school_year, semester)
            VALUES (@id, @email, @first, @last, @name, @role, @password, @course, @year, @semester)
            """;
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@id", id); command.Parameters.AddWithValue("@email", email);
        command.Parameters.AddWithValue("@first", firstName); command.Parameters.AddWithValue("@last", lastName);
        command.Parameters.AddWithValue("@name", name); command.Parameters.AddWithValue("@role", role);
        command.Parameters.AddWithValue("@password", passwordHash); command.Parameters.AddWithValue("@course", course ?? "");
        command.Parameters.AddWithValue("@year", year ?? "2025-2026"); command.Parameters.AddWithValue("@semester", semester ?? "1st Semester");
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<int> UpdateAsync(string id, string email, string firstName, string lastName, string name, string role, string? course, string? year, string? semester, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        const string sql = """
            UPDATE users SET email = @email, firstname = @first, lastname = @last, name = @name,
                role = @role, course = @course, school_year = @year, semester = @semester
            WHERE id = @id AND is_deleted = 0
            """;
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@email", email); command.Parameters.AddWithValue("@first", firstName);
        command.Parameters.AddWithValue("@last", lastName); command.Parameters.AddWithValue("@name", name);
        command.Parameters.AddWithValue("@role", role); command.Parameters.AddWithValue("@course", course ?? "");
        command.Parameters.AddWithValue("@year", year ?? "2025-2026"); command.Parameters.AddWithValue("@semester", semester ?? "1st Semester");
        command.Parameters.AddWithValue("@id", id);
        return await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<int> ResetPasswordAsync(string id, string passwordHash, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand("UPDATE users SET password = @password WHERE id = @id AND is_deleted = 0", connection);
        command.Parameters.AddWithValue("@password", passwordHash); command.Parameters.AddWithValue("@id", id);
        return await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<UserDeleteInfo?> GetDeleteInfoAsync(string id, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        string? role;
        await using (var command = new MySqlCommand("SELECT role FROM users WHERE id = @id AND is_deleted = 0", connection))
        {
            command.Parameters.AddWithValue("@id", id);
            role = await command.ExecuteScalarAsync(ct) as string;
        }
        if (role is null) return null;
        await using var count = new MySqlCommand("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_deleted = 0", connection);
        return new UserDeleteInfo(role, Convert.ToInt32(await count.ExecuteScalarAsync(ct)));
    }

    public async Task<int> SoftDeleteAsync(string id, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand("UPDATE users SET is_deleted = 1 WHERE id = @id AND is_deleted = 0", connection);
        command.Parameters.AddWithValue("@id", id);
        return await command.ExecuteNonQueryAsync(ct);
    }
}
