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
WebSocket upgrades to `server.ts`, so under `ng serve` the server opens a loopback-only agent gateway on
port 4201 (`AGENT_DEV_GATEWAY_PORT`), and `proxy.conf.json` forwards `/agent/ws` to it. The server
loads `server/.env` itself, so `ng serve` and `npm start` behave the same.
Agent state is kept on `globalThis`, so connected agents survive rebuilds. The only exception is an
edit to `realtime/agent-hub.ts`, which closes agents with code 1012 so they reconnect to the new code.

In production (`npm run build`, then `node dist/print-server/server/server.mjs`), one process on
`PORT` serves pages, the REST API, admin live updates (SSE), and `/agent/ws`.

### Server code layout

Everything the Angular server runs lives in `packages/server/src`:

- `api/`: the REST API, uploads, and SSE
  - `routers/`: one router per path segment (`printers`, `events`, `session`, `agent`)
  - `middleware/auth/`: Passport strategies and `authenticate(...)`
  - `helpers/`: pure helpers grouped by topic
- `realtime/`: the agent WebSocket hub and gateway
- `lib/`: domain code (SQLite database, job storage, document normalisation, cover pages, QR posters, signed upload tokens)

The legacy Fastify server in `server/src` (`npm run dev:server`, `npm run admin`) imports its shared
domain code from `packages/server/src/lib`, so there is one copy of it.

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
| `GET /api/events` (SSE)                                   | `entraUser`                                      |
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
