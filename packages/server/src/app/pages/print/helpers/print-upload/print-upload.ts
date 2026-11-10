import { type UploadTokenStatus } from '@uwacwy/print-shared';

export interface DocumentRow {
  /** Kept as a string because native selects bind string values. */
  copies: string;
  file: File | null;
  id: number;
}

export interface UploadModel {
  documents: DocumentRow[];
  title: string;
}

export const ACCEPTED_TYPES =
  '.pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif';
export const TITLE_MAX_LENGTH = 120;
export const NO_DOCUMENTS_MESSAGE =
  'Choose at least one document to print.';

const TOKEN_MESSAGES: Record<
  Exclude<UploadTokenStatus, 'valid'>,
  string
> = {
  expired: $localize`:@@print-upload.link-expired:This print link has expired.`,
  invalid: $localize`:@@print-upload.link-invalid:This print link is not valid.`,
  'not-yet-valid': $localize`:@@print-upload.qr-not-active:This QR code is not active yet.`,
};

export const newDocument = (id: number): DocumentRow => ({
  copies: '1',
  file: null,
  id,
});

export const emptyUpload = (id: number): UploadModel => ({
  documents: [newDocument(id)],
  title: '',
});

export const addDocument = (
  upload: UploadModel,
  id: number,
): UploadModel => ({
  ...upload,
  documents: [...upload.documents, newDocument(id)],
});

export const removeDocument = (
  upload: UploadModel,
  id: number,
): UploadModel => ({
  ...upload,
  documents: upload.documents.filter(
    (document) => document.id !== id,
  ),
});

export const hasDocument = (documents: readonly DocumentRow[]) =>
  documents.some((document) => document.file);

/** The multipart body the server expects; rows without a file are skipped. */
export function buildJobBody({
  documents,
  title,
}: UploadModel): FormData {
  const body = new FormData();
  body.set('job__title', title);
  documents
    .flatMap(({ copies, file }) =>
      file ? [{ copies, file }] : [],
    )
    .forEach(({ copies, file }, index) => {
      body.set(`document__copies_${index}`, copies);
      body.set(`document__file_${index}`, file, file.name);
    });
  return body;
}

export const maxUploadMb = (
  maxUploadBytes: number | undefined,
) => Math.floor((maxUploadBytes ?? 0) / 1048576);

/** `['1', '2', …]` up to the printer's copy limit (at least one). */
export const copyOptions = (maxCopies: number | undefined) =>
  Array.from({ length: maxCopies ?? 1 }, (_, index) =>
    String(index + 1),
  );

export function fileSizeError(
  file: File | null,
  limitBytes: number | undefined,
): string | undefined {
  return file &&
    limitBytes !== undefined &&
    file.size > limitBytes
    ? `${file.name} exceeds the ${maxUploadMb(limitBytes)} MB limit.`
    : undefined;
}

export const jobSentNotice = (
  job: { agentOnline: boolean; title: string },
  printerName: string,
) =>
  job.agentOnline
    ? `"${job.title}" was sent to ${printerName}.`
    : `"${job.title}" is queued and will print when ${printerName} is back online.`;

/** Why the link's token can't be used, or '' when it is valid or absent. */
export const tokenNotice = (
  status: null | undefined | UploadTokenStatus,
) =>
  status && status !== 'valid' ? TOKEN_MESSAGES[status] : '';
