import { AGENT_PACKAGE, shq } from '@uwacwy/print-shared';

export interface InstallScriptVars {
  /** Pinned agent version (the server's); latest when unknown. */
  agentVersion?: string;
  /** Present for the interactive enrollment script. */
  enrollToken?: string;
  enrollTokenExpiresAt?: Date;
  /** `PUBLIC_URL` origin the agent connects to. */
  serverUrl: string;
}

export const INSTALL_SCRIPT_CONTENT_TYPE =
  'text/x-shellscript; charset=utf-8';
export const NODE_MIN_VERSION = '20.17.0';
/** Used when https://nodejs.org/dist/index.json cannot be read. */
export const NODE_FALLBACK_VERSION = 'v24.22.2';

/** A script that only explains why it cannot install; `curl … | bash` shows the reason. */
export const renderErrorScript = (message: string): string =>
  [
    '#!/bin/sh',
    `printf '%s\\n' ${shq(`uwacwy-print-agent: ${message}`)} >&2`,
    'exit 1',
    '',
  ].join('\n');

/*
 * Everything runs inside main(), called on the last line, so a truncated download never runs
 * half a script. Under `curl … | sudo bash` sudo resets PATH and the environment, so the
 * script relies only on its own arguments and Node.js detection.
 */
/** Bash `${…}` expansions are written `%{…}` here so the template literal leaves them alone. */
const BODY = String.raw`
say() { printf '==> %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# True when version $1 >= version $2.
version_ge() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]
}

# Accepts a node binary that is new enough and has npm beside it (Debian's nodejs has no npm).
node_ok() {
  local node="$1" version npm
  [ -x "$node" ] || return 1
  version="$("$node" -p 'process.versions.node' 2>/dev/null)" || return 1
  version_ge "$version" "$NODE_MIN" || return 1
  npm="$(dirname "$node")/npm"
  [ -x "$npm" ] || npm="$(command -v npm || true)"
  [ -n "$npm" ] || return 1
  NODE="$node"
  NPM="$npm"
}

find_node() {
  local candidate
  for candidate in "$(command -v node || true)" "$@"; do
    if [ -n "$candidate" ] && node_ok "$candidate"; then
      return 0
    fi
  done
  return 1
}

node_arch() {
  case "$(uname -m)" in
    aarch64 | arm64) echo arm64 ;;
    armv7l) echo armv7l ;;
    x86_64 | amd64) echo x64 ;;
    *) die "There is no official Node.js build for $(uname -m). Install Node.js >= $NODE_MIN with npm, then rerun." ;;
  esac
}

latest_lts() {
  curl -fsSL https://nodejs.org/dist/index.json 2>/dev/null |
    tr '{' '\n' | grep -v '"lts":false' |
    grep -o '"version":"v[0-9.]*"' | head -n1 | cut -d'"' -f4
}

# Installs the official Node.js build as <root>/node-vX-linux-ARCH, points <root>/node at it,
# and links node, npm, and npx into <bin_dir>.
install_node() {
  local root="$1" bin_dir="$2" tool arch version name
  for tool in curl tar xz sha256sum; do
    command -v "$tool" >/dev/null || die "$tool is required to download Node.js."
  done
  arch="$(node_arch)"
  version="$(latest_lts || true)"
  version="%{version:-$NODE_FALLBACK_VERSION}"
  name="node-$version-linux-$arch"
  say "Installing Node.js $version to $root/$name"
  WORK_DIR="$(mktemp -d)"
  trap 'rm -rf "$WORK_DIR"' EXIT
  curl -fsSL "https://nodejs.org/dist/$version/$name.tar.xz" -o "$WORK_DIR/$name.tar.xz"
  curl -fsSL "https://nodejs.org/dist/$version/SHASUMS256.txt" -o "$WORK_DIR/SHASUMS256.txt"
  (cd "$WORK_DIR" && grep " $name.tar.xz\$" SHASUMS256.txt | sha256sum -c - >/dev/null) ||
    die "Checksum mismatch for $name.tar.xz."
  mkdir -p "$root" "$bin_dir"
  rm -rf "%{root:?}/$name"
  tar -xJf "$WORK_DIR/$name.tar.xz" -C "$root"
  ln -sfn "$name" "$root/node"
  for tool in node npm npx; do
    ln -sf "$root/node/bin/$tool" "$bin_dir/$tool"
  done
  node_ok "$root/node/bin/node" || die "Node.js was installed but does not run."
}

main() {
  local args=() spec prefix node_root bin_dir cli
  while [ $# -gt 0 ]; do
    case "$1" in
      --agent-package | --agent-version)
        [ $# -ge 2 ] || die "$1 needs a value."
        if [ "$1" = --agent-package ]; then AGENT_PACKAGE="$2"; else AGENT_VERSION="$2"; fi
        shift 2
        ;;
      --agent-package=*) AGENT_PACKAGE="%{1#*=}"; shift ;;
      --agent-version=*) AGENT_VERSION="%{1#*=}"; shift ;;
      *) args+=("$1"); shift ;;
    esac
  done

  if [ -n "$TOKEN_EXPIRES_AT" ]; then
    say "This enrollment link works until $TOKEN_EXPIRES_AT"
  fi
  if [ "$(id -u)" -eq 0 ]; then
    prefix=/usr/local
    node_root=/usr/local/lib/nodejs
    bin_dir=/usr/local/bin
    find_node "$node_root/node/bin/node" || install_node "$node_root" "$bin_dir"
  else
    prefix="$HOME/.local"
    node_root="$HOME/.local/opt"
    bin_dir="$HOME/.local/bin"
    find_node "$bin_dir/node" "$node_root/node/bin/node" || install_node "$node_root" "$bin_dir"
  fi
  say "Using Node.js $("$NODE" --version) at $NODE"

  case "$AGENT_PACKAGE" in
    *.tgz | /* | ./* | ../*) spec="$AGENT_PACKAGE" ;;
    *) spec="$AGENT_PACKAGE%{AGENT_VERSION:+@$AGENT_VERSION}" ;;
  esac
  say "Installing $spec to $prefix"
  PATH="$(dirname "$NODE"):$PATH" "$NPM" install --global --prefix "$prefix" \
    --no-fund --no-audit --loglevel=error "$spec" >&2
  cli="$prefix/lib/node_modules/@uwacwy/print-agent/dist/cli.mjs"
  [ -f "$cli" ] || die "$cli is missing after npm install."

  set -- install --print-server-url "$PRINT_SERVER_URL"
  if [ -n "$PRINT_ENROLL_TOKEN" ]; then
    set -- "$@" --print-enroll-token "$PRINT_ENROLL_TOKEN"
  fi
  set -- "$@" %{args[@]+"%{args[@]}"}

  # On PATH, this node's own path (not its resolved, versioned directory) goes into the service.
  export PATH="$(dirname "$NODE"):$PATH"
  # curl owns stdin; prompts read from the terminal when there is one.
  if { : </dev/tty; } 2>/dev/null; then
    exec "$NODE" "$cli" "$@" </dev/tty
  fi
  exec "$NODE" "$cli" "$@"
}
`;

