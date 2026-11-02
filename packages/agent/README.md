# @uwacwy/print-agent

The print agent for United Way Quick Print. It runs next to one printer, connects out to
[`@uwacwy/print-server`](https://www.npmjs.com/package/@uwacwy/print-server) over a WebSocket, downloads
that printer's jobs, and prints them through CUPS (`lp`) or directly over IPP. It accepts no inbound
connections.

## Install

Requires Node.js 20.12 or newer. `cups://` printers need the CUPS client (`lp`); IPP printers without
PDF support need Ghostscript (`gs`) to convert jobs to PCLm.

```bash
npm install --global @uwacwy/print-agent
uwacwy-print-agent /etc/uwacwy-print-agent.env
```

Or with Docker: `ghcr.io/uwacwy/print-agent` for linux/amd64 and linux/arm64, with `lp` and `gs`
included (see the [repository README](https://github.com/uwacwy/print#docker-compose) for compose
examples, including printing through the host's CUPS).

## Usage

```text
uwacwy-print-agent [env-file]
uwacwy-print-agent --version
```

Settings come from the environment or from `env-file`; existing environment variables win.

| Variable            | Purpose                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `PRINT_SERVER_URL`  | Server address, for example `https://print.example.org`             |
| `PRINT_AGENT_TOKEN` | The printer's agent token, shown once when it is added in `/manage` |
| `PRINTER_URI`       | `cups://Queue_Name`, or `ipp://` / `ipps://` for a network printer  |

`PRINTER_URI` takes driver options in its query string, for example
`cups://Queue?option_sides=two-sided-long-edge` (passed to `lp` as `-o sides=two-sided-long-edge`) or
`ipp://printer.local/ipp/print?quality=high&timeout=180000`. See [`.env.example`](.env.example) for
every option.

## License

MIT
