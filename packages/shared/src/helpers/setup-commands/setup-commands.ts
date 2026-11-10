import { installUrl } from '../install-urls/install-urls';
import { shArg, shq } from '../shell/shell';

export const AGENT_PACKAGE = '@uwacwy/print-agent';
export const AGENT_IMAGE = 'ghcr.io/uwacwy/print-agent';

export interface AgentCredentials {
  agentToken: string;
  printerUri: string;
  serverUrl: string;
}

export interface AgentServiceOptions extends AgentCredentials {
  /** Compose service name suffix; the service is `agent` without it. */
  slug?: string;
}

const flags = (pairs: [flag: string, value: string][]): string =>
  pairs
    .map(([flag, value]) => `${flag} ${shArg(value)}`)
    .join(' ');

/** Interactive enrollment through the server-rendered script. */
export const curlEnrollCommand = (
  serverUrl: string,
  enrollToken: string,
): string =>
  `curl -sSL ${shArg(installUrl(serverUrl, enrollToken))} | bash`;

/** Non-interactive install of an already-created printer through the generic script. */
export const curlInstallCommand = (
  credentials: AgentCredentials,
): string =>
  `curl -sSL ${shArg(installUrl(credentials.serverUrl))} | bash -s -- ${flags(
    [
      ['--print-agent-token', credentials.agentToken],
      ['--printer-uri', credentials.printerUri],
    ],
  )}`;

export const npxEnrollCommand = (
  serverUrl: string,
  enrollToken: string,
): string =>
  `npx ${AGENT_PACKAGE} install ${flags([
    ['--print-server-url', serverUrl],
    ['--print-enroll-token', enrollToken],
  ])}`;

export const npxInstallCommand = (
  credentials: AgentCredentials,
): string =>
  `npx ${AGENT_PACKAGE} install ${flags([
    ['--print-server-url', credentials.serverUrl],
    ['--print-agent-token', credentials.agentToken],
    ['--printer-uri', credentials.printerUri],
  ])}`;

/** YAML double-quoted scalar; JSON string escaping is a valid subset. */
const yamlString = (value: string): string =>
  JSON.stringify(value);

const isCups = (printerUri: string): boolean =>
  printerUri.startsWith('cups://');

/** A `docker compose` service; CUPS queues get the host's CUPS socket. */
export const dockerComposeSnippet = ({
  agentToken,
  printerUri,
  serverUrl,
  slug,
}: AgentServiceOptions): string =>
  [
    'services:',
    `  ${slug ? `agent-${slug}` : 'agent'}:`,
    `    image: ${AGENT_IMAGE}:latest`,
    '    restart: unless-stopped',
    '    init: true',
    '    environment:',
    `      PRINT_SERVER_URL: ${yamlString(serverUrl)}`,
    `      PRINT_AGENT_TOKEN: ${yamlString(agentToken)}`,
    `      PRINTER_URI: ${yamlString(printerUri)}`,
    ...(isCups(printerUri)
      ? [
          '      CUPS_SERVER: /run/cups/cups.sock',
          '    volumes:',
          '      - /run/cups/cups.sock:/run/cups/cups.sock',
        ]
      : []),
    '',
  ].join('\n');

/** `docker run` equivalent of `dockerComposeSnippet`. */
export const dockerRunCommand = ({
  agentToken,
  printerUri,
  serverUrl,
}: AgentCredentials): string =>
  [
    'docker run -d --restart unless-stopped --init',
    `-e PRINT_SERVER_URL=${shq(serverUrl)}`,
    `-e PRINT_AGENT_TOKEN=${shq(agentToken)}`,
    `-e PRINTER_URI=${shq(printerUri)}`,
    ...(isCups(printerUri)
      ? [
          '-e CUPS_SERVER=/run/cups/cups.sock',
          '-v /run/cups/cups.sock:/run/cups/cups.sock',
        ]
      : []),
    `${AGENT_IMAGE}:latest`,
  ].join(' \\\n  ');

/** A titled, copyable setup command for the management UI. */
export interface SetupCommand {
  command: string;
  id: string;
  label: string;
}

/** Commands that enroll a new printer from its computer with an enrollment token. */
export const enrollSetupCommands = (
  serverUrl: string,
  enrollToken: string,
): SetupCommand[] => [
  {
    command: curlEnrollCommand(serverUrl, enrollToken),
    id: 'curl',
    label: 'One line (installs Node.js if needed)',
  },
  {
    command: npxEnrollCommand(serverUrl, enrollToken),
    id: 'npx',
    label: 'With Node.js 20.17 or newer already installed',
  },
];

/** Commands that run the agent for a printer created on the server. */
export const agentSetupCommands = (
  options: AgentServiceOptions,
): SetupCommand[] => [
  {
    command: curlInstallCommand(options),
    id: 'curl',
    label: 'One line (installs Node.js if needed)',
  },
  {
    command: npxInstallCommand(options),
    id: 'npx',
    label: 'With Node.js 20.17 or newer already installed',
  },
  {
    command: dockerComposeSnippet(options),
    id: 'compose',
    label: 'Docker Compose service',
  },
];
