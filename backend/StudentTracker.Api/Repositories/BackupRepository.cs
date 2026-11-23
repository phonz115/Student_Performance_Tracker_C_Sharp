using MySqlConnector;
using StudentTracker.Api.Contracts;
using StudentTracker.Api.Infrastructure;

namespace StudentTracker.Api.Repositories;

public sealed class BackupRepository(DbConnectionFactory db)
{
    public async Task<object> DownloadAsync(CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        var users = await ReadRowsAsync(connection, """
            SELECT id, email, COALESCE(NULLIF(name, ''), TRIM(CONCAT_WS(' ', firstname, lastname))) name,
                   role, course, school_year schoolYear, semester, password passwordHash
            FROM users WHERE is_deleted = 0 ORDER BY id
            """, reader => new
            {
                id = reader.GetString("id"), email = reader.GetString("email"), name = reader.GetString("name"),
                role = reader.GetString("role"), course = reader.GetString("course"),
                schoolYear = reader.GetString("schoolYear"), semester = reader.GetString("semester"),
                passwordHash = reader.GetString("passwordHash")
            }, ct);
        var grades = await ReadRowsAsync(connection, """
            SELECT g.id, g.student_id studentId, g.subject, g.score, g.feedback,
                   CASE WHEN active_teacher.id IS NULL THEN NULL ELSE g.teacher_id END teacherId,
                   g.school_year schoolYear, g.semester, g.term
            FROM grades g
            JOIN users active_student ON active_student.id = g.student_id AND active_student.is_deleted = 0
            LEFT JOIN users active_teacher ON active_teacher.id = g.teacher_id AND active_teacher.is_deleted = 0
            WHERE g.is_deleted = 0 ORDER BY g.id
            """, reader => new
            {
                id = reader.GetInt32("id"), studentId = reader.GetString("studentId"),
                subject = reader.IsDBNull(reader.GetOrdinal("subject")) ? "" : reader.GetString("subject"),
                score = reader.GetDecimal("score"), feedback = reader.IsDBNull(reader.GetOrdinal("feedback")) ? "" : reader.GetString("feedback"),
                teacherId = reader.IsDBNull(reader.GetOrdinal("teacherId")) ? null : reader.GetString("teacherId"),
                schoolYear = reader.GetString("schoolYear"), semester = reader.GetString("semester"), term = reader.GetString("term")
            }, ct);
        var assignments = await ReadRowsAsync(connection, """
            SELECT ta.id, ta.teacher_id teacherId, ta.student_id studentId, ta.subject, ta.course, ta.section,
                   ta.school_year schoolYear, ta.semester FROM teacher_assignments ta
            JOIN users t ON t.id = ta.teacher_id AND t.is_deleted = 0
            JOIN users s ON s.id = ta.student_id AND s.is_deleted = 0
            WHERE ta.is_deleted = 0 ORDER BY ta.id
            """, reader => new
            {
                id = reader.GetInt32("id"), teacherId = reader.GetString("teacherId"), studentId = reader.GetString("studentId"),
                subject = reader.GetString("subject"), course = reader.IsDBNull(reader.GetOrdinal("course")) ? "" : reader.GetString("course"),
                section = reader.IsDBNull(reader.GetOrdinal("section")) ? "" : reader.GetString("section"),
                schoolYear = reader.GetString("schoolYear"), semester = reader.GetString("semester")
            }, ct);
        var courses = await ReadRowsAsync(connection, """
            SELECT c.id, c.code, c.name, c.description, c.school_year schoolYear, c.semester,
                   CASE WHEN t.id IS NULL THEN NULL ELSE c.teacher_id END teacherId
            FROM courses c LEFT JOIN users t ON t.id = c.teacher_id AND t.is_deleted = 0
            WHERE c.is_deleted = 0 ORDER BY c.id
            """, reader => new
            {
                id = reader.GetInt32("id"), code = reader.GetString("code"), name = reader.GetString("name"),
                description = reader.IsDBNull(reader.GetOrdinal("description")) ? "" : reader.GetString("description"),
                schoolYear = reader.GetString("schoolYear"), semester = reader.GetString("semester"),
                teacherId = reader.IsDBNull(reader.GetOrdinal("teacherId")) ? null : reader.GetString("teacherId")
            }, ct);
        var subjects = await ReadRowsAsync(connection, """
            SELECT s.subject_id id, s.subject_name name,
                   CASE WHEN u.id IS NULL THEN NULL ELSE s.teacher_id END teacherId
            FROM subjects s LEFT JOIN users u ON u.id = s.teacher_id AND u.is_deleted = 0
            WHERE s.is_deleted = 0 ORDER BY s.subject_id
            """, reader => new
            {
                id = reader.GetInt32("id"), name = reader.GetString("name"),
                teacherId = reader.IsDBNull(reader.GetOrdinal("teacherId")) ? null : reader.GetString("teacherId")
            }, ct);
        return new { exportedAt = DateTimeOffset.UtcNow, users, grades, assignments, courses, subjects };
    }

