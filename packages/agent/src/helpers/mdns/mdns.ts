import type { DiscoveredPrinter } from '../discovery/discovery';

/** The parts of a DNS-SD `_ipp._tcp` / `_ipps._tcp` record a printer URI is built from. */
export interface IppService {
  host: string;
  name: string;
  port: number;
  txt?: Record<string, unknown>;
  type: string;
}

const txtValue = (
  txt: IppService['txt'],
  key: string,
): string | undefined => {
  const value = txt?.[key];
  const text = Buffer.isBuffer(value)
    ? value.toString('utf8')
    : value;
  return typeof text === 'string' && text.trim()
    ? text.trim()
    : undefined;
};

/** Browses the local network for IPP printers for `timeoutMs`. */
export async function browseIpp(
  timeoutMs = 4000,
): Promise<DiscoveredPrinter[]> {
  // CommonJS: `default` is the class both natively and once bundled.
  const { default: Bonjour } = await import('bonjour-service');
  const found = new Map<string, DiscoveredPrinter>();
  const bonjour = new Bonjour({}, () => undefined);
  const record = (service: IppService) => {
    const printer = serviceToPrinter(service);
    if (printer) {
      found.set(printer.uri, printer);
    }
  };
  const browsers = ['ipp', 'ipps'].map((type) =>
    bonjour.find({ type }, record),
  );
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  browsers.forEach((browser) => browser.stop());
  bonjour.destroy();
  return [...found.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * An IPP printer URI per the IPP Everywhere DNS-SD conventions: `rp` is the resource path
 * (usually `ipp/print`), `ty` the make and model, `note` the location.
 */
export function serviceToPrinter(
  service: IppService,
): DiscoveredPrinter | undefined {
  const scheme =
    service.type === 'ipps'
      ? 'ipps'
      : service.type === 'ipp'
        ? 'ipp'
        : undefined;
  const host = service.host.replace(/\.$/, '');
  if (!scheme || !host || !Number.isInteger(service.port)) {
    return undefined;
  }
  const path = (
    txtValue(service.txt, 'rp') ?? 'ipp/print'
  ).replace(/^\/+/, '');
  const model = txtValue(service.txt, 'ty');
  const location = txtValue(service.txt, 'note');
  return {
    detail: [model, location, host].filter(Boolean).join(' · '),
    name: service.name.trim() || model || host,
    uri: new URL(`${scheme}://${host}:${service.port}/${path}`)
      .href,
  };
}
