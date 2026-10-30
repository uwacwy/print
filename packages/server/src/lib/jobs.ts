import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  insertJob,
  type PrintDatabase,
} from './database/database.js';

export interface NewJob {
  printerId: number;
  title: string;
  copies: number;
  originalName: string;
  submittedBy: string | null;
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
    await mkdir(jobsDir, { recursive: true, mode: 0o700 });
    await writeFile(filePath, pdf, { flag: 'wx', mode: 0o600 });
    insertJob(db, {
      id,
      printer_id: job.printerId,
      title: job.title.slice(0, 120),
      copies: job.copies,
      original_name: job.originalName,
      submitted_by: job.submittedBy,
      uploader_ip: job.uploaderIp,
    });
  } catch (error) {
    await rm(filePath, { force: true });
    throw error;
  }
  return id;
}
