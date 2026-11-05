import {
  catchError,
  concatMap,
  defer,
  EMPTY,
  map,
  type Observable,
  of,
  share,
  tap,
} from 'rxjs';
import type {
  PrintFn,
  PrintRequest,
  PrintResult,
} from '../../types';
import { errorMessage } from '../text/text';
import { log } from '../logging';

/**
 * Prints requests one at a time and emits one result per request, in order.
 *
 * Completing `jobs$` stops the queue: the request printing finishes and reports, requests
 * still waiting are dropped, and the results complete.
 */
export function printInOrder(
  jobs$: Observable<PrintRequest>,
  print: PrintFn,
): Observable<PrintResult> {
  return defer(() => {
    let stopped = false;
    return jobs$.pipe(
      tap(({ job }) =>
        log(`[job:${job.id}] Printing: ${job.title}`),
      ),
      tap({ complete: () => (stopped = true) }),
      concatMap(({ job, pdf }) =>
        defer(() => (stopped ? EMPTY : print(pdf, job))).pipe(
          map((): PrintResult => ({ job, status: 'printed' })),
          tap({
            next: () =>
              log(`[job:${job.id}] Printed: '${job.title}'`),
            error: (e) =>
              log(
                `[job:${job.id}] Error: ${errorMessage(e, 'Print error')}`,
              ),
          }),
          catchError((error: unknown) =>
            of<PrintResult>({
              job,
              status: 'failed',
              error: errorMessage(error, 'Unknown print error'),
            }),
          ),
        ),
      ),
    );
  }).pipe(share());
}
