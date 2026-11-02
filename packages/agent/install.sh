#!/usr/bin/env bash
set -euo pipefail

bundle_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
install_dir=/opt/uwacwy-print-agent
env_file=/etc/uwacwy-print-agent.env
service_name=uwacwy-print-agent

(( EUID == 0 )) || { printf 'Run with sudo: sudo %s\n' "$0" >&2; exit 1; }
for command_name in node install cp systemctl; do
  command -v "$command_name" >/dev/null || { printf 'Missing required command: %s\n' "$command_name" >&2; exit 1; }
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)' || {
  printf 'Node.js 20 or newer is required (found %s).\n' "$(node --version)" >&2
  exit 1
}
[[ -f $bundle_dir/print-agent.cjs && -f $bundle_dir/$service_name.service ]] || {
  printf 'Run this from the extracted uwacwy-print-agent bundle.\n' >&2
  exit 1
}

configure=1
if [[ -f $env_file ]]; then
  read -r -p "Keep existing configuration in $env_file? [Y/n] " keep
  [[ $keep =~ ^[Nn] ]] || configure=0
fi

if (( configure )); then
  read -r -p 'Print server URL (https://...): ' server_url
  read -r -p 'Printer destination (cups://queue or IPP URI): ' printer_uri
  read -r -s -p 'Agent token: ' agent_token
  printf '\n'
  node -e 'const u = new URL(process.argv[1]); if (u.protocol !== "https:" || u.username || u.password) process.exit(1)' "$server_url" 2>/dev/null || {
    printf 'Server URL must be HTTPS without embedded credentials.\n' >&2
    exit 2
  }
  node -e 'const u = new URL(process.argv[1]); if (u.protocol === "cups:") { if (!/^[A-Za-z0-9_.-]{1,128}$/.test(u.hostname) || u.pathname || u.port || u.hash || u.username || u.password) process.exit(1); } else if (!(["ipp:", "ipps:", "http:", "https:"].includes(u.protocol)) || !u.hostname || u.username || u.password || !u.pathname || u.pathname === "/") process.exit(1)' "$printer_uri" 2>/dev/null || {
    printf 'Use cups://<queue_name> or an IPP printer endpoint without embedded credentials.\n' >&2
    exit 2
  }
  if [[ $printer_uri == cups://* ]]; then
    command -v lp >/dev/null && command -v lpstat >/dev/null || { printf 'CUPS tools lp and lpstat are required for cups://.\n' >&2; exit 1; }
    cups_queue="${printer_uri#cups://}"; cups_queue="${cups_queue%%\?*}"
    lpstat -p "$cups_queue" >/dev/null 2>&1 || { printf 'CUPS queue does not exist: %s\n' "$cups_queue" >&2; exit 2; }
  fi
  [[ $agent_token =~ ^[A-Za-z0-9_-]{32,}$ ]] || { printf 'Agent token looks malformed.\n' >&2; exit 2; }
fi

id uwacwy-print >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin uwacwy-print
install -d -o root -g root -m 0755 "$install_dir"
install -d -o root -g root -m 0755 "$install_dir/node_modules"
install -o root -g root -m 0644 "$bundle_dir/print-agent.cjs" "$install_dir/print-agent.cjs"
cp -a "$bundle_dir/node_modules/ipp" "$install_dir/node_modules/ipp"
install -o root -g root -m 0644 "$bundle_dir/$service_name.service" "/etc/systemd/system/$service_name.service"

if (( configure )); then
  umask 077
  printf 'PRINT_SERVER_URL=%s\nPRINT_AGENT_TOKEN=%s\nPRINTER_URI=%s\n' "$server_url" "$agent_token" "$printer_uri" > "$env_file"
  chown root:uwacwy-print "$env_file"
  chmod 0640 "$env_file"
fi

systemctl daemon-reload
systemctl enable "$service_name.service" >/dev/null
systemctl restart "$service_name.service"
printf 'Installed %s. Follow logs with: journalctl -u %s -f\n' "$service_name" "$service_name"