    public async Task RestoreAsync(RestoreSnapshot snapshot, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        foreach (var user in snapshot.Users!)
        {
            var (first, last) = SplitName(user.Name!);
            await using var command = new MySqlCommand("""
                INSERT INTO users (id, email, firstname, lastname, name, role, password, course, school_year, semester, is_deleted)
                VALUES (@id, @email, @first, @last, @name, @role, @password, @course, @year, @semester, 0)
                ON DUPLICATE KEY UPDATE email=VALUES(email), firstname=VALUES(firstname), lastname=VALUES(lastname),
                    name=VALUES(name), role=VALUES(role), course=VALUES(course),
                    school_year=VALUES(school_year), semester=VALUES(semester), is_deleted=0
                """, connection, transaction);
            command.Parameters.AddWithValue("@id", user.Id!.Trim()); command.Parameters.AddWithValue("@email", user.Email!.Trim().ToLowerInvariant());
            command.Parameters.AddWithValue("@first", first); command.Parameters.AddWithValue("@last", last);
            command.Parameters.AddWithValue("@name", user.Name!.Trim()); command.Parameters.AddWithValue("@role", user.Role!.Trim().ToLowerInvariant());
            command.Parameters.AddWithValue("@password", user.PasswordHash!); command.Parameters.AddWithValue("@course", user.Course ?? "");
            command.Parameters.AddWithValue("@year", user.SchoolYear ?? "2025-2026"); command.Parameters.AddWithValue("@semester", user.Semester ?? "1st Semester");
            await command.ExecuteNonQueryAsync(ct);
        }
        foreach (var course in snapshot.Courses!)
        {
            await using var command = new MySqlCommand("""
                INSERT INTO courses (code,name,description,school_year,semester,teacher_id,is_deleted)
                VALUES (@code,@name,@description,@year,@semester,@teacher,0)
                ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),school_year=VALUES(school_year),
                    semester=VALUES(semester),teacher_id=VALUES(teacher_id),is_deleted=0
                """, connection, transaction);
            command.Parameters.AddWithValue("@code", course.Code!.Trim().ToUpperInvariant()); command.Parameters.AddWithValue("@name", course.Name!.Trim());
            command.Parameters.AddWithValue("@description", course.Description ?? ""); command.Parameters.AddWithValue("@year", course.SchoolYear ?? "2025-2026");
            command.Parameters.AddWithValue("@semester", course.Semester ?? "1st Semester"); command.Parameters.AddWithValue("@teacher", NullIfBlank(course.TeacherId));
            await command.ExecuteNonQueryAsync(ct);
        }
        foreach (var subject in snapshot.Subjects!)
        {
            await using var command = new MySqlCommand("""
                INSERT INTO subjects (subject_name,teacher_id,is_deleted)
                SELECT @name,@teacher,0 WHERE NOT EXISTS
                    (SELECT 1 FROM subjects WHERE subject_name=@name AND teacher_id <=> @teacher AND is_deleted=0)
                """, connection, transaction);
            command.Parameters.AddWithValue("@name", subject.Name!.Trim()); command.Parameters.AddWithValue("@teacher", NullIfBlank(subject.TeacherId));
            await command.ExecuteNonQueryAsync(ct);
        }
        foreach (var item in snapshot.Assignments!)
        {
            await using var command = new MySqlCommand("""
                INSERT INTO teacher_assignments (teacher_id,student_id,subject,course,section,school_year,semester,is_deleted)
                VALUES (@teacher,@student,@subject,@course,@section,@year,@semester,0)
                ON DUPLICATE KEY UPDATE course=VALUES(course),section=VALUES(section),is_deleted=0
                """, connection, transaction);
            command.Parameters.AddWithValue("@teacher", item.TeacherId!.Trim()); command.Parameters.AddWithValue("@student", item.StudentId!.Trim());
            command.Parameters.AddWithValue("@subject", item.Subject!.Trim()); command.Parameters.AddWithValue("@course", item.Course ?? "");
            command.Parameters.AddWithValue("@section", item.Section ?? ""); command.Parameters.AddWithValue("@year", item.SchoolYear ?? "2025-2026");
            command.Parameters.AddWithValue("@semester", item.Semester ?? "1st Semester"); await command.ExecuteNonQueryAsync(ct);
        }
        foreach (var grade in snapshot.Grades!)
        {
            await using var command = new MySqlCommand("""
                INSERT INTO grades (id,student_id,subject,score,feedback,teacher_id,school_year,semester,term,is_deleted)
                VALUES (@id,@student,@subject,@score,@feedback,@teacher,@year,@semester,@term,0)
                ON DUPLICATE KEY UPDATE student_id=VALUES(student_id),subject=VALUES(subject),score=VALUES(score),
                    feedback=VALUES(feedback),teacher_id=VALUES(teacher_id),school_year=VALUES(school_year),
                    semester=VALUES(semester),term=VALUES(term),is_deleted=0
                """, connection, transaction);
            command.Parameters.AddWithValue("@id", grade.Id.HasValue ? grade.Id.Value : DBNull.Value);
            command.Parameters.AddWithValue("@student", grade.StudentId!.Trim()); command.Parameters.AddWithValue("@subject", grade.Subject!.Trim());
            command.Parameters.AddWithValue("@score", grade.Score); command.Parameters.AddWithValue("@feedback", grade.Feedback ?? "");
            command.Parameters.AddWithValue("@teacher", NullIfBlank(grade.TeacherId)); command.Parameters.AddWithValue("@year", grade.SchoolYear ?? "2025-2026");
            command.Parameters.AddWithValue("@semester", grade.Semester ?? "1st Semester"); command.Parameters.AddWithValue("@term", grade.Term ?? "Prelim");
            await command.ExecuteNonQueryAsync(ct);
        }
        await transaction.CommitAsync(ct);
    }

    private static async Task<List<T>> ReadRowsAsync<T>(MySqlConnection connection, string sql, Func<MySqlDataReader, T> map, CancellationToken ct)
    {
        await using var command = new MySqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var rows = new List<T>();
        while (await reader.ReadAsync(ct)) rows.Add(map(reader));
        return rows;
    }
    private static object NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? DBNull.Value : value.Trim();
    private static (string First, string Last) SplitName(string name)
    {
        var parts = name.Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        return parts.Length == 1 ? (parts[0], "") : (parts[0], parts[1]);
    }
}
