using MySqlConnector;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Infrastructure;

namespace StudentTracker.Api.Repositories;

public sealed class TeacherAssignmentsRepository(DbConnectionFactory db)
{
    public async Task<IReadOnlyList<object>> ListAsync(string role, string userId, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        var sql = """
            SELECT ta.id, ta.teacher_id teacherId, ta.student_id studentId, ta.subject,
                   COALESCE(ta.course, '') course, COALESCE(ta.section, '') section,
                   ta.school_year schoolYear, ta.semester
            FROM teacher_assignments ta
            JOIN users t ON t.id = ta.teacher_id AND t.is_deleted = 0
            JOIN users s ON s.id = ta.student_id AND s.is_deleted = 0
            WHERE ta.is_deleted = 0
            """;
        if (role == "teacher") sql += " AND ta.teacher_id = @uid";
        else if (role == "student") sql += " AND ta.student_id = @uid";
        sql += " ORDER BY ta.school_year DESC, ta.semester, ta.subject";
        await using var command = new MySqlCommand(sql, connection);
        if (role != "admin") command.Parameters.AddWithValue("@uid", userId);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var rows = new List<object>();
        while (await reader.ReadAsync(ct))
            rows.Add(new
            {
                id = reader.GetInt32("id"), teacherId = reader.GetString("teacherId"),
                studentId = reader.GetString("studentId"), subject = reader.GetString("subject"),
                course = reader.GetString("course"), section = reader.GetString("section"),
                schoolYear = reader.GetString("schoolYear"), semester = reader.GetString("semester")
            });
        return rows;
    }

    public async Task<bool> UsersExistAsync(string teacherId, string studentId, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        const string sql = """
            SELECT COUNT(*) FROM users
            WHERE (id = @teacher AND role = 'teacher' AND is_deleted = 0)
               OR (id = @student AND role = 'student' AND is_deleted = 0)
            """;
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@teacher", teacherId);
        command.Parameters.AddWithValue("@student", studentId);
        return Convert.ToInt32(await command.ExecuteScalarAsync(ct)) == 2;
    }

    public async Task<long> CreateAsync(AssignmentInput input, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        const string sql = """
            INSERT INTO teacher_assignments
                (teacher_id, student_id, subject, course, section, school_year, semester)
            VALUES (@teacher, @student, @subject, @course, @section, @year, @semester)
            """;
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@teacher", input.TeacherId.Trim());
        command.Parameters.AddWithValue("@student", input.StudentId.Trim());
        command.Parameters.AddWithValue("@subject", input.Subject.Trim());
        command.Parameters.AddWithValue("@course", input.Course ?? "");
        command.Parameters.AddWithValue("@section", input.Section ?? "");
        command.Parameters.AddWithValue("@year", input.SchoolYear ?? "2025-2026");
        command.Parameters.AddWithValue("@semester", input.Semester ?? "1st Semester");
        await command.ExecuteNonQueryAsync(ct);
        return command.LastInsertedId;
    }

    public async Task<int> SoftDeleteAsync(int id, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand(
            "UPDATE teacher_assignments SET is_deleted = 1 WHERE id = @id AND is_deleted = 0", connection);
        command.Parameters.AddWithValue("@id", id);
        return await command.ExecuteNonQueryAsync(ct);
    }
}
