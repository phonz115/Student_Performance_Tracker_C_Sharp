using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.RateLimiting;
using StudentTracker.Api.Infrastructure;
using StudentTracker.Api.Repositories;
using StudentTracker.Api.Services;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddSingleton<DbConnectionFactory>();
builder.Services.AddScoped<AuthRepository>();
builder.Services.AddScoped<BackupRepository>();
builder.Services.AddScoped<CoursesRepository>();
builder.Services.AddScoped<GradesRepository>();
builder.Services.AddScoped<SubjectsRepository>();
builder.Services.AddScoped<TeacherAssignmentsRepository>();
builder.Services.AddScoped<UsersRepository>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<BackupService>();
builder.Services.AddScoped<CoursesService>();
builder.Services.AddScoped<GradesService>();
builder.Services.AddScoped<SubjectsService>();
builder.Services.AddScoped<TeacherAssignmentsService>();
builder.Services.AddScoped<UsersService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("local", policy =>
    {
        policy
            .WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "student_tracker_session";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.ExpireTimeSpan = TimeSpan.FromMinutes(30);
        options.SlidingExpiration = true;
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("password-reset", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(15),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.ContentType = "application/json";
        await context.HttpContext.Response.WriteAsJsonAsync(
            new { message = "Too many reset requests. Please wait before trying again." },
            cancellationToken);
    };
});

var app = builder.Build();

app.UseRouting();
app.UseCors("local");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/api/health", () => Results.Ok(new { ok = true }));

app.Run();
