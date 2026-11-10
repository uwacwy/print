import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { createRouting } from 'ts-routes';

import { root } from '../../../shared/routes/routes';

/** Public server status from `GET /api/status`. */
export interface ServerStatus {
  /** Printers whose agent is currently connected. */
  printersOnline: number;
}

const $ = createRouting(root);

@Service()
export class StatusService {
  readonly #http = inject(HttpClient);

  getStatus() {
    return this.#http.get<ServerStatus>($.api.status());
  }
}
