import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { insertJob, type PrintDatabase } from './database';

export interface NewJob {
  copies: number;
  originalName: string;
  printerId: number;
  submittedBy: null | string;
  title: string;
  uploaderIp: string;
}

/** Stores the PDF and queues it; the caller is responsible for notifying the agent. */
export async function enqueueJob(
  db: PrintDatabase,
  jobsDir: string,
  job: NewJob,
  pdf: Uint8Array,
): Promise<string> {
  const id = randomUUID();
  const filePath = join(jobsDir, `${id}.pdf`);
  try {
    await mkdir(jobsDir, { mode: 0o700, recursive: true });
    await writeFile(filePath, pdf, { flag: 'wx', mode: 0o600 });
    insertJob(db, {
      copies: job.copies,
      id,
      original_name: job.originalName,
      printer_id: job.printerId,
      submitted_by: job.submittedBy,
      title: job.title.slice(0, 120),
      uploader_ip: job.uploaderIp,
    });
  } catch (error) {
    await rm(filePath, { force: true });
    throw error;
  }
  return id;
}
