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
      mask: true,
      message:
        'Enrollment token (from "Add printer" on the print server)',
      validate: promptValidator(parseEnrollToken),
    }),
  );

export const promptAgentToken = async (): Promise<string> =>
  parseAgentToken(
    await password({
      mask: true,
      message: 'Agent token',
      validate: promptValidator(parseAgentToken),
    }),
  );

const MANUAL = Symbol('manual');
const RESCAN = Symbol('rescan');

/** Picks CUPS or IPP, lists what is available, and returns the chosen printer. */
export async function choosePrinter(): Promise<DiscoveredPrinter> {
  const kind = await select<PrinterKind>({
    choices: [
      {
        description:
          'A print queue set up on this computer (lpstat)',
        name: 'CUPS',
        value: 'cups',
      },
      {
        description: 'A network printer found with mDNS/Bonjour',
        name: 'IPP',
        value: 'ipp',
      },
    ],
    message: 'How does this computer reach the printer?',
  });
  for (;;) {
    console.error(
      kind === 'cups'
        ? 'Listing CUPS queues…'
        : 'Searching the network for IPP printers…',
    );
    const [{ error, printers } = { printers: [] }] =
      await discover([kind]);
    if (error) {
      console.error(error);
    }
    const choice = await select<
      DiscoveredPrinter | typeof MANUAL | typeof RESCAN
    >({
      choices: [
        ...printers.map((printer) => ({
          description:
            printer.detail &&
            !printer.uri.includes(printer.detail)
              ? `${printer.uri} · ${printer.detail}`
              : printer.uri,
          name: printer.name,
          value: printer,
        })),
        { name: 'Search again', value: RESCAN },
        {
          description: 'cups://<queue> or ipp://<host>/<path>',
          name: 'Enter a printer URI',
          value: MANUAL,
        },
      ],
      message: printers.length ? 'Printer' : 'No printers found',
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
      return { name: new URL(uri).hostname, uri };
    }
    return choice;
  }
}

export const promptName = async (
  defaultName: string,
): Promise<string> =>
  parseName(
    await input({
      default: defaultName,
      message: 'Printer name (shown to people printing)',
      validate: promptValidator(parseName),
    }),
  );

export const promptSlug = async (
  name: string,
  message = 'Printer slug (its address: /print/<slug>)',
): Promise<string> =>
  parseSlug(
    await input({
      default: slugify(name) || undefined,
      message,
      validate: promptValidator(parseSlug),
    }),
  );
