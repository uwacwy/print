# United Way Quick Print

Walk-up printing for United Way sites. People upload documents or photos from their phones through a
QR code or a printer PIN, and a small print agent next to each printer prints them.

| Package                                                                | npm                    | Container image                             |
| ---------------------------------------------------------------------- | ---------------------- | ------------------------------------------- |
| [`packages/server`](packages/server) — web app, REST API, agent socket | `@uwacwy/print-server` | `ghcr.io/uwacwy/print-server` (amd64)       |
| [`packages/agent`](packages/agent) — prints jobs through CUPS or IPP   | `@uwacwy/print-agent`  | `ghcr.io/uwacwy/print-agent` (amd64, arm64) |

[`packages/shared`](packages/shared) holds types used by both and is bundled into each package; it is not published.

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
    image: ghcr.io/uwacwy/print-server:1.0 # or :latest, or an exact :1.0.0
    restart: unless-stopped
    init: true
    environment:
      UPLOAD_TOKEN_SECRET: ${UPLOAD_TOKEN_SECRET:?set UPLOAD_TOKEN_SECRET} # openssl rand -base64 48
      SITE_URL: https://print.contoso.com
      SITE_TITLE: Quick Print
      SITE_ORG_NAME: Contoso
      TRUST_PROXY: 'true' # only behind a reverse proxy
      TIME_ZONE: America/Denver
    ports:
      - '8080:8080'
    volumes:
      - print-data:/data
      # optional header logo, read-only (see "Server settings worth knowing")
      # - ./logo.svg:/data/public/logo.svg:ro

      # or, create map a path to the data dir
      # and place a logo at ${DATA_DIR}/public/logo.svg
      # ${DATA_DIR}/public will be created automatically if it doesn't exist
      # - ./data:${DATA_DIR}

volumes:
  print-data:
```

```bash
UPLOAD_TOKEN_SECRET=$(openssl rand -base64 48) docker compose -f examples/compose.server.yml up -d
```

Keep `UPLOAD_TOKEN_SECRET` stable (store it in an env file or secret store): changing it invalidates
every QR code and PIN link. Other settings, such as the Entra sign-in variables, go in an env file:
`cp packages/server/.env.example print-server.env` and `compose.server.yml` reads it (values set in
the compose file, including `DATA_DIR`, win). The image runs as user `node` (uid 1000), listens on
8080, and has a health check on `/api/healthz`.

Agent for a network printer that speaks IPP (most AirPrint/Mopria printers):

```yaml
services:
  print-agent:
    image: ghcr.io/uwacwy/print-agent:1.0
    restart: unless-stopped
    init: true
    environment:
      PRINT_SERVER_URL: https://print.contoso.com
      PRINT_AGENT_TOKEN: ${PRINT_AGENT_TOKEN:?copy it from /manage}
      PRINTER_URI: ipp://printer.local:631/ipp/print
```

Agent for a queue on the host's CUPS server, for example a USB printer on a Raspberry Pi. The image
includes `lp`, which talks to the host's CUPS through its socket:

```yaml
services:
  print-agent:
    image: ghcr.io/uwacwy/print-agent:1.0
    restart: unless-stopped
    init: true
    environment:
      PRINT_SERVER_URL: https://print.contoso.com
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

Both packages need Node.js 24 (server) or 20.17+ (agent):

```bash
npm install --global @uwacwy/print-server
uwacwy-print-server /etc/uwacwy-print-server.env   # or set the variables in the environment

npx @uwacwy/print-agent install --print-server-url https://print.contoso.com --print-enroll-token <token>
```

