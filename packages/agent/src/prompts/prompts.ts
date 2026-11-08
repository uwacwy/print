import { input, password, select } from '@inquirer/prompts';
import { slugify } from '@uwacwy/print-shared';
import {
  discover,
  type DiscoveredPrinter,
  type PrinterKind,
} from '../helpers/discovery/discovery';
import {
  parseAgentToken,
  parseEnrollToken,
  parseName,
  parsePrinterUri,
  parseServerUrl,
  parseSlug,
  promptValidator,
} from '../helpers/flag-parsers/flag-parsers';

export const promptServerUrl = async (): Promise<string> =>
  parseServerUrl(
    await input({
      message: 'Print server URL',
      validate: promptValidator(parseServerUrl),
    }),
  );

export const promptEnrollToken = async (): Promise<string> =>
  parseEnrollToken(
    await password({
      message:
        'Enrollment token (from "Add printer" on the print server)',
      mask: true,
      validate: promptValidator(parseEnrollToken),
    }),
  );

export const promptAgentToken = async (): Promise<string> =>
  parseAgentToken(
    await password({
      message: 'Agent token',
      mask: true,
      validate: promptValidator(parseAgentToken),
    }),
  );

const MANUAL = Symbol('manual');
const RESCAN = Symbol('rescan');

/** Picks CUPS or IPP, lists what is available, and returns the chosen printer. */
export async function choosePrinter(): Promise<DiscoveredPrinter> {
  const kind = await select<PrinterKind>({
    message: 'How does this computer reach the printer?',
    choices: [
      {
        name: 'CUPS',
        value: 'cups',
        description:
          'A print queue set up on this computer (lpstat)',
      },
      {
        name: 'IPP',
        value: 'ipp',
        description: 'A network printer found with mDNS/Bonjour',
      },
    ],
  });
  for (;;) {
    console.error(
      kind === 'cups'
        ? 'Listing CUPS queues…'
        : 'Searching the network for IPP printers…',
    );
    const [{ printers, error } = { printers: [] }] = await discover([
      kind,
    ]);
    if (error) {
      console.error(error);
    }
    const choice = await select<
      DiscoveredPrinter | typeof MANUAL | typeof RESCAN
    >({
      message: printers.length ? 'Printer' : 'No printers found',
      choices: [
        ...printers.map((printer) => ({
          name: printer.name,
          value: printer,
          description:
            printer.detail && !printer.uri.includes(printer.detail)
              ? `${printer.uri} · ${printer.detail}`
              : printer.uri,
        })),
        { name: 'Search again', value: RESCAN },
        {
          name: 'Enter a printer URI',
          value: MANUAL,
          description: 'cups://<queue> or ipp://<host>/<path>',
        },
      ],
    });
    if (choice === RESCAN) {
      continue;
    }
    if (choice === MANUAL) {
      const uri = parsePrinterUri(
        await input({
          message: 'Printer URI',
          validate: promptValidator(parsePrinterUri),
        }),
      );
      return { uri, name: new URL(uri).hostname };
    }
    return choice;
  }
}

export const promptName = async (
  defaultName: string,
): Promise<string> =>
  parseName(
    await input({
      message: 'Printer name (shown to people printing)',
      default: defaultName,
      validate: promptValidator(parseName),
    }),
  );

export const promptSlug = async (
  name: string,
  message = 'Printer slug (its address: /print/<slug>)',
): Promise<string> =>
  parseSlug(
    await input({
      message,
      default: slugify(name) || undefined,
      validate: promptValidator(parseSlug),
    }),
  );
