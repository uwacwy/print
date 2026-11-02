import type { Observable } from 'rxjs';
import { CupsPrinter } from '../../printer/cups-printer/cups-printer';
import { IppPrinter } from '../../printer/ipp-printer/ipp-printer';
import type { PrintRequest, IPrinter, PrinterConstructor } from '../../types';


/** Picks the driver from the connection string's scheme. */

export function createPrinter(
  conn: string | URL,
  jobs$: Observable<PrintRequest>
): IPrinter {
  const Driver: PrinterConstructor = String(conn).startsWith(
    'cups://'
  )
    ? CupsPrinter
    : IppPrinter;
  return new Driver(conn, jobs$);
}
