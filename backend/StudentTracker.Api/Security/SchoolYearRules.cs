using System.Text.RegularExpressions;

namespace StudentTracker.Api.Security;

public static class SchoolYearRules
{
    public const string ErrorMessage = "School year must use consecutive years in YYYY-YYYY format, for example 2027-2028.";

    public static string? Validate(string? value)
    {
        if (value is null) return null;

        var match = Regex.Match(value.Trim(), @"\A(?<start>\d{4})-(?<end>\d{4})\z", RegexOptions.CultureInvariant);
        if (!match.Success ||
            !int.TryParse(match.Groups["start"].Value, out var startYear) ||
            !int.TryParse(match.Groups["end"].Value, out var endYear) ||
            startYear < 1900 || endYear != startYear + 1)
            return ErrorMessage;

        return null;
    }
}
