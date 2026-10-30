import ipp, { type GetPrinterAttributesResponse } from 'ipp';

const parser = ipp.parse as typeof ipp.parse & {
  handleUnknownTag: (
    tag: number,
    name: string,
    length: number,
    read: (length: number) => string,
  ) => string | undefined;
};
// The upstream parser logs unknown printer attributes to stdout, corrupting JSON output.
parser.handleUnknownTag = (_tag, _name, length, read) =>
  length ? read(length) : undefined;

export async function getPrinterInfo(address: string): Promise<{
  uri: string;
  statusCode: string;
  capabilities: object;
}> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new Error(
      'Provide a printer address such as ipp://printer.local or ipps://printer.local/ipp/print.',
    );
  }
  if (
    !['ipp:', 'ipps:', 'http:', 'https:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Printer address must use ipp://, ipps://, http://, or https:// without credentials or query parameters.',
    );
  }

  const paths =
    !url.pathname || url.pathname === '/'
      ? ['/ipp/print', '/ipp/printer']
      : [url.pathname];
  const errors: string[] = [];
  for (const path of paths) {
    const endpoint = new URL(url);
    endpoint.pathname = path;
    const transport = new URL(endpoint);
    if (transport.protocol === 'ipp:') {
      transport.protocol = 'http:';
    }
    if (transport.protocol === 'ipps:') {
      transport.protocol = 'https:';
    }
    if (endpoint.protocol === 'http:') {
      endpoint.protocol = 'ipp:';
    }
    if (endpoint.protocol === 'https:') {
      endpoint.protocol = 'ipps:';
    }

    try {
      const printer = new ipp.Printer(transport.toString(), {
        uri: endpoint.toString(),
        version: '2.0',
      });
      (
        printer as ipp.Printer & { url: { signal?: AbortSignal } }
      ).url.signal = AbortSignal.timeout(10_000);
      const response =
        await new Promise<GetPrinterAttributesResponse>(
          (resolve, reject) => {
            printer.execute(
              'Get-Printer-Attributes',
              {
                'operation-attributes-tag': {
                  'requesting-user-name': 'omega-print-admin',
                  'requested-attributes': ['all'],
                },
              },
              (error, result) =>
                error ? reject(error) : resolve(result),
            );
          },
        );
      if (!response.statusCode?.startsWith('successful-')) {
        throw new Error(
          `IPP status: ${response.statusCode ?? 'no status'}`,
        );
      }
      return {
        uri: endpoint.toString(),
        statusCode: response.statusCode,
        capabilities: response['printer-attributes-tag'] ?? {},
      };
    } catch (error) {
      errors.push(
        `${endpoint.toString()}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new Error(
    `Unable to query printer capabilities:\n${errors.join('\n')}`,
  );
}
