using MySqlConnector;
using StudentTracker.Api.Infrastructure;

namespace StudentTracker.Api.Repositories;

public sealed class SubjectsRepository(DbConnectionFactory db)
{
    public async Task<IReadOnlyList<object>> ListAsync(CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand(
            "SELECT subject_id id, subject_name name, teacher_id teacherId FROM subjects WHERE is_deleted = 0 ORDER BY subject_name",
            connection);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var rows = new List<object>();
        while (await reader.ReadAsync(ct))
            rows.Add(new
            {
                id = reader.GetInt32("id"), name = reader.GetString("name"),
                teacherId = reader.IsDBNull(reader.GetOrdinal("teacherId")) ? null : reader.GetString("teacherId")
            });
        return rows;
    }

    public async Task<bool> IsTeacherAsync(string teacherId, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand(
            "SELECT COUNT(*) FROM users WHERE id = @id AND role = 'teacher' AND is_deleted = 0", connection);
        command.Parameters.AddWithValue("@id", teacherId);
        return Convert.ToInt32(await command.ExecuteScalarAsync(ct)) > 0;
    }

    public async Task<long> CreateAsync(string name, string teacherId, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand(
            "INSERT INTO subjects (subject_name, teacher_id) VALUES (@name, @teacher)", connection);
        command.Parameters.AddWithValue("@name", name);
        command.Parameters.AddWithValue("@teacher", teacherId);
        await command.ExecuteNonQueryAsync(ct);
        return command.LastInsertedId;
    }
}
