using System.Security.Cryptography;
using System.Text;

namespace StudentTracker.Api.Security;

public static class PasswordHash
{
    private const int Iterations = 120_000;
    private const int HashBytes = 32;

    public static string Create(string password)
    {
        ArgumentNullException.ThrowIfNull(password);

        // Match the existing Express API: PBKDF2 uses the base64url salt text as UTF-8 input.
        var salt = EncodeBase64Url(RandomNumberGenerator.GetBytes(16));
        var hash = Rfc2898DeriveBytes.Pbkdf2(
            password,
            Encoding.UTF8.GetBytes(salt),
            Iterations,
            HashAlgorithmName.SHA256,
            HashBytes);

        return string.Concat("p2$", Iterations, "$", salt, "$", EncodeBase64Url(hash));
    }

    public static bool Verify(string password, string? stored)
    {
        if (string.IsNullOrEmpty(password) || string.IsNullOrWhiteSpace(stored))
        {
            return false;
        }

        var parts = stored.Split('$');
        if (parts.Length != 4 ||
            (parts[0] != "p2" && parts[0] != "pbkdf2_sha256") ||
            !int.TryParse(parts[1], out var iterations) ||
            iterations is < 10_000 or > 1_000_000)
        {
            return false;
        }

        try
        {
            var isCurrentFormat = parts[0] == "p2";
            var expected = isCurrentFormat
                ? DecodeBase64Url(parts[3])
                : Convert.FromHexString(parts[3]);
            var expectedLength = isCurrentFormat ? HashBytes : 64;

            if (expected.Length != expectedLength)
            {
                return false;
            }

            // The legacy Express verifier also supports pbkdf2_sha256 with a hex digest.
            var actual = Rfc2898DeriveBytes.Pbkdf2(
                password,
                Encoding.UTF8.GetBytes(parts[2]),
                iterations,
                HashAlgorithmName.SHA256,
                expected.Length);

            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static string EncodeBase64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    private static byte[] DecodeBase64Url(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        normalized = normalized.PadRight((normalized.Length + 3) / 4 * 4, '=');
        return Convert.FromBase64String(normalized);
    }
}