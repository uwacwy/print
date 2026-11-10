import type { JobSubmission } from './multipart';

/** The submitted title, else the single file's name, else a document count. */
export function jobTitle({
  documents,
  title,
}: JobSubmission): string {
  const submitted = (title ?? '').trim();
  const fromFiles =
    documents.length === 1
      ? documents[0].fileName.replace(/\.[^.]+$/, '').trim()
      : `${documents.length} documents`;
  return (submitted || fromFiles || 'Print job').slice(0, 120);
}

export const copiesValid = (
  { documents }: JobSubmission,
  maxCopies: number,
) =>
  documents.every(
    ({ copies }) =>
      Number.isInteger(copies) &&
      copies >= 1 &&
      copies <= maxCopies,
  );
