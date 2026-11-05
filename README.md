# United Way Quick Print

Walk-up printing for United Way sites. People upload documents or photos from their phones through a
QR code or a printer PIN, and a small print agent next to each printer prints them.

| Package                                                                | npm                    | Container image                             |
| ---------------------------------------------------------------------- | ---------------------- | ------------------------------------------- |
| [`packages/server`](packages/server) — web app, REST API, agent socket | `@uwacwy/print-server` | `ghcr.io/uwacwy/print-server` (amd64)       |
| [`packages/agent`](packages/agent) — prints jobs through CUPS or IPP   | `@uwacwy/print-agent`  | `ghcr.io/uwacwy/print-agent` (amd64, arm64) |

`shared` holds types used by both and is bundled into each package; it is not published.

## Deploying

The server is one Node.js process that serves pages, the REST API, and the agents' socket (`/ws`) on
`PORT`, and keeps its SQLite database and queued jobs in `DATA_DIR`. Run it behind an HTTPS reverse
proxy for anything public. Each printer needs one agent, which connects out to the server, so printers
can sit on private networks.

### Docker Compose

Ready-made files live in [`examples/`](examples):

| File                                                        | Runs                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| [`compose.server.yml`](examples/compose.server.yml)         | the server, with a named volume for `/data`             |
| [`compose.agent.yml`](examples/compose.agent.yml)           | an IPP agent and a CUPS agent that uses the host's CUPS |
| [`compose.all-in-one.yml`](examples/compose.all-in-one.yml) | the server and one agent on the same host               |

Server:

```yaml
services:
  print-server:
    image: ghcr.io/uwacwy/print-server:0.1 # or :latest, or an exact :0.1.0
    restart: unless-stopped
    init: true
    environment:
      UPLOAD_TOKEN_SECRET: ${UPLOAD_TOKEN_SECRET:?set UPLOAD_TOKEN_SECRET} # openssl rand -base64 48
      PUBLIC_URL: https://print.example.org
      TRUST_PROXY: "true" # only behind a reverse proxy
      TIME_ZONE: America/Denver
    ports:
      - "8080:8080"
    volumes:
      - print-data:/data

volumes:
  print-data:
```

```bash
UPLOAD_TOKEN_SECRET=$(openssl rand -base64 48) docker compose -f examples/compose.server.yml up -d
```

Keep `UPLOAD_TOKEN_SECRET` stable (store it in an env file or secret store): changing it invalidates
every QR code and PIN link. The image runs as user `node` (uid 1000), listens on 8080, and has a
health check on `/api/healthz`.

Agent for a network printer that speaks IPP (most AirPrint/Mopria printers):

```yaml
services:
  print-agent:
    image: ghcr.io/uwacwy/print-agent:0.1
    restart: unless-stopped
    init: true
    environment:
      PRINT_SERVER_URL: https://print.example.org
      PRINT_AGENT_TOKEN: ${PRINT_AGENT_TOKEN:?copy it from /manage}
      PRINTER_URI: ipp://printer.local:631/ipp/print
```

Agent for a queue on the host's CUPS server, for example a USB printer on a Raspberry Pi. The image
includes `lp`, which talks to the host's CUPS through its socket:

```yaml
services:
  print-agent:
    image: ghcr.io/uwacwy/print-agent:0.1
    restart: unless-stopped
    init: true
    environment:
      PRINT_SERVER_URL: https://print.example.org
      PRINT_AGENT_TOKEN: ${PRINT_AGENT_TOKEN:?copy it from /manage}
      PRINTER_URI: cups://HP-LaserJet-MFP-M129-M134 # lpstat -p on the host
      CUPS_SERVER: /run/cups/cups.sock
    volumes:
      - /run/cups/cups.sock:/run/cups/cups.sock
```

When the agent runs in the same compose project as the server, use `PRINT_SERVER_URL:
http://print-server:8080` (see `compose.all-in-one.yml`). `npm run compose:check` validates every
example with `docker compose config`.

### npm

Both packages need Node.js 24 (server) or 20.12+ (agent):

```bash
npm install --global @uwacwy/print-server
uwacwy-print-server /etc/uwacwy-print-server.env   # or set the variables in the environment

npm install --global @uwacwy/print-agent
uwacwy-print-agent /etc/uwacwy-print-agent.env
```

