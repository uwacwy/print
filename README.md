# UwacwyPrint

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.3.

## Development server

To start a local development server, run:

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

### Print agents in development

Point a print agent at `PRINT_SERVER_URL=http://localhost:4200`. The Angular dev server cannot hand
WebSocket upgrades to `server.ts`, so under `ng serve` the server runs socket.io on a loopback-only
side port 4201 (`SOCKET_DEV_PORT`), and `proxy.conf.json` forwards `/socket.io` to it. The server
loads `packages/server/.env` itself, so `ng serve` and `npm start` behave the same.
Agent state is kept on `globalThis`, so connected agents survive rebuilds. An edit to
`api/sockets/agent-hub/agent-hub.ts` disconnects agents and live clients so they reconnect to the new
code; edits to the namespaces in `api/sockets/` need a dev-server restart.

In production (`npm run build`, then `node dist/print-server/server/server.mjs`), one process on
`PORT` serves pages, the REST API, and socket.io (`/socket.io`) for agents and admin live updates.

### Server code layout

Everything the Angular server runs lives in `packages/server/src`:

- `api/`: the REST API, uploads, and realtime sockets
  - `routers/`: one router per path segment (`printers`, `session`, `agent`)
  - `sockets/`: socket.io namespaces bound to the HTTP server by `attachWebSockets()`
    - `agent/`: `/agent`, where print agents (`agentToken`) receive `hello` and `jobs` and send `sync`
    - `live/`: `/live`, where managers (`entraUser`) receive `live` agent and job events
    - `agent-hub/`: tracks each printer's agent socket, dispatches queued jobs, and publishes live events
    - `handshake/`: authenticates `auth.token` with the same Passport strategies as the REST API
  - `middleware/auth/`: Passport strategies and `authenticate(...)`, plus the upload token and PIN code they verify
  - `middleware/`: rate limits and the same-origin upload guard
  - `helpers/`: helpers grouped by topic
    - `database/`: the SQLite database and job file storage
    - `pdf/`: PDF builders for uploads (`document` normalisation, `cover-page`, `qr-poster`, shared `pdf-layout`)
  - `test-support.ts`: `useApiServer()`, which serves the API over a temporary database in tests

  Each router and middleware lives in its own directory beside its tests, for example
  `middleware/auth/pin/pin.strategy.ts` and `pin.strategy.test.ts`.
- `realtime/`: process-wide runtime state (database, hub, cleanup timer, dev socket server)

The legacy Fastify server in `server/` is retired: its sources are kept only as `*.ts.bak` and nothing
builds or imports them.

### API authentication

Each route lists the credentials it accepts with `authenticate(...)`. The first strategy that
succeeds wins; when none succeed, the response explains the most relevant failure as
`{ code, error }`.

| Strategy      | Credential                              | Principal                                   |
| ------------- | --------------------------------------- | ------------------------------------------- |
| `entraUser`   | `Authorization: Bearer <Entra JWT>`     | A manager (API scope plus admin role/group) |
| `uploadToken` | `Authorization: Bearer <42-char token>` | A QR or PIN upload grant for one printer    |
| `pin`         | `Authorization: Pin 111-222-333`        | Someone who knows the printer's PIN         |
| `agentToken`  | `Authorization: Bearer <agent token>`   | The print agent for one printer             |

| Endpoint                                                  | Accepts                                          |
| --------------------------------------------------------- | ------------------------------------------------ |
| `GET /api/healthz`                                        | anyone                                           |
| `GET /api/session`                                        | `entraUser`                                      |
| `GET, POST /api/printers`                                 | `entraUser`                                      |
| `GET /api/printers/:slug`                                 | anyone (`entraUser` also gets management fields) |
| `PATCH, DELETE /api/printers/:slug`                       | `entraUser`                                      |
| `POST /api/printers/:slug/token`                          | `pin` (rate limited; returns an upload token)    |
| `POST /api/printers/:slug/jobs`                           | `uploadToken`, `pin`, `entraUser`                |
| `DELETE /api/printers/:slug/jobs`                         | `entraUser`                                      |
| `GET, POST /api/printers/:slug/qr.pdf`                    | `entraUser`                                      |
| `POST /api/printers/:slug/{qr-token,qr-print,qr-epoch}`   | `entraUser`                                      |
| `POST, DELETE /api/printers/:slug/pin`                    | `entraUser`                                      |
| `POST /api/printers/:slug/agent-token`                    | `entraUser` (rotates the agent token)            |
| `GET /agent/jobs/:id/file`, `POST /agent/jobs/:id/status` | `agentToken`                                     |
| socket.io namespace `/agent` (`auth: { token }`)          | `agentToken`                                     |
| socket.io namespace `/live` (`auth: { token }`)           | `entraUser`                                      |

Browser uploads and PIN exchanges must also send `x-print-upload: 1` from the same origin. In the
SPA, MSAL adds the Entra token only for signed-in users, and only to requests that don't already
carry an `Authorization` header.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
