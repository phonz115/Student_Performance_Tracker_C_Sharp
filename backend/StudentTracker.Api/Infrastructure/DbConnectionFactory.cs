using MySqlConnector;

namespace StudentTracker.Api.Infrastructure;

public sealed class DbConnectionFactory
{
    private readonly string _connectionString;

    public DbConnectionFactory(IConfiguration configuration)
    {
        _connectionString =
            Environment.GetEnvironmentVariable("MYSQL_CONNECTION_STRING") ??
            configuration.GetConnectionString("Default") ??
            throw new InvalidOperationException(
                "Set the MYSQL_CONNECTION_STRING environment variable for the local database.");
    }

    public async Task<MySqlConnection> OpenAsync(CancellationToken cancellationToken = default)
    {
        var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }
}