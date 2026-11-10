declare module 'ipp' {
  interface GetPrinterAttributesMessage {
    'operation-attributes-tag': {
      'requested-attributes': string[];
      'requesting-user-name': string;
    };
  }

  interface GetPrinterAttributesResponse {
    'printer-attributes-tag'?: {
      'document-format-supported'?: string | string[];
    };
    statusCode?: string;
  }

  interface Printer {
    execute(
      operation: 'Print-Job',
      message: PrintJobMessage,
      callback: (
        error: Error | null,
        response?: PrintJobResponse,
      ) => void,
    ): void;
    execute(
      operation: 'Get-Printer-Attributes',
      message: GetPrinterAttributesMessage,
      callback: (
        error: Error | null,
        response?: GetPrinterAttributesResponse,
      ) => void,
    ): void;
    url: { signal?: AbortSignal };
  }

  interface PrinterOptions {
    uri?: string;
    version?: string;
  }

  interface PrintJobMessage {
    data: Buffer;
    'job-attributes-tag'?: {
      'print-quality'?: 'draft' | 'high' | 'normal';
    };
    'operation-attributes-tag': {
      'document-format': 'application/PCLm' | 'application/pdf';
      'job-name': string;
      'requesting-user-name': string;
    };
  }

  interface PrintJobResponse {
    'job-attributes-tag'?: {
      'job-id'?: number;
      'job-uri'?: string;
    };
    statusCode?: string;
  }

  function Printer(
    uri: string,
    options?: PrinterOptions,
  ): Printer;
  export {
    GetPrinterAttributesMessage,
    GetPrinterAttributesResponse,
    Printer,
    PrinterOptions,
    PrintJobMessage,
    PrintJobResponse,
  };
}
