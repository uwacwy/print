import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PRINTER_SLUG_PATTERN } from '@uwacwy/print-shared';
import Database from 'better-sqlite3';

export interface PrinterRow {
  id: number;
  slug: string;
  name: string;
  queue: string;
  token_hash: string;
  token_created_at: string;
  last_seen_at: string | null;
  cover_page: number;
  /** Nine-digit upload PIN, stored plainly so admins can post it; null disables PIN uploads. */
  pin: string | null;
  /** Bumped to revoke every outstanding upload token for the printer. */
  qr_epoch: number;
}

export interface JobRow {
  id: string;
  printer_id: number;
  title: string;
  copies: number;
  original_name: string;
  status: 'queued' | 'printing' | 'printed' | 'failed' | 'expired';
  error: string | null;
  submitted_by: string | null;
  created_at: string;
  sent_at: string | null;
  finished_at: string | null;
  uploader_ip: string;
}

export type PrintDatabase = Database.Database;

export function openDatabase(dataDir: string): {
  db: PrintDatabase;
  jobsDir: string;
} {
  const jobsDir = join(dataDir, 'jobs');
  mkdirSync(jobsDir, { recursive: true, mode: 0o700 });
  const db = new Database(join(dataDir, 'print.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(`
		CREATE TABLE IF NOT EXISTS printers (
			id INTEGER PRIMARY KEY,
			slug TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			queue TEXT NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			token_created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
			last_seen_at TEXT,
			cover_page INTEGER NOT NULL DEFAULT 0
		);
		CREATE TABLE IF NOT EXISTS jobs (
			id TEXT PRIMARY KEY,
			printer_id INTEGER NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
			title TEXT NOT NULL,
			copies INTEGER NOT NULL CHECK(copies BETWEEN 1 AND 5),
			original_name TEXT NOT NULL,
			status TEXT NOT NULL CHECK(status IN ('queued','printing','printed','failed','expired')),
			error TEXT,
			submitted_by TEXT,
			created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
			sent_at TEXT,
			finished_at TEXT,
			uploader_ip TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS jobs_printer_status ON jobs(printer_id, status, created_at);
		CREATE INDEX IF NOT EXISTS jobs_created ON jobs(created_at);
	`);
  // Databases created before cover pages existed lack this column.
  const printerColumns = db
    .prepare('PRAGMA table_info(printers)')
    .all() as {
    name: string;
  }[];
  const migrations: [column: string, ddl: string][] = [
    [
      'cover_page',
      'ALTER TABLE printers ADD COLUMN cover_page INTEGER NOT NULL DEFAULT 0',
    ],
    ['pin', 'ALTER TABLE printers ADD COLUMN pin TEXT'],
    [
      'qr_epoch',
      'ALTER TABLE printers ADD COLUMN qr_epoch INTEGER NOT NULL DEFAULT 0',
    ],
  ];
  for (const [column, ddl] of migrations) {
    if (!printerColumns.some(({ name }) => name === column)) {
      db.exec(ddl);
    }
  }
  return { db, jobsDir };
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function getPrinterBySlug(
  db: PrintDatabase,
  slug: string,
): PrinterRow | undefined {
  return db
    .prepare('SELECT * FROM printers WHERE slug = ?')
    .get(slug) as PrinterRow | undefined;
}

export function getPrinterByToken(
  db: PrintDatabase,
  token: string,
): PrinterRow | undefined {
  return db
    .prepare('SELECT * FROM printers WHERE token_hash = ?')
    .get(tokenHash(token)) as PrinterRow | undefined;
}

export function listPrinters(db: PrintDatabase): PrinterRow[] {
  return db
    .prepare('SELECT * FROM printers ORDER BY slug')
    .all() as PrinterRow[];
}

export function getPrinterById(
  db: PrintDatabase,
  id: number,
): PrinterRow | undefined {
  return db
    .prepare('SELECT * FROM printers WHERE id = ?')
    .get(id) as PrinterRow | undefined;
}

export type PrinterFields = Pick<
  PrinterRow,
  'slug' | 'name' | 'queue'
> & {
  cover_page: boolean;
};

// Form and JSON bodies only carry scalars; anything else is treated as missing.
const fieldText = (value: unknown): string =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean'
    ? String(value)
    : '';

export function validatePrinterFields(
  input: Partial<Record<keyof PrinterFields, unknown>>,
): PrinterFields | string {
  const slug = fieldText(input.slug)
    .trim()
    .toLowerCase();
  const name = fieldText(input.name).trim();
  const queue = fieldText(input.queue).trim();
  // HTML checkboxes submit "on" when ticked and nothing otherwise.
  const cover_page = ['on', 'true', '1'].includes(
    fieldText(input.cover_page),
  );
  if (!PRINTER_SLUG_PATTERN.test(slug)) {
    return 'Slug must be lowercase letters, numbers, and hyphens (max 63).';
  }
  if (!name || name.length > 100) {
    return 'Name is required (max 100 characters).';
  }
  let printerUri: URL;
  try {
    printerUri = new URL(queue);
  } catch {
    return 'Printer URI must be a valid cups://, ipp://, ipps://, http://, or https:// URL.';
  }
  if (printerUri.protocol === 'cups:') {
    if (
      !/^[A-Za-z0-9_.-]{1,128}$/.test(printerUri.hostname) ||
      printerUri.pathname ||
      printerUri.port ||
      printerUri.search ||
      printerUri.hash ||
      printerUri.username ||
      printerUri.password
    ) {
      return 'CUPS destination must be cups://<queue_name>.';
    }
    return { slug, name, queue, cover_page };
  }
  if (
    !['ipp:', 'ipps:', 'http:', 'https:'].includes(
      printerUri.protocol,
    ) ||
    !printerUri.hostname ||
    printerUri.username ||
    printerUri.password ||
    !printerUri.pathname ||
    printerUri.pathname === '/'
  ) {
    return 'Printer URI must use ipp://, ipps://, http://, or https:// and include a printer endpoint.';
  }
  return { slug, name, queue, cover_page };
}

export function printerFields(printer: PrinterRow): PrinterFields {
  return {
    slug: printer.slug,
    name: printer.name,
    queue: printer.queue,
    cover_page: printer.cover_page === 1,
  };
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function isSlugConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

/** Returns the agent token, which is only stored hashed; or an error message for a duplicate slug. */
export function createPrinter(
  db: PrintDatabase,
  fields: PrinterFields,
): { token: string; id: number } | string {
  const token = newToken();
  try {
    const result = db
      .prepare(
        'INSERT INTO printers (slug, name, queue, cover_page, token_hash) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        fields.slug,
        fields.name,
        fields.queue,
        fields.cover_page ? 1 : 0,
        tokenHash(token),
      );
    return { token, id: Number(result.lastInsertRowid) };
  } catch (error) {
    if (isSlugConflict(error)) {
      return `A printer with slug "${fields.slug}" already exists.`;
    }
    throw error;
  }
}

export function updatePrinter(
  db: PrintDatabase,
  id: number,
  fields: PrinterFields,
): boolean | string {
  try {
    return (
      db
        .prepare(
          'UPDATE printers SET slug = ?, name = ?, queue = ?, cover_page = ? WHERE id = ?',
        )
        .run(
          fields.slug,
          fields.name,
          fields.queue,
          fields.cover_page ? 1 : 0,
          id,
        ).changes === 1
    );
  } catch (error) {
    if (isSlugConflict(error)) {
      return `A printer with slug "${fields.slug}" already exists.`;
    }
    throw error;
  }
}

export function rotatePrinterToken(
  db: PrintDatabase,
  id: number,
): string | undefined {
  const token = newToken();
  const result = db
    .prepare(
      "UPDATE printers SET token_hash = ?, token_created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    )
    .run(tokenHash(token), id);
  return result.changes === 1 ? token : undefined;
}

/** Sets (or with null, clears) the upload PIN; returns false for an unknown printer. */
export function setPrinterPin(
  db: PrintDatabase,
  id: number,
  pin: string | null,
): boolean {
  return (
    db
      .prepare('UPDATE printers SET pin = ? WHERE id = ?')
      .run(pin, id).changes === 1
  );
}

/** Revokes every outstanding upload token for the printer; returns the new epoch. */
export function bumpQrEpoch(
  db: PrintDatabase,
  id: number,
): number | undefined {
  const row = db
    .prepare(
      'UPDATE printers SET qr_epoch = qr_epoch + 1 WHERE id = ? RETURNING qr_epoch',
    )
    .get(id) as { qr_epoch: number } | undefined;
  return row?.qr_epoch;
}

/** Deletes the printer and its jobs; returns job ids so their files can be removed. */
export function deletePrinter(
  db: PrintDatabase,
  id: number,
): string[] | undefined {
  return db.transaction(() => {
    const jobIds = (
      db
        .prepare('SELECT id FROM jobs WHERE printer_id = ?')
        .all(id) as {
        id: string;
      }[]
    ).map((row) => row.id);
    return db.prepare('DELETE FROM printers WHERE id = ?').run(id)
      .changes === 1
      ? jobIds
      : undefined;
  })();
}

/** Removes every job for a printer (any status) and returns their ids so PDFs can be deleted. */
export function deletePrinterJobs(
  db: PrintDatabase,
  printerId: number,
): string[] {
  return db.transaction(() => {
    const jobIds = (
      db
        .prepare('SELECT id FROM jobs WHERE printer_id = ?')
        .all(printerId) as {
        id: string;
      }[]
    ).map((row) => row.id);
    db.prepare('DELETE FROM jobs WHERE printer_id = ?').run(
      printerId,
    );
    return jobIds;
  })();
}

export function countActiveJobs(
  db: PrintDatabase,
): Map<number, number> {
  const rows = db
    .prepare(
      "SELECT printer_id, COUNT(*) AS count FROM jobs WHERE status IN ('queued','printing') GROUP BY printer_id",
    )
    .all() as { printer_id: number; count: number }[];
  return new Map(rows.map((row) => [row.printer_id, row.count]));
}

export function countFailedJobs(
  db: PrintDatabase,
): Map<number, number> {
  const rows = db
    .prepare(
      "SELECT printer_id, COUNT(*) AS count FROM jobs WHERE status = 'failed' GROUP BY printer_id",
    )
    .all() as { printer_id: number; count: number }[];
  return new Map(rows.map((row) => [row.printer_id, row.count]));
}

export function getFailedJobIds(
  db: PrintDatabase,
  printerId: number,
): string[] {
  return (
    db
      .prepare(
        "SELECT id FROM jobs WHERE printer_id = ? AND status = 'failed' ORDER BY created_at",
      )
      .all(printerId) as { id: string }[]
  ).map(({ id }) => id);
}

/** Puts failed jobs back in the queue; returns the ids that were requeued. */
export function requeueFailedJobs(
  db: PrintDatabase,
  printerId: number,
  jobIds: readonly string[],
): string[] {
  const requeue = db.prepare(
    "UPDATE jobs SET status = 'queued', error = NULL, sent_at = NULL, finished_at = NULL WHERE id = ? AND printer_id = ? AND status = 'failed'",
  );
  return db.transaction(() =>
    jobIds.filter((id) => requeue.run(id, printerId).changes === 1),
  )();
}

/** Failed jobs whose document is gone can't be retried; they become expired, keeping their error. */
export function expireFailedJobs(
  db: PrintDatabase,
  printerId: number,
  jobIds: readonly string[],
): void {
  const expire = db.prepare(
    "UPDATE jobs SET status = 'expired' WHERE id = ? AND printer_id = ? AND status = 'failed'",
  );
  db.transaction(() =>
    jobIds.forEach((id) => expire.run(id, printerId)),
  )();
}

export function insertJob(
  db: PrintDatabase,
  job: Pick<
    JobRow,
    | 'id'
    | 'printer_id'
    | 'title'
    | 'copies'
    | 'original_name'
    | 'submitted_by'
    | 'uploader_ip'
  >,
): void {
  db.prepare(
    `
		INSERT INTO jobs (id, printer_id, title, copies, original_name, status, submitted_by, uploader_ip)
		VALUES (@id, @printer_id, @title, @copies, @original_name, 'queued', @submitted_by, @uploader_ip)
	`,
  ).run(job);
}

export function getQueuedJobs(
  db: PrintDatabase,
  printerId: number,
): JobRow[] {
  return db
    .prepare(
      "SELECT * FROM jobs WHERE printer_id = ? AND status = 'queued' ORDER BY created_at, id",
    )
    .all(printerId) as JobRow[];
}

export function markJobsPrinting(
  db: PrintDatabase,
  printerId: number,
  jobs: JobRow[],
): JobRow[] {
  const mark = db.prepare(
    "UPDATE jobs SET status = 'printing', sent_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND printer_id = ? AND status = 'queued'",
  );
  return db.transaction(() =>
    jobs.filter((job) => mark.run(job.id, printerId).changes === 1),
  )();
}

export function resetPrintingJobs(
  db: PrintDatabase,
  printerId: number,
): void {
  db.prepare(
    "UPDATE jobs SET status = 'queued', sent_at = NULL WHERE printer_id = ? AND status = 'printing'",
  ).run(printerId);
}

export function reportJob(
  db: PrintDatabase,
  printerId: number,
  jobId: string,
  status: 'printed' | 'failed',
  error?: string,
): boolean {
  const result = db
    .prepare(
      `
		UPDATE jobs SET status = ?, error = ?, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		WHERE id = ? AND printer_id = ? AND status = 'printing'
	`,
    )
    .run(status, error ?? null, jobId, printerId);
  return result.changes === 1;
}

export function getJobForPrinter(
  db: PrintDatabase,
  printerId: number,
  jobId: string,
): JobRow | undefined {
  return db
    .prepare('SELECT * FROM jobs WHERE id = ? AND printer_id = ?')
    .get(jobId, printerId) as JobRow | undefined;
}

export function markPrinterSeen(
  db: PrintDatabase,
  printerId: number,
): void {
  db.prepare(
    "UPDATE printers SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  ).run(printerId);
}

export function purgeFinishedJobs(
  db: PrintDatabase,
  cutoff: string,
): string[] {
  const rows = db
    .prepare(
      "SELECT id FROM jobs WHERE status IN ('printed','failed','expired') AND finished_at < ?",
    )
    .all(cutoff) as { id: string }[];
  db.prepare(
    "DELETE FROM jobs WHERE status IN ('printed','failed','expired') AND finished_at < ?",
  ).run(cutoff);
  return rows.map(({ id }) => id);
}

export function removeOrphanedJobFiles(
  db: PrintDatabase,
  jobIds: string[],
): void {
  if (!jobIds.length) {
    return;
  }
  const remove = db.prepare('DELETE FROM jobs WHERE id = ?');
  db.transaction(() => jobIds.forEach((id) => remove.run(id)))();
}

export function expireStaleJobs(
  db: PrintDatabase,
  cutoff: string,
): string[] {
  const rows = db
    .prepare(
      "SELECT id FROM jobs WHERE status IN ('queued','printing','failed','expired') AND created_at < ?",
    )
    .all(cutoff) as { id: string }[];
  // A failed job keeps its PDF for retries until now; expiring it keeps the failure's error.
  const expire = db.prepare(
    "UPDATE jobs SET status = 'expired', error = CASE WHEN status = 'failed' THEN error ELSE 'Job expired before printing' END, finished_at = CASE WHEN status = 'failed' THEN finished_at ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END WHERE id = ? AND status IN ('queued','printing','failed')",
  );
  db.transaction(() => rows.forEach(({ id }) => expire.run(id)))();
  return rows.map(({ id }) => id);
}
