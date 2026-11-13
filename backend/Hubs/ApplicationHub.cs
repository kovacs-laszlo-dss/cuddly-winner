using Microsoft.AspNetCore.SignalR;

namespace Backend.Hubs;

public interface IApplicationClient
{
    Task Connected(DateTimeOffset serverTime);
}

public sealed class ApplicationHub : Hub<IApplicationClient>
{
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.Connected(DateTimeOffset.UtcNow);
        await base.OnConnectedAsync();
    }

    public DateTimeOffset Ping() => DateTimeOffset.UtcNow;
}
