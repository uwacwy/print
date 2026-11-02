import type { Request } from 'express';
import busboy from 'busboy';
import type { UploadConfig } from './server-config/server-config';
import { UploadError } from './errors';
import { cleanFileName } from './strings';

export interface UploadedFile {
  buffer: Buffer;
  fileName: string;
  index: number;
}

export interface JobSubmission {
  documents: (UploadedFile & { copies: number })[];
  title: string | undefined;
}

export function readMultipart(
  request: Request,
  config: UploadConfig,
): Promise<{
  files: UploadedFile[];
  fields: Record<string, string>;
}> {
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
        if (!fileField) {
          fail(new UploadError('Unexpected document field.'));
        }
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('limit', () =>
        fail(
          new UploadError(
            `File exceeds the ${Math.floor(config.maxUploadBytes / 1048576)} MB limit.`,
            413,
          ),
        ),
      );
      stream.on('end', () => {
        if (!info.filename) {
          return;
        }
        const buffer = Buffer.concat(chunks);
        if (!buffer.length) {
          return fail(
            new UploadError(`${info.filename} is an empty file.`),
          );
        }
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
    parser.on('filesLimit', () =>
      fail(
        new UploadError(
          `Upload at most ${config.maxDocumentsPerJob} documents per job.`,
        ),
      ),
    );
    parser.on('fieldsLimit', () =>
      fail(new UploadError('Too many form fields.')),
    );
    parser.on('error', () =>
      reject(new UploadError('Unable to read upload.')),
    );
    parser.on('close', () =>
      failure ? reject(failure) : resolve({ files, fields }),
    );
    request.pipe(parser);
  });
}

export async function readMultipartSubmission(
  request: Request,
  config: UploadConfig,
): Promise<JobSubmission> {
  if (!request.is('multipart/form-data')) {
    throw new UploadError(
      'Upload documents as multipart/form-data.',
      415,
    );
  }
  const { files, fields } = await readMultipart(request, config);
  return {
    documents: files
      .sort((a, b) => a.index - b.index)
      .map((file) => ({
        ...file,
        copies: Number(
          fields[`document__copies_${file.index}`] ?? 1,
        ),
      })),
    title: fields['job__title'],
  };
}