Each command takes an optional env file. Existing environment variables win over the file, and both
commands accept `--help` and `--version`. The server's `.env.example` and the agent's `.env.example`
ship in each package and list every setting.

### Server settings worth knowing

- `UPLOAD_TOKEN_SECRET` (required, 32+ characters) signs QR code and PIN upload links.
- `DATA_DIR` holds `print.db`, queued jobs, and `logs/`. The default is `./data`; the image uses `/data`.
- `ACCESS_LOG_DAYS` (default 14; `0` disables) keeps that many days of HTTP access logs. Each request is a
  JSON line in `DATA_DIR/logs/access-YYYY-MM-DD.log`, and `DATA_DIR/logs/access.log` links to the current
  day, so `tail -F data/logs/access.log` (or `docker compose exec print-server tail -F /data/logs/access.log`)
  follows it across rotations. Upload tokens and other query credentials are redacted, `/api/healthz` is
  skipped, and agent socket traffic on `/ws` is not logged. Logs hold client IP addresses, so keep the
  retention short.
- `PUBLIC_URL` is the address people use. It is printed in QR codes, and its host name is allowed
  for server-side rendering.
- `NG_ALLOWED_HOSTS` lists other comma-separated host names the app may be reached by, for example a
  LAN IP. Pages requested with any other `Host` header get `400 Bad Request` (the API is unaffected).
- `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` enable Microsoft Entra sign-in and `/manage`. The browser
  reads them at startup from `GET /api/client-config`, so one prebuilt image or package works for any
  tenant.
- `TRUST_PROXY=true` only behind a reverse proxy; otherwise clients could spoof their IP to dodge rate limits.

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

Before `lp`, the CUPS driver uses Ghostscript to downsample every image in the PDF to `dpi` (default
150; `dpi=0` sends the PDF untouched, as does a missing `gs`). The queue's own filters then rasterize
the smaller PDF to whatever the printer accepts. Low-memory printers such as the HP LaserJet M130fw
stall or reboot on full-resolution raster, and sending them Ghostscript PCLm directly crashed them.
The driver reports a job printed only after CUPS completes it, waiting up to 10 minutes. If CUPS stops
the queue mid-job (as it does when the printer refuses a document), the job stays pending, and the agent
re-enables the queue after 15, 30 and 60 seconds so CUPS retries it. A printer that stops partway
through a document may repeat pages. If the queue stops a fourth time, the agent cancels the job and
reports it failed. The server keeps a failed job's PDF until `JOB_TTL_HOURS` passes, so
**Retry failed jobs** in Manage Printers can queue it again. The agent also re-enables a stopped
queue before each job.
Unknown or unsupported options stop the agent at startup. See `packages/agent/.env.example`.

In production (`npm run build`, then `npm run start:server`), one process on
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

| Endpoint                                                          | Accepts                                          |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| `GET /api/healthz`                                                | anyone                                           |
| `GET /api/status` (`printersOnline`)                              | anyone                                           |
| `GET /api/session`                                                | `entraUser`                                      |
| `GET, POST /api/printers`                                         | `entraUser`                                      |
| `GET /api/printers/:slug`                                         | anyone (`entraUser` also gets management fields) |
| `PATCH, DELETE /api/printers/:slug`                               | `entraUser`                                      |
| `POST /api/printers/:slug/token`                                  | `pin` (rate limited; returns an upload token)    |
| `POST /api/printers/:slug/jobs`                                   | `uploadToken`, `pin`, `entraUser`                |
| `DELETE /api/printers/:slug/jobs`                                 | `entraUser`                                      |
| `GET, POST /api/printers/:slug/qr.pdf`                            | `entraUser`                                      |
| `POST /api/printers/:slug/{qr-token,qr-print,qr-epoch}`           | `entraUser`                                      |
| `POST, DELETE /api/printers/:slug/pin`                            | `entraUser`                                      |
| `POST /api/printers/:slug/agent-token`                            | `entraUser` (rotates the agent token)            |
| `GET /api/agent/jobs/:id/file`, `POST /api/agent/jobs/:id/status` | `agentToken`                                     |
| socket.io namespace `/agent` (`auth: { token }`)                  | `agentToken`                                     |
| socket.io namespace `/live` (`auth: { token }`)                   | `entraUser`                                      |

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

