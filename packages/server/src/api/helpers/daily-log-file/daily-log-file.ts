import {
  createWriteStream,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  type WriteStream,
} from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';

export interface DailyLogFileOptions {
  dir: string;
  /** Days of dated files to keep, counting today. */
  maxDays: number;
  now?: () => Date;
  /** Files are `<prefix>-YYYY-MM-DD.log`; `<prefix>.log` links to the current one. */
  prefix: string;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Local calendar date, so files roll over at the server's midnight. */
export const formatLogDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * Appends to a log file named for the current day and starts a new one when the date changes.
 * Opening a day's file also repoints the `<prefix>.log` symlink and deletes dated files that fall
 * outside `maxDays`, so rotation needs no timers and no dependencies.
 */
export class DailyLogFile extends Writable {
  private day: string | undefined;
  private readonly now: () => Date;
  private stream: undefined | WriteStream;

  constructor(private readonly options: DailyLogFileOptions) {
    super();
    this.now = options.now ?? (() => new Date());
    mkdirSync(options.dir, { recursive: true });
  }

  override _final(
    callback: (error?: Error | null) => void,
  ): void {
    const stream = this.stream;
    this.stream = undefined;
    if (stream) {
      stream.end(callback);
    } else {
      callback();
    }
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      this.current().write(chunk, callback);
    } catch (error) {
      callback(error as Error);
    }
  }

  private current(): WriteStream {
    const day = formatLogDate(this.now());
    if (this.stream && day === this.day) {
      return this.stream;
    }
    this.stream?.end();
    const file = `${this.options.prefix}-${day}.log`;
    const stream = createWriteStream(
      join(this.options.dir, file),
      {
        flags: 'a',
      },
    );
    // Disk errors must not crash the server; the stream reports them on the next write.
    stream.on('error', (error) => this.destroy(error));
    this.stream = stream;
    this.day = day;
    this.pointSymlinkAt(file);
    this.prune(day);
    return stream;
  }

  private pointSymlinkAt(file: string): void {
    const link = join(
      this.options.dir,
      `${this.options.prefix}.log`,
    );
    const temporary = `${link}.${process.pid}.tmp`;
    try {
      rmSync(temporary, { force: true });
      symlinkSync(file, temporary);
      renameSync(temporary, link);
    } catch {
      // The dated file is still written; only the convenience link is missing.
    }
  }

  private prune(today: string): void {
    const pattern = new RegExp(
      `^${this.options.prefix}-(\\d{4}-\\d{2}-\\d{2})\\.log$`,
    );
    const [year, month, date] = today.split('-').map(Number);
    const oldestKept = formatLogDate(
      new Date(
        year,
        month - 1,
        date - (this.options.maxDays - 1),
      ),
    );
    for (const name of readdirSync(this.options.dir)) {
      const logDate = pattern.exec(name)?.[1];
      if (logDate && logDate < oldestKept) {
        rmSync(join(this.options.dir, name), { force: true });
      }
    }
  }
}
