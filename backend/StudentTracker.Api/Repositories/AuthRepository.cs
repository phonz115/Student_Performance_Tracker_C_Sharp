using MySqlConnector;
using StudentTracker.Api.Infrastructure;

namespace StudentTracker.Api.Repositories;

public sealed record LoginUser(string Id, string Email, string Name, string PasswordHash, string Role, string Course, string SchoolYear, string Semester);
public sealed record ResetUser(string Id, string Email);

public sealed class AuthRepository(DbConnectionFactory db)
{
    public async Task<LoginUser?> FindLoginUserAsync(string identifier, string role, CancellationToken ct)
    {
        var column = role == "student" ? "id" : "email";
        await using var connection = await db.OpenAsync(ct);
        var sql = $"""
            SELECT id, email, COALESCE(name, TRIM(CONCAT_WS(' ', firstname, lastname))) name,
                   password, role, COALESCE(course, '') course, COALESCE(school_year, '') schoolYear,
                   COALESCE(semester, '') semester
            FROM users WHERE {column} = @identifier AND role = @role AND is_deleted = 0 LIMIT 1
            """;
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@identifier", identifier);
        command.Parameters.AddWithValue("@role", role);
        await using var reader = await command.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;
        return new LoginUser(reader.GetString("id"), reader.GetString("email"), reader.GetString("name"),
            reader.GetString("password"), reader.GetString("role"), reader.GetString("course"),
            reader.GetString("schoolYear"), reader.GetString("semester"));
    }

    public async Task<ResetUser?> FindResetUserAsync(string identifier, string role, CancellationToken ct)
    {
        var column = role == "student" ? "id" : "email";
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand(
            $"SELECT id, email FROM users WHERE {column} = @identifier AND role = @role AND is_deleted = 0 LIMIT 1", connection);
        command.Parameters.AddWithValue("@identifier", identifier);
        command.Parameters.AddWithValue("@role", role);
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? new ResetUser(reader.GetString("id"), reader.GetString("email")) : null;
    }

    public async Task SaveResetTokenAsync(string tokenHash, string userId, long expiresAt, long createdAt, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        await using (var revoke = new MySqlCommand(
            "UPDATE password_reset_tokens SET is_deleted = 1 WHERE is_deleted = 0 AND (user_id = @userId OR expires_at <= @now)", connection, transaction))
        {
            revoke.Parameters.AddWithValue("@userId", userId); revoke.Parameters.AddWithValue("@now", createdAt);
            await revoke.ExecuteNonQueryAsync(ct);
        }
        await using (var insert = new MySqlCommand("""
            INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at, is_deleted)
            VALUES (@hash, @userId, @expiresAt, @createdAt, 0)
            """, connection, transaction))
        {
            insert.Parameters.AddWithValue("@hash", tokenHash); insert.Parameters.AddWithValue("@userId", userId);
            insert.Parameters.AddWithValue("@expiresAt", expiresAt); insert.Parameters.AddWithValue("@createdAt", createdAt);
            await insert.ExecuteNonQueryAsync(ct);
        }
        await transaction.CommitAsync(ct);
    }

    public async Task RevokeResetTokenAsync(string tokenHash, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var command = new MySqlCommand("UPDATE password_reset_tokens SET is_deleted = 1 WHERE token_hash = @hash AND is_deleted = 0", connection);
        command.Parameters.AddWithValue("@hash", tokenHash);
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<bool> CompletePasswordResetAsync(string tokenHash, string passwordHash, long now, CancellationToken ct)
    {
        await using var connection = await db.OpenAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        string? userId;
        await using (var find = new MySqlCommand("""
            SELECT user_id FROM password_reset_tokens
            WHERE token_hash = @hash AND expires_at > @now AND is_deleted = 0
            LIMIT 1 FOR UPDATE
            """, connection, transaction))
        {
            find.Parameters.AddWithValue("@hash", tokenHash); find.Parameters.AddWithValue("@now", now);
            userId = await find.ExecuteScalarAsync(ct) as string;
        }
        if (userId is null) { await transaction.RollbackAsync(ct); return false; }
        await using (var update = new MySqlCommand("UPDATE users SET password = @password WHERE id = @id AND is_deleted = 0", connection, transaction))
        {
            update.Parameters.AddWithValue("@password", passwordHash); update.Parameters.AddWithValue("@id", userId);
            if (await update.ExecuteNonQueryAsync(ct) != 1) { await transaction.RollbackAsync(ct); return false; }
        }
        await using (var revoke = new MySqlCommand("UPDATE password_reset_tokens SET is_deleted = 1 WHERE user_id = @id AND is_deleted = 0", connection, transaction))
        {
            revoke.Parameters.AddWithValue("@id", userId); await revoke.ExecuteNonQueryAsync(ct);
        }
        await transaction.CommitAsync(ct);
        return true;
    }
}