The Pi can also run the agent from npm (`npm install --global @uwacwy/print-agent`, then point a
service at `uwacwy-print-agent <env-file>`) or from the `ghcr.io/uwacwy/print-agent` image (see
[Docker Compose](#docker-compose)). The steps below use the self-contained bundle, which needs neither
npm nor Docker.

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
Agent 0.1.0 using CupsPrinter (max 100.0 MB, application/pdf).
Connecting to https://print.example.org/ws
Connected to print server.
Registered for <printer name>.
```

`GET /api/status` on the server counts the agent in `printersOnline`, and `/manage` shows the printer
online. A token typo logs `Unable to connect to <server>/ws (Unauthorized); retrying in N seconds.` and keeps retrying; an unreachable server logs the same line without the reason. A malformed `PRINTER_URI`
or an unsupported option stops the agent at startup. The agent does not check that the CUPS queue exists
(only `install.sh` does), so a wrong queue name shows up as failed jobs. Check it with `lpstat -a`.

### Pointing a Pi at a development server

`ng serve` listens only on `127.0.0.1`, and it does not work reliably when reached by IP address. Use
the built server instead; it listens on every interface:

1. Allow the workstation's LAN IP for server-side rendering: add `NG_ALLOWED_HOSTS=<workstation-ip>`
   to `packages/server/.env`. Otherwise pages requested by that `Host` return 400.
2. Build and run:

   ```bash
   npm run build:server
   npm run start:server        # packages/server/dist, port PORT (4200)
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

## Building and testing

```bash
npm run build            # server (packages/server/dist) and agent (packages/agent/dist/print-agent.cjs)
npm test                 # Angular unit tests, then API and agent tests
npm run typecheck:api
npm run lint && npm run fmt:check
npm run compose:check    # validates examples/compose.*.yml and compose.yml
```

Images build from the repository root:

```bash
docker build -f packages/server/Dockerfile -t print-server .
docker buildx build -f packages/agent/Dockerfile --platform linux/amd64,linux/arm64 -t print-agent .
```

`compose.yml` runs `ng serve` in a container (the `dev` target of `packages/server/Dockerfile`).

## Releasing

All four `package.json` files share one version, and a `vX.Y.Z` tag publishes it.
[`release.yml`](.github/workflows/release.yml) then:

1. checks that the tag matches every manifest, and runs the format, lint, type, and test checks and the builds
2. publishes `@uwacwy/print-server` and `@uwacwy/print-agent` to npm with provenance, through npm
   trusted publishing (no npm token is stored in GitHub)
3. pushes `ghcr.io/uwacwy/print-server` (linux/amd64) and `ghcr.io/uwacwy/print-agent` (linux/amd64,
   linux/arm64) with SBOM and provenance attestations, tagged `0.2.0`, `0.2`, and `latest`
4. creates a GitHub release with generated notes

```bash
npm run version:set -- 0.2.0   # updates every manifest, internal pins, and package-lock.json
git commit -am "Release 0.2.0"
git tag v0.2.0
git push origin main v0.2.0
```

A prerelease such as `v0.2.0-rc.1` publishes to the npm `next` dist-tag and pushes only the exact image
tag, leaving `latest` and `0.2` alone. [`ci.yml`](.github/workflows/ci.yml) runs the same checks, plus
image builds without pushing, on every pull request and push to `main`.

### One-time setup

1. Create the public GitHub repository `uwacwy/print` and push `main`.
2. On npmjs.com, create the `uwacwy` organization (or confirm you can publish to `@uwacwy`).
3. Trusted publishing applies only to packages that already exist, so publish 0.1.0 once by hand:

   ```bash
   npm login
   npm run build
   npm publish -w @uwacwy/print-server -w @uwacwy/print-agent --access public --provenance=false
   ```

4. For each package on npmjs.com, go to Settings, then Trusted Publisher, then GitHub Actions: organization
   `uwacwy`, repository `print`, workflow `release.yml`, environment `release`. Then set "Publishing access"
   to require two-factor authentication and disallow tokens.
5. In the GitHub repository settings, create the `release` environment. Optionally restrict it to
   `v*` tags and require a reviewer.
6. Tag `v0.1.0` and push it. The npm job skips versions that are already published, so this run pushes
   the images and creates the release; later tags publish to npm as well.
7. After the first image push, open each package under github.com/orgs/uwacwy/packages, set its
   visibility to public, and connect it to the `print` repository.
