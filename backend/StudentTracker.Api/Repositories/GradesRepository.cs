using MySqlConnector;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Infrastructure;

namespace StudentTracker.Api.Repositories;

public sealed record GradeExisting(string StudentId, string? TeacherId);

public sealed class GradesRepository(DbConnectionFactory db)
{
    public async Task<IReadOnlyList<object>> ListAsync(string role, string userId, CancellationToken ct)
    {
        var sql = """
            SELECT g.id, g.student_id studentId,
                   COALESCE(u.name, TRIM(CONCAT_WS(' ', u.firstname, u.lastname))) studentName,
                   COALESCE(g.subject, '') subject, g.score, COALESCE(g.feedback, '') feedback,
                   g.teacher_id teacherId, g.school_year schoolYear, g.semester, g.term
            FROM grades g JOIN users u ON u.id = g.student_id AND u.is_deleted = 0
            WHERE g.is_deleted = 0
            """;
        if (role == "student") sql += " AND g.student_id = @uid";
        else if (role == "teacher") sql += " AND (g.teacher_id = @uid OR g.student_id IN (SELECT student_id FROM teacher_assignments WHERE teacher_id = @uid AND is_deleted = 0))";
        sql += " ORDER BY g.id DESC";
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand(sql, connection);
        if (role != "admin") command.Parameters.AddWithValue("@uid", userId);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var rows = new List<object>();
        while (await reader.ReadAsync(ct)) rows.Add(Map(reader));
        return rows;
    }

    public async Task<bool> IsAssignedAsync(string teacherId, string studentId, string subject, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand("""
            SELECT COUNT(*) FROM teacher_assignments
            WHERE teacher_id = @teacher AND student_id = @student AND subject = @subject AND is_deleted = 0
            """, connection);
        command.Parameters.AddWithValue("@teacher", teacherId);
        command.Parameters.AddWithValue("@student", studentId.Trim());
        command.Parameters.AddWithValue("@subject", subject.Trim());
        return Convert.ToInt32(await command.ExecuteScalarAsync(ct)) > 0;
    }

    public async Task<long> CreateAsync(GradeInput input, string role, string userId, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        const string sql = """
            INSERT INTO grades (student_id, subject, score, feedback, teacher_id, school_year, semester, term)
            VALUES (@student, @subject, @score, @feedback, @teacher, @year, @semester, @term)
            """;
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@student", input.StudentId.Trim());
        command.Parameters.AddWithValue("@subject", input.Subject.Trim());
        command.Parameters.AddWithValue("@score", input.Score);
        command.Parameters.AddWithValue("@feedback", input.Feedback ?? "");
        command.Parameters.AddWithValue("@teacher", role == "teacher" ? userId : DBNull.Value);
        command.Parameters.AddWithValue("@year", input.SchoolYear ?? "2025-2026");
        command.Parameters.AddWithValue("@semester", input.Semester ?? "1st Semester");
        command.Parameters.AddWithValue("@term", input.Term ?? "Prelim");
        await command.ExecuteNonQueryAsync(ct);
        return command.LastInsertedId;
    }

    public async Task<GradeExisting?> FindAsync(int id, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand(
            "SELECT student_id, teacher_id FROM grades WHERE id = @id AND is_deleted = 0", connection);
        command.Parameters.AddWithValue("@id", id);
        await using var reader = await command.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;
        return new GradeExisting(reader.GetString("student_id"),
            reader.IsDBNull(reader.GetOrdinal("teacher_id")) ? null : reader.GetString("teacher_id"));
    }

    public async Task<int> UpdateAsync(int id, GradeUpdateInput input, string? teacherId, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        var sql = """
            UPDATE grades SET subject = @subject, score = @score, feedback = @feedback,
                school_year = @year, semester = @semester, term = @term
            WHERE id = @id AND is_deleted = 0
            """;
        if (teacherId is not null) sql += " AND teacher_id = @teacher";
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@subject", input.Subject.Trim());
        command.Parameters.AddWithValue("@score", input.Score);
        command.Parameters.AddWithValue("@feedback", input.Feedback ?? "");
        command.Parameters.AddWithValue("@year", input.SchoolYear ?? "2025-2026");
        command.Parameters.AddWithValue("@semester", input.Semester ?? "1st Semester");
        command.Parameters.AddWithValue("@term", input.Term ?? "Prelim");
        command.Parameters.AddWithValue("@id", id);
        if (teacherId is not null) command.Parameters.AddWithValue("@teacher", teacherId);
        return await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<object?> ReadAsync(int id, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        const string sql = """
            SELECT g.id, g.student_id studentId,
                   COALESCE(u.name, TRIM(CONCAT_WS(' ', u.firstname, u.lastname))) studentName,
                   COALESCE(g.subject, '') subject, g.score, COALESCE(g.feedback, '') feedback,
                   g.teacher_id teacherId, g.school_year schoolYear, g.semester, g.term
            FROM grades g JOIN users u ON u.id = g.student_id AND u.is_deleted = 0
            WHERE g.id = @id AND g.is_deleted = 0
            """;
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@id", id);
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? Map(reader) : null;
    }

    public async Task<int> SoftDeleteAsync(int id, string? teacherId, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        var sql = "UPDATE grades SET is_deleted = 1 WHERE id = @id AND is_deleted = 0";
        if (teacherId is not null) sql += " AND teacher_id = @teacher";
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@id", id);
        if (teacherId is not null) command.Parameters.AddWithValue("@teacher", teacherId);
        return await command.ExecuteNonQueryAsync(ct);
    }

    private static object Map(MySqlDataReader reader) => new
    {
        id = reader.GetInt32("id"), studentId = reader.GetString("studentId"),
        studentName = reader.GetString("studentName"), subject = reader.GetString("subject"),
        score = reader.GetDecimal("score"), feedback = reader.GetString("feedback"),
        teacherId = reader.IsDBNull(reader.GetOrdinal("teacherId")) ? null : reader.GetString("teacherId"),
        schoolYear = reader.GetString("schoolYear"), semester = reader.GetString("semester"), term = reader.GetString("term")
    };
}
