# @uwacwy/print-server

The United Way Quick Print server. One Node.js process serves the web app, the REST API, and the
socket (`/ws`) that print agents connect to. Data lives in SQLite under `DATA_DIR`.

People upload documents and photos through a printer's QR code or 9-digit PIN; staff manage printers
at `/manage` after signing in with Microsoft Entra ID. Each printer is served by
[`@uwacwy/print-agent`](https://www.npmjs.com/package/@uwacwy/print-agent).

## Install

Requires Node.js 24 or newer.

```bash
npm install --global @uwacwy/print-server
UPLOAD_TOKEN_SECRET=$(openssl rand -base64 48) PUBLIC_URL=http://localhost:8080 PORT=8080 uwacwy-print-server
```

Or with Docker: `ghcr.io/uwacwy/print-server` (see the
[repository README](https://github.com/uwacwy/print#docker-compose) for compose examples).

## Usage

```text
uwacwy-print-server [env-file]
uwacwy-print-server --version
```

Settings come from the environment, or from `env-file` (default: `./.env` when present). Existing
environment variables win. [`.env.example`](.env.example), included in this package, lists them all.
The important ones:

| Variable                             | Default                     | Purpose                                                                                                                |
| ------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `UPLOAD_TOKEN_SECRET`                | (required)                  | Signs QR and PIN upload links; 32+ characters. Changing it revokes them.                                               |
| `PORT`                               | `4000`                      | HTTP port for pages, API, and `/ws` (8080 in the image)                                                                |
| `DATA_DIR`                           | `./data`                    | `print.db`, queued jobs, and `logs/`                                                                                   |
| `ACCESS_LOG_DAYS`                    | `14`                        | Days of daily JSON access logs in `DATA_DIR/logs` (`access.log` links to today); `0` disables                          |
| `PUBLIC_URL`                         |                             | Public address; used in QR codes and allowed for server rendering                                                      |
| `NG_ALLOWED_HOSTS`                   |                             | Other host names (comma-separated) pages may be requested by                                                           |
| `TRUST_PROXY`                        | loopback and private ranges | `true` behind a reverse proxy so rate limits see the real client IP; `false` trusts none; or a list of proxy addresses |
| `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` |                             | Enable Entra sign-in and `/manage`; the browser reads them from `/api/client-config`                                   |

`GET /api/healthz` reports health; `GET /api/status` returns how many printers are online.
Scripts can call selected endpoints as Entra applications (client credentials) granted app roles; see
[Calling the API from a script](https://github.com/uwacwy/print#calling-the-api-from-a-script).

## License

MIT
