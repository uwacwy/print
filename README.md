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
side port 4201 (`SOCKET_DEV_PORT`), and `proxy.conf.mjs` forwards `/ws` to it. The dev server
only loads `server.ts` on demand, so the proxy loads it before forwarding the first `/ws`
request; agents can connect before anyone opens a page. The server loads `packages/server/.env`
itself, so `ng serve` and `npm start` behave the same.
Agent state is kept on `globalThis`, so connected agents survive rebuilds. An edit to
`api/sockets/agent-hub/agent-hub.ts` disconnects agents and live clients so they reconnect to the new
code; edits to the namespaces in `api/sockets/` need a dev-server restart.

Each agent prints through one driver chosen by `PRINTER_URI`: `cups://Queue` (local `lp`) or
`ipp://`/`ipps://` (network IPP). Every driver takes the same connection string, and driver settings
go in its query string. Every driver supports `maxBytes`, `mimeTypes`, and `timeout` (ms); IPP also
supports `quality` and `format`. The CUPS driver runs `lp -d <queue> -t <title>` with no other options
unless you add `option_<name>=<value>` parameters, which become `-o <name>=<value>`, for example
`cups://Queue?option_print-quality=3&option_sides=two-sided-long-edge`.
Unknown or unsupported options stop the agent at startup. See `packages/agent/.env.example`.

In production (`npm run build`, then `node dist/print-server/server/server.mjs`), one process on
`PORT` serves pages, the REST API, and socket.io (at `/ws`, `SOCKET_PATH`) for agents and admin live updates.

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
| `GET /api/status` (`printersOnline`)                      | anyone                                           |
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
carry an `Authorization` header. `GET /api/printers/:slug` reports `access.signedIn` when that
token passes `entraUser`. The print page then shows the upload form without a PIN or QR token
("Printing as …"), and the upload goes out with the Entra token. A valid QR/PIN upload token
still takes precedence.

## Raspberry Pi print agent

A print agent is a small Node.js process beside the printer. It connects out to the print server over
socket.io (`/ws`), downloads its printer's jobs, and prints them through CUPS or IPP. It accepts no inbound
connections, so the Pi only needs outbound access to the server.

### 1. Prepare the Pi

1. Flash Raspberry Pi OS (Debian 13 "trixie", 64-bit). Enable SSH, create a user (for example `print`),
   and add your public key. In `~/.ssh/config`, add a `Host print-agent` entry with the Pi's address.
2. Add the printer to CUPS on the Pi (CUPS web UI at `http://<pi>:631`, or `lpadmin`). Network printers
   usually appear on their own through `dnssd://`. Find the queue name and check that it accepts jobs:

   ```bash
   lpstat -v                    # device for <Queue-Name>: ...
   lpstat -a                    # <Queue-Name> accepting requests ...
   lp -d <Queue-Name> /usr/share/cups/data/testprint   # optional test page
   ```

3. In the server's `/manage` page, add the printer and copy its agent token. The token is shown only
   once; `POST /api/printers/:slug/agent-token` rotates it. The server stores only its SHA-256 hash.

### 2. Build the bundle (on a development machine)

```bash
npm run package -w packages/agent
# packages/agent/dist/uwacwy-print-agent.tar.gz contains:
#   print-agent.cjs, install.sh, uwacwy-print-agent.service, node_modules/ipp
scp packages/agent/dist/uwacwy-print-agent.tar.gz print-agent:/tmp/
```

The bundle is one CommonJS file plus `ipp`; the Pi needs only Node.js 20 or newer, with no `npm install`.

### 3a. Production install (system service, needs sudo)

```bash
ssh print-agent
sudo apt install -y nodejs            # trixie ships Node.js 20
tar -xzf /tmp/uwacwy-print-agent.tar.gz -C /tmp
sudo /tmp/uwacwy-print-agent/install.sh
```

`install.sh` asks for:

- the server URL: HTTPS only, for example `https://print.example.org`
- `PRINTER_URI`, for example `cups://<Queue-Name>`
- the agent token

It then:

- creates the `uwacwy-print` system user
- installs the bundle to `/opt/uwacwy-print-agent`
- writes `/etc/uwacwy-print-agent.env` (`root:uwacwy-print`, mode 0640)
- installs and starts the hardened `uwacwy-print-agent.service`

Run it again to upgrade; it offers to keep the existing configuration. View logs with
`journalctl -u uwacwy-print-agent -f`.

