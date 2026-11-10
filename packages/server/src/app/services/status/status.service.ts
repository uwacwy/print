import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import {
  $,
  parseWith,
  ServerStatus,
} from '@uwacwy/print-shared';
import { map } from 'rxjs';

@Service()
export class StatusService {
  readonly #http = inject(HttpClient);

  getStatus() {
    return this.#http
      .get<unknown>($.api.status())
      .pipe(map(parseWith(ServerStatus)));
  }
}
