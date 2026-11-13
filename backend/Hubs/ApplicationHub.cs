using Microsoft.AspNetCore.SignalR;

namespace Backend.Hubs;

public interface IApplicationClient
{
    Task Connected(DateTimeOffset serverTime);
    Task SessionUpdated(SessionContent content);
}

public sealed class ApplicationHub(SessionStore sessions, ILogger<ApplicationHub> logger) : Hub<IApplicationClient>
{
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.Connected(DateTimeOffset.UtcNow);
        await base.OnConnectedAsync();
    }

    public DateTimeOffset Ping() => DateTimeOffset.UtcNow;

    public SessionCreated CreateSession() => sessions.Create();

    public async Task<SessionContent> JoinSession(string id)
    {
        if (sessions.Get(id) is null) throw new HubException("A session nem található.");
        await Groups.AddToGroupAsync(Context.ConnectionId, id);
        return sessions.Get(id)!;
    }

    public Task LeaveSession(string id) => Groups.RemoveFromGroupAsync(Context.ConnectionId, id);

    public async Task<SessionContent> UpdateSession(string id, string editKey, byte[] text)
    {
        logger.LogInformation("Üzenet érkezett.");
        var content = sessions.Update(id, editKey, text)
            ?? throw new HubException("A session nem található vagy nem szerkeszthető.");
        await Clients.Group(id).SessionUpdated(content);
        logger.LogInformation("Üzenet továbbítva.");
        return content;
    }
}
