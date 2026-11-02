import { firstValueFrom, from, Subject, take, toArray } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { PrintRequest } from '../../types';
import { printInOrder } from './print-queue';

const job = (id: string) => ({ id, title: `Job ${id}` });
const request = (id: string): PrintRequest => ({
  job: job(id),
  pdf: Buffer.from(id),
});

describe('printInOrder', () => {
  it('prints one at a time and reports each result in order, including failures', async () => {
    let active = 0;
    const print = vi.fn(async (pdf: Buffer) => {
      expect(++active).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (pdf.toString() === 'b') {
        throw new Error('jammed');
      }
    });
    const jobs$ = new Subject<PrintRequest>();
    const results = firstValueFrom(
      printInOrder(jobs$, print).pipe(take(3), toArray()),
    );
    ['a', 'b', 'c'].forEach((id) => jobs$.next(request(id)));

    expect(await results).toEqual([
      { job: job('a'), status: 'printed' },
      { job: job('b'), status: 'failed', error: 'jammed' },
      { job: job('c'), status: 'printed' },
    ]);
    expect(print).toHaveBeenCalledTimes(3);
  });

  it('reports non-Error rejections generically', async () => {
    const results$ = printInOrder(from([request('a')]), () =>
      Promise.reject('nope'),
    );
    expect(await firstValueFrom(results$)).toEqual({
      job: job('a'),
      status: 'failed',
      error: 'Unknown print error',
    });
  });

  it('finishes the current job, drops waiting ones, and completes when jobs$ completes', async () => {
    const print = vi.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 5)),
    );
    const jobs$ = new Subject<PrintRequest>();
    const results = firstValueFrom(
      printInOrder(jobs$, print).pipe(toArray()),
    );
    jobs$.next(request('a'));
    jobs$.next(request('b'));
    jobs$.complete();

    expect(await results).toEqual([
      { job: job('a'), status: 'printed' },
    ]);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('subscribes to jobs$ once for every results$ subscriber', async () => {
    const jobs$ = new Subject<PrintRequest>();
    const print = vi.fn(() => Promise.resolve());
    const results$ = printInOrder(jobs$, print);
    const first = firstValueFrom(results$);
    const second = firstValueFrom(results$);
    jobs$.next(request('a'));

    expect(await first).toEqual(await second);
    expect(print).toHaveBeenCalledTimes(1);
  });
});