The server takes an optional env file; existing environment variables win over it. The agent's
`install` enrolls the printer, writes `uwacwy-print-agent.env`, and starts a systemd service (see
[Raspberry Pi print agent](#raspberry-pi-print-agent)). Both commands accept `--help` and `--version`,
and each package's `.env.example` lists every setting.

### Server settings worth knowing

- `UPLOAD_TOKEN_SECRET` (required, 32+ characters) signs QR code and PIN upload links.
- `DATA_DIR` holds `print.db`, queued jobs, and `logs/`. The default is `./data`; the image uses `/data`.
- `ACCESS_LOG_DAYS` (default 14; `0` disables) keeps that many days of HTTP access logs. Each request is a
  JSON line in `DATA_DIR/logs/access-YYYY-MM-DD.log`, and `DATA_DIR/logs/access.log` links to the current
  day, so `tail -F data/logs/access.log` (or `docker compose exec print-server tail -F /data/logs/access.log`)
  follows it across rotations. Upload tokens and other query credentials are redacted, `/api/healthz` is
  skipped, and agent socket traffic on `/ws` is not logged. Logs hold client IP addresses, so keep the
  retention short.
- `SITE_URL` (default `https://localhost:4200`) is the address people use, for example
  `https://print.contoso.com`. It is printed in QR codes and agent setup commands, and its
  host name is allowed for server-side rendering. When it is `https://` (or localhost), **Add printer**
  can enroll printers from their own computers with `curl … | bash` or `npx` setup commands, which
  work for `ENROLL_TOKEN_TTL_MINUTES` (default 30).
- `SITE_TITLE` (for example `Quick Print`) names the site in the page title, header, and printed pages.
  `SITE_ORG_NAME` (for example `Contoso`) is the organization named in the footer copyright notice.
  Until they are set, the pages show `Update env:SITE_TITLE` and `Update env:SITE_ORG_NAME`.
- `NG_ALLOWED_HOSTS` lists other comma-separated host names the app may be reached by, for example a
  LAN IP. Pages requested with any other `Host` header get `400 Bad Request` (the API is unaffected).
- `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` enable Microsoft Entra sign-in and `/manage`. The browser
  reads them at startup from `GET /api/client-config`, so one prebuilt image or package works for any
  tenant.
- `${DATA_DIR}/public` (created at startup when missing; ignored when it is not a directory) is served
  as static files ahead of the web app's own, with the same caching. A `logo.svg`, `logo.png`, `logo.jpg`,
  or `logo.jpeg` there (else the built-in logo from `packages/server/public`) is shown in the page header.
  `GET /api/client-config` looks for it on every request, so adding or removing the file needs no restart.
  With Docker, mount it read-only: `./logo.svg:/data/public/logo.svg:ro` (after replacing a single mounted
  file, `docker compose up -d --force-recreate`, since editors often swap the file). `SITE_LOGO_ALT`
  (default `SITE_ORG_NAME`) is its text for screen readers. `SITE_LOGO_URL` (a root-relative URL)
  overrides the file lookup.
- `SITE_FOOTER_LINKS` adds footer links (for example privacy and terms) as a query string:
  `label=Privacy&url=https://example.com/privacy&label=Terms&url=/terms` (URLs must be http(s), mailto, or
  root-relative). `SITE_SHOW_ATTRIBUTION=false` hides the package name and version in the footer.
- Renamed in 1.0.0 (the old names are no longer read): `PUBLIC_URL` → `SITE_URL`,
  `CLIENT_LEGAL_ORG_NAME`/`ORG_NAME` → `SITE_ORG_NAME`, `CLIENT_BRAND_LOGO` → `SITE_LOGO_URL`,
  `LOGO_ALT` → `SITE_LOGO_ALT`, `CLIENT_BRAND_LINKS` → `SITE_FOOTER_LINKS`, and
  `CLIENT_SHOW_ATTRIBUTION` → `SITE_SHOW_ATTRIBUTION`.
- `TRUST_PROXY=true` only behind a reverse proxy; otherwise clients could spoof their IP to dodge rate limits.

## Development server

To start a local development server, run:

```bash
npm run dev -w @uwacwy/print-server
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

The dev server is stock Angular: it serves `localhost:4200` only. To reach it through a reverse proxy or tunnel with a
real host name, have the proxy forward to `localhost:4200` and rewrite the `Host` header to `localhost:4200`.

### Print agents in development

Point a print agent at `PRINT_SERVER_URL=http://localhost:4200`. The Angular dev server cannot hand
WebSocket upgrades to `server.ts`, so under `ng serve` the server runs socket.io on a loopback-only
side port 4201 (`SOCKET_DEV_PORT`), and `proxy.conf.mjs` forwards `/ws` to it. The dev server
only loads `server.ts` on demand, so the proxy loads it before forwarding the first `/ws`
request; agents can connect before anyone opens a page. The server loads `packages/server/.env`
itself, so `ng serve` and `npm run dev -w @uwacwy/print-server` behave the same.
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
  - `middleware/`: rate limits and request validation
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

| Strategy          | Credential                              | Principal                                            |
| ----------------- | --------------------------------------- | ---------------------------------------------------- |
| `entraUser`       | `Authorization: Bearer <Entra JWT>`     | A manager (API scope plus admin role/group)          |
| `entraApp:<role>` | `Authorization: Bearer <Entra JWT>`     | An application (client credentials) granted `<role>` |
| `uploadToken`     | `Authorization: Bearer <42-char token>` | A QR or PIN upload grant for one printer             |
| `pin`             | `Authorization: Pin 111-222-333`        | Someone who knows the printer's PIN                  |
| `agentToken`      | `Authorization: Bearer <agent token>`   | The print agent for one printer                      |

| Endpoint                                                          | Accepts                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/healthz`                                                | anyone                                                                                |
| `GET /api/status` (`printersOnline`)                              | anyone                                                                                |
| `GET /api/session`                                                | `entraUser`                                                                           |
| `GET, POST /api/printers`                                         | `entraUser`                                                                           |
| `GET /api/printers/:slug`                                         | anyone (`entraUser` also gets management fields; `entraApp:Printer.Read` gets status) |
| `PATCH, DELETE /api/printers/:slug`                               | `entraUser`                                                                           |
| `POST /api/printers/:slug/token`                                  | `pin` (rate limited; returns an upload token)                                         |
| `POST /api/printers/:slug/jobs`                                   | `uploadToken`, `pin`, `entraUser`, `entraApp:Printer.PrintJob`                        |
| `DELETE /api/printers/:slug/jobs`                                 | `entraUser`                                                                           |
| `GET, POST /api/printers/:slug/qr.pdf`                            | `entraUser`                                                                           |
| `POST /api/printers/:slug/{qr-token,qr-epoch}`                    | `entraUser`                                                                           |
| `POST /api/printers/:slug/qr-print`                               | `entraUser`, `entraApp:Printer.PrintFlyer`                                            |
| `POST, DELETE /api/printers/:slug/pin`                            | `entraUser`, `entraApp:Printer.ManagePin` (apps never see the PIN)                    |
| `POST /api/printers/:slug/agent-token`                            | `entraUser` (rotates the agent token)                                                 |
| `GET /api/agent/jobs/:id/file`, `POST /api/agent/jobs/:id/status` | `agentToken`                                                                          |
| socket.io namespace `/agent` (`auth: { token }`)                  | `agentToken`                                                                          |
| socket.io namespace `/live` (`auth: { token }`)                   | `entraUser`                                                                           |

In the SPA, MSAL adds the Entra token only for signed-in users, and only to requests that don't already
carry an `Authorization` header. `GET /api/printers/:slug` reports `access.signedIn` when that
token passes `entraUser`. The print page then shows the upload form without a PIN or QR token
("Printing as …"), and the upload goes out with the Entra token. A valid QR/PIN upload token
still takes precedence.

### Calling the API from a script

Scripts and services (for example a Windmill job) authenticate as an Entra application in the same
tenant using the client-credentials flow. Entra decides which applications may call which endpoints:
the server only checks that the token was issued by the tenant for this API and carries the
required **app role** in its `roles` claim.

| App role             | Allows                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `Printer.Read`       | `GET /api/printers/:slug` with status: `online`, `lastSeenAt`, `activeJobs`, `failedJobs`, `pinEnabled` |
| `Printer.PrintJob`   | `POST /api/printers/:slug/jobs`                                                                         |
| `Printer.PrintFlyer` | `POST /api/printers/:slug/qr-print` (queues the QR info sheet, which shows the PIN on paper)            |
| `Printer.ManagePin`  | `POST` (rotate) and `DELETE` (disable) `/api/printers/:slug/pin`                                        |

Applications can rotate or disable the PIN but never read it: only signed-in people see the PIN, so
a leaked client secret cannot reveal it. Every other management endpoint answers applications with
`403 app_token_not_allowed`; a missing role answers `403 app_role_required` with the `role` needed.
Jobs an application submits are recorded as `app:<client ID>`.

Setup in Microsoft Entra:

1. In the print API's app registration (`ENTRA_CLIENT_ID`), open **App roles** and create each role
   above with **Allowed member types: Applications** and the role name as its **Value**.
2. Register the calling application and give it a certificate (preferred, see below) or client secret.
3. In the calling application's **API permissions**, add the print API under **My APIs →
   Application permissions**, select the roles it needs, and **Grant admin consent**. Remove the
   permission (or the consent) to revoke access.
4. Request a token with `scope=<API audience>/.default`, for example `api://<ENTRA_CLIENT_ID>/.default`.

```bash
TOKEN=$(curl -s "https://login.microsoftonline.com/$TENANT_ID/oauth2/v2.0/token" \
  -d grant_type=client_credentials -d client_id="$APP_ID" -d client_secret="$APP_SECRET" \
  -d scope="api://$ENTRA_CLIENT_ID/.default" | jq -r .access_token)
API=https://print.contoso.com/api/printers/event-room

curl -X POST -H "Authorization: Bearer $TOKEN" "$API/pin"        # rotate the PIN
curl -X POST -H "Authorization: Bearer $TOKEN" "$API/qr-print"   # QR info sheet with the new PIN
curl -X POST -H "Authorization: Bearer $TOKEN" "$API/jobs" \
  -F job__title=Appointments -F document__file_0=@appointments.pdf -F document__copies_0=3
curl -H "Authorization: Bearer $TOKEN" "$API"                    # status
```

#### Using a certificate instead of a client secret

A certificate is preferred: the private key never leaves the script's host, it cannot be guessed,
and Entra only stores the public half. Generate a key pair (here valid for two years), keep the
`.key` file out of the repository, and upload only the `.crt`:

```bash
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 730 \
  -subj "/CN=windmill-print-api" -keyout windmill-print.key -out windmill-print.crt
chmod 600 windmill-print.key
```

1. In the calling application's registration, open **Certificates & secrets → Certificates → Upload
   certificate** and choose `windmill-print.crt`. Entra shows its thumbprint.
2. Store `windmill-print.key` where the script runs (for example as a Windmill secret variable). Put
   a calendar reminder before the certificate expires; add the replacement before removing the old
   one so there is no gap.
3. Sign a short-lived JWT with the key and send it as `client_assertion` instead of `client_secret`.
   MSAL (`@azure/msal-node`, `msal` for Python) does this for you given the key and thumbprint; this
   shell version needs only `openssl`, `curl` and `jq`:

```bash
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

TOKEN_URL="https://login.microsoftonline.com/$TENANT_ID/oauth2/v2.0/token"
THUMBPRINT=$(openssl x509 -in "$CERT_FILE" -outform DER | openssl dgst -sha256 -binary | b64url)
NOW=$(date +%s)

HEADER=$(printf '{"alg":"RS256","typ":"JWT","x5t#S256":"%s"}' "$THUMBPRINT" | b64url)
CLAIMS=$(printf '{"aud":"%s","iss":"%s","sub":"%s","jti":"%s","nbf":%d,"exp":%d}' \
  "$TOKEN_URL" "$CLIENT_ID" "$CLIENT_ID" "$(cat /proc/sys/kernel/random/uuid)" "$NOW" "$((NOW + 600))" | b64url)
SIGNATURE=$(printf '%s.%s' "$HEADER" "$CLAIMS" | openssl dgst -sha256 -sign "$KEY_FILE" | b64url)

TOKEN=$(curl -s "$TOKEN_URL" \
  -d grant_type=client_credentials -d client_id="$CLIENT_ID" \
  -d client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer \
  -d client_assertion="$HEADER.$CLAIMS.$SIGNATURE" \
  -d scope="api://$ENTRA_CLIENT_ID/.default" | jq -r .access_token)
```

The assertion's `aud` must be the exact token URL, `iss` and `sub` are the calling application's
client ID, and `x5t#S256` is the base64url SHA-256 of the DER certificate. The resulting access token
is identical to the client-secret one, so the server needs no change. Once the certificate works,
delete the client secret from the registration.

Jobs queued while the printer's agent is offline are delivered in the order they were submitted as
soon as it connects, within `JOB_TTL_HOURS`. Uploads share the per-IP `UPLOADS_PER_MINUTE` limit.

## Raspberry Pi print agent

A print agent is a small Node.js process beside the printer. It connects out to the print server over
socket.io (`/ws`), downloads its printer's jobs, and prints them through CUPS or IPP. It accepts no inbound
connections, so the Pi only needs outbound access to the server.

### 1. Prepare the Pi

1. Flash Raspberry Pi OS (Debian 13 "trixie", 64-bit). Enable SSH, create a user (for example `print`),
   and add your public key. In `~/.ssh/config`, add a `Host print-agent` entry with the Pi's address.
2. Add the printer to CUPS on the Pi (CUPS web UI at `http://<pi>:631`, or `lpadmin`). Network printers
   usually appear on their own through `dnssd://`. `install` lists CUPS queues (`lpstat`) and IPP
   printers on the network (mDNS), so this step is optional for IPP printers.

### 2. Enroll from the Pi

In `/manage`, choose **Add printer → Set up on the printer's computer → Create setup command**, then run
the one-liner on the Pi:

```bash
curl -sSL https://print.contoso.com/printer/<enroll-token>/install | bash          # user service
curl -sSL https://print.contoso.com/printer/<enroll-token>/install | sudo bash     # system service
```

The script installs Node.js (into `~/.local`, or `/usr/local` as root) if there is no Node.js 20.17 or
newer, installs `@uwacwy/print-agent`, and runs `uwacwy-print-agent install`, which:

- asks whether the printer is a CUPS queue or a network (IPP) printer and lists the ones it finds
- suggests the printer's own name and a slug from it, and re-asks if the slug is taken
- trades the short-lived enrollment token for the printer's agent token
- writes the settings: `~/.config/uwacwy-print-agent.env` (mode 0600), or as root
  `/etc/uwacwy-print-agent.env` (`root:uwacwy-print`, mode 0640)
- installs and starts `uwacwy-print-agent.service`: a user service, or as root a hardened system
  service running as the `uwacwy-print` system user

Without a terminal, pass the answers as flags (`--printer-uri`, `--name`, `--slug`); missing ones are
reported with the printers the Pi can see. A user service runs without a login session only with
lingering enabled (`sudo loginctl enable-linger "$USER"`); `install` says so when it is off.

To set up a printer created on the server instead ("Enter the printer's details here"), use the
commands shown after creating it, which pass `--print-agent-token` and `--printer-uri`. Run `install`
again with `--force` to replace the settings, for example after rotating the agent token.

Logs: `journalctl --user-unit uwacwy-print-agent -f` (user service) or
`journalctl -u uwacwy-print-agent -f` (system service).

### 3. Verify

A healthy start logs:

```
[config] Using /home/print/.config/uwacwy-print-agent.env
[agent] uwacwy-print-agent 0.1.0
[printer] Connected: cups://<Queue-Name>
[server] Reported printer queue.
[ws] Connected: https://print.contoso.com/ws
[ws] Listening to queue: 'https://print.contoso.com/print/<slug>' => '<printer name>'
```

`/manage` shows the printer online, with the queue the agent reported. `uwacwy-print-agent run` exits
with status 2 when settings are missing or invalid, or the CUPS queue does not exist, listing the
printers it can see; a token typo logs an Unauthorized connection error and keeps retrying.

### Pointing a Pi at a development server

`ng serve` listens only on `127.0.0.1`, and it does not work reliably when reached by IP address. Use
the built server instead; it listens on every interface:

1. Allow the workstation's LAN IP for server-side rendering: add `NG_ALLOWED_HOSTS=<workstation-ip>`
   to `packages/server/.env`. Otherwise pages requested by that `Host` return 400.
2. Build and run:

   ```bash
   npm run build -w @uwacwy/print-shared -w @uwacwy/print-server
   npm run start:server        # packages/server/dist, port PORT (4200)
   ```

3. On the Pi, run `install` with `--print-server-url http://<workstation-ip>:4200 --insecure`
   (plain `http://` is otherwise allowed only on localhost).

This exposes the server to your network. Rebuild after code changes; the agent reconnects by itself
when the server restarts.

To keep the server on loopback instead, use `http://localhost:4200` on the Pi (no `--insecure`
needed) and forward the Pi's port 4200 back to the workstation over SSH:

```bash
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -R 127.0.0.1:4200:127.0.0.1:4200 print-agent
```

To test an unreleased agent, `./redeploy-agent.sh [ssh-host]` packs the workspace agent and reinstalls
it on a Pi set up as a user service. For a first install, copy a `npm pack` tarball to the Pi and pass
`--agent-package /tmp/uwacwy-print-agent-<version>.tgz` to the one-liner (`… | bash -s -- --agent-package …`).

## Building and testing

Every package under `packages/` uses the same script names (`build`, `dev`, `test-ng`, `test-api`,
`typecheck`, `lint`, `lint:typed`, `format`, …), so the root runs each one across all packages with
`npm run <script> --workspaces --if-present`; packages without a script skip it. To target one package,
use `npm run <script> -w @uwacwy/print-<shared|agent|server>`, e.g. `npm run dev -w @uwacwy/print-agent`.

```bash
npm run build            # shared, agent (packages/agent/dist/cli.mjs), server (packages/server/dist)
npm test                 # test-ng (Angular unit tests), then test-api (vitest in every package)
npm run typecheck
npm run extract-i18n -w @uwacwy/print-server  # regenerate packages/server/src/locale/messages.xlf (CI fails if stale)
npm run dupes            # jscpd copy/paste report (config in .jscpd.json)
npm run lint             # ESLint (angular-eslint, perfectionist); lint:typed adds type-aware rules
npm run format:check     # Prettier; `npm run format` rewrites
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

A release moves the npm `latest` dist-tag. A prerelease publishes to a dist-tag named after it, so
`v0.2.0-rc.1` is installed with `npm install @uwacwy/print-server@rc` (and `-beta.0` with `@beta`); a
purely numeric prerelease such as `v0.2.0-0` uses `next`. Prereleases push only the exact image tag,
leaving `latest` and `0.2` alone. [`ci.yml`](.github/workflows/ci.yml) runs the same checks, plus
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
