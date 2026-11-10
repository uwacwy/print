import type { Observable } from 'rxjs';

import type {
  IPrinter,
  PrinterConstructor,
  PrintRequest,
} from '../../types';

import { CupsPrinter } from '../../printer/cups-printer/cups-printer';
import { IppPrinter } from '../../printer/ipp-printer/ipp-printer';

/** Picks the driver from the connection string's scheme. */

export function createPrinter(
  conn: string | URL,
  jobs$: Observable<PrintRequest>,
): IPrinter {
  const Driver: PrinterConstructor = String(conn).startsWith(
    'cups://',
  )
    ? CupsPrinter
    : IppPrinter;
  return new Driver(conn, jobs$);
}
