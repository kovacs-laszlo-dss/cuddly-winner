using Backend.Hubs;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    WebRootPath = "frontend"
});

builder.Services.AddSignalR();

var app = builder.Build();

app.UseHttpsRedirection();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapHub<ApplicationHub>("/hubs/application");
app.MapFallbackToFile("index.html");

app.Run();
