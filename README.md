# Secure Live Messaging

A small Angular and ASP.NET Core application for sharing encrypted text in real time.

## Requirements

- .NET 10 SDK
- Node.js 24.15 or later within the 24.x release line, with npm
- A modern browser with Web Crypto API support

Both `dotnet` and `npm` must be available on your PATH. The first build requires internet access to restore dependencies. Use localhost for local development and HTTPS when hosting remotely.

## Run

From the repository root:

```sh
dotnet run --project backend/Backend.csproj --launch-profile http
```

Open <http://localhost:5228>. The backend build automatically installs frontend dependencies if needed, builds Angular, and serves the application. No database or additional configuration is required.

For frontend development with automatic browser updates, keep the backend running and open a second terminal:

```sh
cd frontend
npm ci
npm start
```

Open <http://localhost:4200>. The Angular development server proxies SignalR requests to the backend on port 5228.

## Usage

1. Open the home page. A session is created automatically after connecting.
2. Copy the session URL and open it in another browser or tab to view the shared text.
3. Type in the sender page. Connected viewers receive each text change automatically.

Changes made while disconnected are queued and sent after reconnecting. Viewers receive the latest stored message when joining or reconnecting. Sessions are kept in backend memory and disappear when the backend restarts. Reloading the sender page creates a new session.

## End-to-end tests

Playwright tests use two separate Chromium browsers for sending and receiving. From the repository root, install the test dependencies and browser:

```sh
cd frontend/e2e
npm ci
npx playwright install chromium
```

Run all tests in headless mode:

```sh
npm test
```

Run with visible browser windows to watch the sender and receiver:

```sh
npm run test:headed
```

The tests automatically build and start a separate backend on port 5258, then stop it when finished. Leave that port free; no manual server startup is required.

Results are saved under `frontend/e2e/report/`. The HTML summary is generated at `report/html/index.html`, and screenshots, traces, videos and browser diagnostics for every test are stored in `report/test-results/` and attached to the HTML report.

To open the HTML test report from `frontend/e2e`:

```sh
npm run report
```

See [frontend/e2e/README.md](frontend/e2e/README.md) for test coverage and further details.

## Message delivery

- `CryptographyService` generates a random AES-256-GCM key for each session using the Web Crypto API. The key is shared through the URL fragment (`/session/:id#key=...`), which is not sent to the server.
- Before sending, the browser encrypts the text with a fresh 12-byte IV. The binary payload contains a version byte, the IV, and the ciphertext with its authentication tag.
- `SignalrService` sends the encrypted payload over SignalR at `/hubs/application` using the binary MessagePack protocol. The frontend uses `Uint8Array`; the backend stores and forwards `byte[]` without decrypting it.
- The backend broadcasts updates to the session's SignalR group. The viewer decrypts the payload locally and displays plain text. A revision counter prevents older updates from replacing newer content.
- A separate backend-generated `EditKey`, held by the sender, authorizes updates. It is not included in the shared viewer URL.
- Sending, receiving, forwarding, and decryption failures are logged without message contents or encryption keys.
