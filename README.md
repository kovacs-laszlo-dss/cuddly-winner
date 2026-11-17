# Secure Live Messaging

## Requirements

- .NET 10 SDK
- Node.js 24.15 or later within the 24.x release line, with npm
- A modern browser with Web Crypto API support

## Run

From the repository root:

```sh
dotnet run --project backend/Backend.csproj --launch-profile http
```

Open <http://localhost:5228>. The backend build automatically installs frontend dependencies if needed, builds Angular, and serves the application. No database or additional configuration is required.

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

Results are saved under `frontend/e2e/report/`. The HTML summary is generated at `report/html/index.html`, and screenshots, traces, videos, and browser diagnostics for every test are stored in `report/test-results/` and attached to the HTML report.

See [frontend/e2e/README.md](frontend/e2e/README.md) for test coverage and further details.

## Your architecture and key technical decisions

### Selected technologies and architecture

Although the assignment does not specify any restrictions regarding the technologies that can be used, I chose Angular for the frontend because the positions in question focus on Angular development.

I implemented the backend, which provides the communication channel between clients, using .NET 10.
There were two main reasons for this decision:
- I have more than ten years of experience programming in C#. Conducting a code review is easier in a familiar environment.
- Both the .NET framework and the SignalR library used for communication are maintained by Microsoft. From an IT security perspective, this provides confidence that ongoing maintenance and security updates will be available.

I had also worked with SignalR before, so I was already familiar with the library. In a .NET environment, it was a natural choice. Implementing a custom solution based directly on WebSockets or another simpler communication protocol would not have been justified, even with AI assistance.
For client-side encryption, I chose the Web Crypto API.
Modern browsers provide built-in support for this API, eliminating the need for third-party libraries.

### Session key and message index

For session management, I introduced a backend-generated key. This key is provided to the sender client.
Whenever the sender sends a message to the backend, the payload must contain this key along with the session identifier. If either value is missing or invalid, the backend rejects the message.
Additionally, every payload contains a message index.
The purpose of this index is to handle potentially out-of-order message delivery in asynchronous communication. If a previously sent message arrives later than a newer one, the receiver can compare their indexes to determine which message is more recent.
If the incoming message has an older index, the receiver ignores it, preventing outdated data from overwriting a newer message.

## Security assumptions and considerations

### Communication protocol

Currently, the backend serves the frontend over HTTP.

This means that if network traffic is intercepted, an attacker could potentially obtain the URL, including the secret key embedded in it.
This is not acceptable in a production environment. The application must use HTTPS instead.
It is important to note that a self-signed certificate is not sufficient for a publicly deployed production application. A certificate trusted by the clients is required.

### HSTS header

Enabling HSTS requires migrating the communication protocol to HTTPS first.
Once HTTPS is configured, I recommend enabling the HSTS (HTTP Strict Transport Security) header.
This instructs compatible browsers to use HTTPS for subsequent connections to the application, even when the user attempts to access it over HTTP.

### Additional HTTP headers

I also recommend removing unnecessary HTTP response headers that might disclose information about the hosting environment, application framework, server software, or other implementation details.
Reducing the amount of exposed technical information can help minimize the application's information disclosure risks.

### Introducing authentication

Currently, accessing the session URL does not require authentication.
It would be worth considering authentication for both the sender and receiver.
Under this approach, the sender would be required to specify the intended receiver's identity when creating or sharing a session.
The receiver should communicate their identifier to the sender through a trusted communication channel, such as SMS or a secure messaging application.
This would allow the application to restrict session access to explicitly authorized participants.

### Two-factor authentication (2FA)

Introducing authentication is a prerequisite for this improvement.
Once an authentication mechanism is implemented, it could be further strengthened by introducing two-factor authentication (2FA).

### Rate limiting

Rate limiting should be implemented on the backend to help mitigate abuse, request flooding, and denial-of-service attacks.
If an attacker discovers the URL structure, they could attempt to overload the backend by generating requests containing random session identifiers and keys.
Rate limiting would help reduce the impact of such attacks by restricting the number of requests clients can make within a given time period.

## Tests and how to run them

For client-side testing, I chose Microsoft's Playwright testing framework.

## Known limitations and what you would improve with more time

### Number of users and sessions

Currently, the application supports only the one-sender, one-receiver model specified in the assignment.
The application automatically creates a session and generates a corresponding URL that allows the receiver to join.
The solution could be extended into a real-time chat application in which every participant can act as both sender and receiver.
It would also be possible to support multiple participants within the same session.

### Persistent storage

The assignment explicitly states that persistent storage is not required. However, I consider it a must-have for future development.
Whether the application supports temporary or permanent chat sessions, storing the data would be beneficial to ensure that it survives server restarts.

### Load balancing

Persistent storage would be an important prerequisite for the proposed architecture.
A multi-instance deployment could also be implemented using Redis as a shared cache or backplane. However, if Redis is used without durable persistence, data could still be lost in the event of a failure.
After introducing a database and moving session state out of the application's memory, the backend could be refactored into a stateless architecture.
This would make horizontal scaling and load balancing significantly easier.

## AI and tool usage during development

Throughout the assignment, I wanted to make my thought process and implementation decisions easy to follow, so I worked in small, incremental steps.
I created a separate Git commit for each step.

The development effort was approximately:

- **1.5 hours:** Implementing the application.
- **30 minutes:** Running and reviewing the tests.
- **1 hour:** Writing this Markdown documentation.

I used the following tools during development:
- Visual Studio Code
- Codex (GPT 6.1-Sol, medium reasoning)

The entire application was implemented using a coding agent. I did not write any code manually.
The repository does not contain agent configuration files, skills, or other agent-specific resources because I did not consider them necessary for the scope of this assignment.
After reading the assignment, I started by designing the client-side encryption mechanism, as this was the area where I initially had the most uncertainty.
The selected solution emerged through collaborative reasoning and technical discussions with AI.
As mentioned earlier, an important objective was to make my thought process traceable through Git commits.
For this reason, I instructed the agent step by step rather than asking it to implement the entire assignment in a single iteration.

I deliberately avoided having the agent generate the complete solution at once, although I believe it would have been capable of doing so.
Because of this incremental development approach, I did not use the agent configuration capabilities mentioned earlier.
However, if I were to continue developing the application, I would introduce the following practices and tools:

- **Reusable agent skills:** I would create skills for frequently used methodologies, conventions, and development rules, including:
  - Frontend and backend architecture guidelines, potentially following Domain-Driven Design (DDD) or another architectural paradigm.
  - Coding standards, formatting, and code style conventions.
  - Testing guidelines and quality requirements.
  - Tool usage policies, defining when and how the agent is allowed to use specific MCP tools.

- **Codebase analysis tools:** I would introduce additional tools, such as a Tree-sitter-based code graph solution. This would provide the agent with a structured representation of the codebase. While the initial benefits might be limited for a small project, such a tool could significantly improve the agent's efficiency as the application grows and becomes more complex.

- **Detailed implementation planning:** Before starting implementation, I would create a comprehensive development plan covering both architectural and functional aspects of the application. The objective would be to design the solution before writing code, ensuring that the implementation follows a well-defined architecture and a clear set of requirements.