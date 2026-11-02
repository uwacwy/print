import { spawn } from 'node:child_process';
import { log } from './logging';

const GHOSTSCRIPT_TIMEOUT_MS = 120_000;

class GhostscriptMissingError extends Error {}

/** Runs `gs` with `pdf` on stdin and returns stdout, capped at `maximumBytes`. */
function ghostscript(
  args: readonly string[],
  pdf: Buffer,
  maximumBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'gs',
      [
        '-q',
        '-dSAFER',
        '-dBATCH',
        '-dNOPAUSE',
        ...args,
        '-sOutputFile=-',
        '-',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let stderr = '';
    let outputTooLarge = false;
    let timedOut = false;
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maximumBytes) {
        outputTooLarge = true;
        child.kill('SIGKILL');
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, GHOSTSCRIPT_TIMEOUT_MS);
    child.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      reject(
        error.code === 'ENOENT'
          ? new GhostscriptMissingError(
              'Ghostscript (gs) is not installed on the agent.',
            )
          : error,
      );
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (outputTooLarge) {
        return reject(
          new Error(
            'Converted document exceeds maxBytes; raise ?maxBytes= on PRINTER_URI.',
          ),
        );
      }
      if (timedOut) {
        return reject(
          new Error('Ghostscript PDF conversion timed out.'),
        );
      }
      if (code === 0) {
        return resolve(Buffer.concat(chunks, outputBytes));
      }
      reject(
        new Error(
          `Ghostscript exited ${code ?? signal}: ${stderr.trim() || 'PDF conversion failed'}`,
        ),
      );
    });
    child.stdin.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') {
        reject(error);
      }
    });
    child.stdin.end(pdf);
  });
}

export function convertPdfToPclm(
  pdf: Buffer,
  maximumBytes: number,
): Promise<Buffer> {
  return ghostscript(
    ['-sDEVICE=pclm', '-r150'],
    pdf,
    maximumBytes,
  ).catch((error: unknown) => {
    throw error instanceof GhostscriptMissingError
      ? new Error(
          'This printer requires PCLm, but Ghostscript is not installed on the agent.',
        )
      : error;
  });
}

/**
 * Rewrites a PDF with every image downsampled to at most `dpi` (monochrome images to `2 × dpi`),
 * so the CUPS filters and the printer rasterize far less data. Returns the PDF untouched when
 * Ghostscript is not installed.
 */
export function simplifyPdf(
  pdf: Buffer,
  { dpi, maximumBytes }: { dpi: number; maximumBytes: number },
): Promise<Buffer> {
  log(`Simplifying PDF to ${dpi} dpi`);
  const downsample = (
    kind: string,
    resolution: number,
    type: string,
  ) => [
    `-dDownsample${kind}Images=true`,
    `-d${kind}ImageDownsampleType=/${type}`,
    `-d${kind}ImageResolution=${resolution}`,
    `-d${kind}ImageDownsampleThreshold=1.0`,
  ];
  return ghostscript(
    [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.5',
      '-dAutoRotatePages=/None',
      '-dDetectDuplicateImages=true',
      ...downsample('Color', dpi, 'Bicubic'),
      ...downsample('Gray', dpi, 'Bicubic'),
      ...downsample('Mono', dpi * 2, 'Subsample'),
    ],
    pdf,
    maximumBytes,
  ).catch((error: unknown) => {
    if (error instanceof GhostscriptMissingError) {
      return pdf;
    }
    throw error;
  });
}