### 3b. Install without root (user service)

Use this when the login user has no passwordless sudo, or when the agent should connect to a development
server over plain `http://`, which `install.sh` refuses. Everything lives in the login user's home
directory, and systemd lingering keeps the service running without anyone logged in.

```bash
ssh print-agent

# Node.js 24 LTS in ~/.local, checked against nodejs.org's published SHA-256 sums
v=v24.22.2; f=node-$v-linux-arm64.tar.xz
cd "$(mktemp -d)"
curl -fsSLO https://nodejs.org/dist/$v/$f
curl -fsSL https://nodejs.org/dist/$v/SHASUMS256.txt | grep " $f\$" | sha256sum -c -
mkdir -p ~/.local/opt ~/.local/bin
tar -xJf $f -C ~/.local/opt
ln -sfn ~/.local/opt/node-$v-linux-arm64 ~/.local/opt/node
ln -sfn ~/.local/opt/node/bin/node ~/.local/bin/node

# Agent bundle, which unpacks to ~/.local/share/uwacwy-print-agent
mkdir -p ~/.local/share ~/.config/systemd/user
rm -rf ~/.local/share/uwacwy-print-agent
tar -xzf /tmp/uwacwy-print-agent.tar.gz -C ~/.local/share

# Settings, readable only by this user (see packages/agent/.env.example)
(umask 077; cat > ~/.config/uwacwy-print-agent.env) <<'EOF'
PRINT_SERVER_URL=https://print.example.org
PRINT_AGENT_TOKEN=<agent token>
PRINTER_URI=cups://<Queue-Name>
EOF

cat > ~/.config/systemd/user/uwacwy-print-agent.service <<'EOF'
[Unit]
Description=United Way Quick Print agent (user service)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=%h/.config/uwacwy-print-agent.env
ExecStart=%h/.local/bin/node %h/.local/share/uwacwy-print-agent/print-agent.cjs
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
EOF

loginctl enable-linger "$USER"        # start at boot without a login session
systemctl --user daemon-reload
systemctl --user enable --now uwacwy-print-agent.service
journalctl --user-unit uwacwy-print-agent -f
```

To upgrade, copy a new bundle, repeat the "Agent bundle" step, and run
`systemctl --user restart uwacwy-print-agent`. To apply settings changes, edit
`~/.config/uwacwy-print-agent.env` and restart the service.

### 4. Verify

A healthy start logs:

```
Using CupsPrinter (max 100.0 MB, application/pdf).
Connecting to https://print.example.org/ws
Connected to print server.
Registered for <printer name>.
```

`GET /api/status` on the server counts the agent in `printersOnline`, and `/manage` shows the printer
online. A token typo logs `Connection error: Unauthorized` and keeps retrying. A malformed `PRINTER_URI`
or an unsupported option stops the agent at startup. The agent does not check that the CUPS queue exists
(only `install.sh` does), so a wrong queue name shows up as failed jobs. Check it with `lpstat -a`.

### Pointing a Pi at a development server

`ng serve` listens only on `127.0.0.1`, and it does not work reliably when reached by IP address. Use
the built server instead; it listens on every interface:

1. Add the workstation's LAN IP to `security.allowedHosts` under the `build` options in `angular.json`.
   Otherwise SSR rejects requests that use that `Host` header.
2. Build and run:

   ```bash
   npm run build:server
   npm run start:server        # node dist/print-server/server/server.mjs, port PORT (4200)
   ```

3. On the Pi, set `PRINT_SERVER_URL=http://<workstation-ip>:4200` and restart the agent.

This exposes the server to your network. Rebuild after code changes; the agent reconnects by itself
when the server restarts.

To keep `ng serve` on loopback instead, set `PRINT_SERVER_URL=http://localhost:4200` on the Pi and
forward the Pi's port 4200 back to the workstation over SSH:

```bash
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -R 127.0.0.1:4200:127.0.0.1:4200 print-agent
```

### Current pilot install

- `print-agent` (`print@10.1.10.149`) uses the user-service install (3b) with Node.js v24.22.2.
- `PRINTER_URI=cups://HP-LaserJet-MFP-M129-M134`, the HP LaserJet MFP M130fw found through `dnssd://`.
- It is registered as the dev printer `raspberry-pi` ("HP LaserJet M130 / via pi") and connects directly
  to the built server on the workstation at `http://10.1.10.138:4200`.

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
