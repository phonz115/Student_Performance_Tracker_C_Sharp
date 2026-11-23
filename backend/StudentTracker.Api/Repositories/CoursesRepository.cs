using MySqlConnector;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Infrastructure;

namespace StudentTracker.Api.Repositories;

public sealed class CoursesRepository(DbConnectionFactory db)
{
    public async Task<IReadOnlyList<object>> ListAsync(CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        const string sql = """
            SELECT id, code, name, COALESCE(description, '') description,
                   school_year schoolYear, semester, teacher_id teacherId, created_at createdAt
            FROM courses WHERE is_deleted = 0 ORDER BY created_at DESC, id DESC
            """;
        await using var command = new MySqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var rows = new List<object>();
        while (await reader.ReadAsync(ct))
        {
            rows.Add(new
            {
                id = reader.GetInt32("id"), code = reader.GetString("code"),
                name = reader.GetString("name"), description = reader.GetString("description"),
                schoolYear = reader.GetString("schoolYear"), semester = reader.GetString("semester"),
                teacherId = reader.IsDBNull(reader.GetOrdinal("teacherId")) ? null : reader.GetString("teacherId"),
                createdAt = reader.IsDBNull(reader.GetOrdinal("createdAt")) ? (DateTime?)null : reader.GetDateTime("createdAt")
            });
        }
        return rows;
    }

    public async Task<long> CreateAsync(CourseInput input, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        const string sql = """
            INSERT INTO courses (code, name, description, school_year, semester, teacher_id)
            VALUES (@code, @name, @description, @year, @semester, @teacher)
            """;
        await using var command = new MySqlCommand(sql, connection);
        Bind(command, input);
        await command.ExecuteNonQueryAsync(ct);
        return command.LastInsertedId;
    }

    public async Task<int> UpdateAsync(int id, CourseInput input, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        const string sql = """
            UPDATE courses SET code = @code, name = @name, description = @description,
                school_year = @year, semester = @semester, teacher_id = @teacher
            WHERE id = @id AND is_deleted = 0
            """;
        await using var command = new MySqlCommand(sql, connection);
        Bind(command, input);
        command.Parameters.AddWithValue("@id", id);
        return await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<int> SoftDeleteAsync(int id, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand(
            "UPDATE courses SET is_deleted = 1 WHERE id = @id AND is_deleted = 0", connection);
        command.Parameters.AddWithValue("@id", id);
        return await command.ExecuteNonQueryAsync(ct);
    }

    private static void Bind(MySqlCommand command, CourseInput input)
    {
        command.Parameters.AddWithValue("@code", input.Code.Trim().ToUpperInvariant());
        command.Parameters.AddWithValue("@name", input.Name.Trim());
        command.Parameters.AddWithValue("@description", input.Description ?? "");
        command.Parameters.AddWithValue("@year", input.SchoolYear ?? "2025-2026");
        command.Parameters.AddWithValue("@semester", input.Semester ?? "1st Semester");
        command.Parameters.AddWithValue("@teacher", string.IsNullOrWhiteSpace(input.TeacherId)
            ? DBNull.Value : input.TeacherId.Trim());
    }
}