const safeVersion = (version: string | undefined): string =>
  version && /^[0-9A-Za-z.+-]+$/.test(version) ? version : '';

/** The `curl … | bash` installer: preconfigured variables, then the shared body. */
export const renderInstallScript = ({
  agentVersion,
  enrollToken,
  enrollTokenExpiresAt,
  serverUrl,
}: InstallScriptVars): string =>
  [
    '#!/usr/bin/env bash',
    "# Installs the United Way Quick Print agent and enrolls this computer's printer.",
    '# Options: --agent-package <name|file.tgz> --agent-version <version>; other options go to',
    '# `uwacwy-print-agent install` (see --help).',
    'set -euo pipefail',
    '',
    `PRINT_SERVER_URL=${shq(serverUrl)}`,
    `PRINT_ENROLL_TOKEN=${shq(enrollToken ?? '')}`,
    `TOKEN_EXPIRES_AT=${shq(enrollTokenExpiresAt?.toISOString() ?? '')}`,
    `AGENT_PACKAGE="\${AGENT_PACKAGE:-${AGENT_PACKAGE}}"`,
    `AGENT_VERSION="\${AGENT_VERSION:-${safeVersion(agentVersion)}}"`,
    `NODE_MIN=${NODE_MIN_VERSION}`,
    `NODE_FALLBACK_VERSION=${NODE_FALLBACK_VERSION}`,
    'NODE="" NPM="" WORK_DIR=""',
    BODY.replaceAll('%{', '${'),
    'main "$@"',
    '',
  ].join('\n');
