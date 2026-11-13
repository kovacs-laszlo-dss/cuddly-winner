# Playwright end-to-end tests

Requires the .NET 10 SDK, Node.js 24.15+ (24.x), and npm on PATH.

From the repository root:

```sh
cd frontend/e2e
npm ci
npx playwright install chromium
npm test
```

To watch both browsers:

```sh
npm run test:headed
```

Each test uses two separate Chromium browser processes: a sender and a receiver. Tests use the real Angular frontend, ASP.NET Core backend, SignalR connection, and Web Crypto encryption without mocking message delivery.

Playwright builds and starts an isolated backend on port 5258 and stops it after the suite. Leave that port free. Build output goes to `artifacts/playwright-backend/` so a backend running from its normal output directory can remain open.

Coverage includes live edits, Unicode, line breaks, plain text rendering, clearing text, late joins, receiver reloads, rapid updates, missing and incorrect keys, decryption error logging, binary WebSocket frames, and logs without message contents or keys.

Tampering tests flip one bit in either the ciphertext or its AES-GCM authentication tag after real encryption, before sending through the real SignalR connection. They verify rejection during live delivery and after reloading the stored message, then successful delivery of the next intact message.

All test output is written to `frontend/e2e/report/`:

- `html/index.html`: HTML summary with results and details for each test.
- `test-results/`: screenshots of both browsers at scenario checkpoints and test completion, traces and videos of both browsers, and JSON browser diagnostics for every test, including successful tests.

Run `npm run report` from this directory to open the HTML summary in your browser. The report is generated after both headless and headed runs, even when tests fail.

Each scenario includes an English `Business requirement` annotation describing its user-facing purpose. English Given/When/Then steps describe the business actions and expected outcomes through Playwright's `test.step`, including session creation and recipient setup. Both the annotations and steps are available in the HTML report for each test.

Diagnostics include timestamped console messages, page errors, failed requests, HTTP errors, and WebSocket frame types and sizes. JSON diagnostics omit frame contents and redact URL encryption keys. Screenshots, traces and videos can contain test content and session links; treat reports as sensitive. Recording every run increases report size.
