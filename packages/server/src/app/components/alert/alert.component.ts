import { Component, input, output } from '@angular/core';

/** A Bootstrap alert with projected content and an optional dismiss button. */
@Component({
  selector: 'app-alert',
  template: `
    <div
      class="alert d-flex justify-content-between gap-2"
      [class]="'alert-' + variant()"
      [attr.role]="role()"
    >
      <span><ng-content /></span>
      @if (dismissLabel()) {
        <button
          type="button"
          class="btn-close"
          [attr.aria-label]="dismissLabel()"
          (click)="dismissed.emit()"
        ></button>
      }
    </div>
  `,
})
export class AlertComponent {
  readonly dismissed = output();
  /** The dismiss button's accessible name; no button without it. */
  readonly dismissLabel = input('');
  /** Pass `null` when a surrounding live region already announces the alert. */
  readonly role = input<null | string>('alert');
  readonly variant = input<'danger' | 'success' | 'warning'>(
    'danger',
  );
}
