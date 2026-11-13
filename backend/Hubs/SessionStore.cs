using System.Collections.Concurrent;
using MessagePack;

namespace Backend.Hubs;

[MessagePackObject]
public sealed record SessionContent(
    [property: Key("id")] string Id,
    [property: Key("text")] byte[] Text,
    [property: Key("revision")] long Revision);
[MessagePackObject]
public sealed record SessionCreated(
    [property: Key("id")] string Id,
    [property: Key("editKey")] string EditKey);

public sealed class SessionStore
{
    private sealed record Session(string EditKey, SessionContent Content);
    private readonly ConcurrentDictionary<string, Session> sessions = new();

    public SessionCreated Create()
    {
        var id = Guid.NewGuid().ToString("N");
        var editKey = Guid.NewGuid().ToString("N");
        sessions[id] = new Session(editKey, new SessionContent(id, [], 0));
        return new SessionCreated(id, editKey);
    }

    public SessionContent? Get(string id) => sessions.TryGetValue(id, out var session) ? session.Content : null;

    public SessionContent? Update(string id, string editKey, byte[] text)
    {
        while (sessions.TryGetValue(id, out var session) && session.EditKey == editKey)
        {
            var updated = session with { Content = new SessionContent(id, text, session.Content.Revision + 1) };
            if (sessions.TryUpdate(id, updated, session)) return updated.Content;
        }
        return null;
    }
}
