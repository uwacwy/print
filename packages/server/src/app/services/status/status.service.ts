import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { $ } from '@uwacwy/print-shared';

/** Public server status from `GET /api/status`. */
export interface ServerStatus {
  /** Printers whose agent is currently connected. */
  printersOnline: number;
}

@Service()
export class StatusService {
  readonly #http = inject(HttpClient);

  getStatus() {
    return this.#http.get<ServerStatus>($.api.status());
  }
}
