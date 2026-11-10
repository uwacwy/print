import type { SetupCommand } from '@uwacwy/print-shared';

import { Component, input, signal } from '@angular/core';

let nextId = 0;

/** Copyable shell commands and snippets, one per `SetupCommand`. */
@Component({
  selector: 'app-setup-commands',
  styles: `
    .setup-command {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `,
  template: `
    <ul class="list-unstyled d-flex flex-column gap-3 mb-0">
      @for (item of commands(); track item.id) {
        <li>
          <p class="fw-semibold mb-1" [id]="prefix + item.id">
            {{ item.label }}
          </p>
          <pre
            class="setup-command bg-body-tertiary border rounded p-2 mb-2"
            [attr.aria-labelledby]="prefix + item.id"
          ><code>{{ item.command }}</code></pre>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            [attr.aria-describedby]="prefix + item.id"
            (click)="copy(item)"
          >
            {{ copied() === item.id ? 'Copied' : 'Copy' }}
          </button>
        </li>
      }
    </ul>
    <span class="visually-hidden" role="status">{{
      announcement()
    }}</span>
  `,
})
export class SetupCommandsComponent {
  readonly commands = input.required<readonly SetupCommand[]>();
  protected readonly announcement = signal('');
  protected readonly copied = signal<null | string>(null);
  protected readonly prefix = `setup-command-${nextId++}-`;

  protected copy(item: SetupCommand): void {
    // `navigator.clipboard` is undefined outside secure contexts.
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(item.command))
      .then(() => {
        this.copied.set(item.id);
        this.announcement.set(`Copied: ${item.label}`);
      })
      .catch(() => {
        this.copied.set(null);
        this.announcement.set(
          'Could not copy. Select the text and copy it instead.',
        );
      });
  }
}
