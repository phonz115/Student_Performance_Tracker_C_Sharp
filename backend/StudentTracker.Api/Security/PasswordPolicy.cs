namespace StudentTracker.Api.Security;

public static class PasswordPolicy
{
    public static string? Validate(string password)
    {
        if (password.Length < 8)
        {
            return "Password must be at least 8 characters.";
        }

        if (!password.Any(char.IsUpper))
        {
            return "Password must include at least one uppercase letter.";
        }

        if (!password.Any(char.IsDigit))
        {
            return "Password must include at least one number.";
        }

        if (password.All(char.IsAsciiLetterOrDigit))
        {
            return "Password must include at least one special character.";
        }

        return null;
    }
}
