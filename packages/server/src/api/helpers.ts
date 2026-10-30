import type { Request, RequestHandler } from "express";
import { UPLOAD_HEADER, UploadError } from "./upload.router";
import { JobSubmission, UploadedFile } from './types';
import busboy from "busboy";
import type { UploadConfig } from "../server-config";


/**
 * Cross-site forms cannot set custom headers, and without CORS a cross-origin fetch that
 * sets one fails its preflight, so requiring the header blocks CSRF without cookies.
 */

export const requireSameOrigin: RequestHandler = (request, response, next) => {
  const fetchSite = request.header('sec-fetch-site');
  if (request.header(UPLOAD_HEADER) !== '1' || (fetchSite && fetchSite !== 'same-origin')) {
    response.status(403).json({ error: 'Refresh the page and try again.' });
    return;
  }
  next();
};export function cleanFileName(name: string): string {
  return name.replace(/[\\/\0-\x1f]/g, '').slice(0, 180) || 'document';
}
export function readMultipart(
  request: Request,
  config: UploadConfig
): Promise<{ files: UploadedFile[]; fields: Record<string, string>; }> {
  return new Promise((resolve, reject) => {
    let parser: busboy.Busboy;
    try {
      parser = busboy({
        headers: request.headers,
        limits: {
          fileSize: config.maxUploadBytes,
          files: config.maxDocumentsPerJob,
          fields: config.maxDocumentsPerJob + 4,
          fieldSize: 1024,
        },
      });
    } catch {
      reject(new UploadError('Unable to read upload.'));
      return;
    }
    const files: UploadedFile[] = [];
    const fields: Record<string, string> = {};
    let failure: UploadError | undefined;
    const fail = (error: UploadError) => {
      failure ??= error;
    };

    parser.on('file', (name, stream, info) => {
      const fileField = /^document__file_(\d+)$/.exec(name);
      if (!fileField || failure) {
        if (!fileField) fail(new UploadError('Unexpected document field.'));
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('limit', () => fail(
        new UploadError(
          `File exceeds the ${Math.floor(config.maxUploadBytes / 1048576)} MB limit.`,
          413
        )
      )
      );
      stream.on('end', () => {
        if (!info.filename) return;
        const buffer = Buffer.concat(chunks);
        if (!buffer.length) return fail(new UploadError(`${info.filename} is an empty file.`));
        files.push({
          buffer,
          fileName: cleanFileName(info.filename),
          index: Number(fileField[1]),
        });
      });
    });
    parser.on('field', (name, value) => {
      fields[name] = value;
    });
    parser.on('filesLimit', () => fail(new UploadError(`Upload at most ${config.maxDocumentsPerJob} documents per job.`))
    );
    parser.on('fieldsLimit', () => fail(new UploadError('Too many form fields.')));
    parser.on('error', () => reject(new UploadError('Unable to read upload.')));
    parser.on('close', () => (failure ? reject(failure) : resolve({ files, fields })));
    request.pipe(parser);
  });
}
export async function readMultipartSubmission(
  request: Request,
  config: UploadConfig): Promise<JobSubmission> {
  if (!request.is('multipart/form-data'))
    throw new UploadError('Upload documents as multipart/form-data.', 415);
  const { files, fields } = await readMultipart(request, config);
  return {
    documents: files
      .sort((a, b) => a.index - b.index)
      .map((file) => ({
        ...file,
        copies: Number(fields[`document__copies_${file.index}`] ?? 1),
      })),
    title: fields['job__title'],
  };
}

