declare module "ipp" {
  interface PrinterOptions {
    uri?: string;
    version?: string;
  }

  interface PrintJobMessage {
    "operation-attributes-tag": {
      "requesting-user-name": string;
      "job-name": string;
      "document-format": "application/pdf" | "application/PCLm";
    };
    data: Buffer;
  }

  interface PrintJobResponse {
    statusCode?: string;
    "job-attributes-tag"?: {
      "job-id"?: number;
      "job-uri"?: string;
    };
  }

  interface GetPrinterAttributesMessage {
    "operation-attributes-tag": {
      "requesting-user-name": string;
      "requested-attributes": string[];
    };
  }

  interface GetPrinterAttributesResponse {
    statusCode?: string;
    "printer-attributes-tag"?: {
      "document-format-supported"?: string | string[];
    };
  }

  interface Printer {
    url: { signal?: AbortSignal };
    execute(
      operation: "Print-Job",
      message: PrintJobMessage,
      callback: (error: Error | null, response?: PrintJobResponse) => void,
    ): void;
    execute(
      operation: "Get-Printer-Attributes",
      message: GetPrinterAttributesMessage,
      callback: (error: Error | null, response?: GetPrinterAttributesResponse) => void,
    ): void;
  }

  function Printer(uri: string, options?: PrinterOptions): Printer;
  export {
    Printer,
    PrinterOptions,
    PrintJobMessage,
    PrintJobResponse,
    GetPrinterAttributesMessage,
    GetPrinterAttributesResponse,
  };
}
