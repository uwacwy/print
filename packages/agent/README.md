# @uwacwy/print-agent

The print agent for United Way Quick Print. It runs next to one printer, connects out to
[`@uwacwy/print-server`](https://www.npmjs.com/package/@uwacwy/print-server) over a WebSocket, downloads
that printer's jobs, and prints them through CUPS (`lp`) or directly over IPP. It accepts no inbound
connections.

## Install

Requires Node.js 20.17 or newer. `cups://` printers need the CUPS client (`lp`, `lpstat`, `cupsenable`)
and should have Ghostscript (`gs`), which shrinks images before printing. IPP printers without PDF
support need Ghostscript to convert jobs to PCLm.

On the print server, open **/manage → Add printer → Set up on the printer's computer** and run the
one-liner it shows. It installs Node.js if needed, then this package, then runs `install`:

```bash
curl -fsSL https://print.contoso.com/printer/<enroll-token>/install | bash
```

Or with npm directly:

```bash
npx @uwacwy/print-agent install --print-server-url https://print.contoso.com --print-enroll-token <token>
```

`install` asks whether the printer is a CUPS queue or a network (IPP) printer, lists the ones it finds,
and suggests the printer's own name and a slug. It exchanges the short-lived enrollment token for the
printer's long-lived agent token, saves the settings, and starts a systemd service: a user service
(`~/.config/uwacwy-print-agent.env`), or as root a system service running as `uwacwy-print`
(`/etc/uwacwy-print-agent.env`). Pass `--no-service` to skip the service.

Or with Docker: `ghcr.io/uwacwy/print-agent` for linux/amd64 and linux/arm64, with `lp` and `gs`
included (see the [repository README](https://github.com/uwacwy/print#docker-compose) for compose
examples, including printing through the host's CUPS). The image runs `run` with settings from the
environment.

## Usage

```text
uwacwy-print-agent install [--print-server-url url] [--print-enroll-token token | --print-agent-token token]
                           [--printer-uri uri] [--name name] [--slug slug] [--config path]
                           [--force] [--no-service] [--insecure]
uwacwy-print-agent run [--config path] [--insecure]
uwacwy-print-agent list-queues [--cups] [--ipp] [--json] [--timeout seconds]
uwacwy-print-agent completion install          # bash completion
uwacwy-print-agent --help | --version
```

`run` takes its settings from the environment, then from a config file: `--config <file>`, or the first
`uwacwy-print-agent.env` found in `~/.config` (or `$XDG_CONFIG_HOME`), `/usr/local/etc`, and `/etc`.
At a terminal it prompts for anything missing and saves it, so the next run needs no prompts; otherwise
it lists what is missing (and the printers it can see) and exits with status 2.

| Variable             | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `PRINT_SERVER_URL`   | Server address, for example `https://print.contoso.com`             |
| `PRINT_AGENT_TOKEN`  | The printer's agent token, shown once when it is added in `/manage` |
| `PRINTER_URI`        | `cups://Queue_Name`, or `ipp://` / `ipps://` for a network printer  |
| `PRINT_ENROLL_TOKEN` | `install` only: an enrollment token from "Add printer"              |

`PRINTER_URI` takes driver options in its query string, for example
`cups://Queue?option_sides=two-sided-long-edge` (passed to `lp` as `-o sides=two-sided-long-edge`) or
`ipp://printer.local/ipp/print?quality=high&timeout=180000`. See [`.env.example`](.env.example) for
every option. Once connected, the agent reports its queue to the server, shown on `/manage`.

## License

MIT
