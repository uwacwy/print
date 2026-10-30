/** A client error while reading or validating an upload, with the HTTP status to report. */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
