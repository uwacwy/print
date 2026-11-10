import { Component, output } from '@angular/core';

/** Asks the admin to confirm deleting the printer. */
@Component({
  selector: 'app-delete-confirmation',
  template: `
    <div class="alert alert-warning mt-4" role="alert">
      <p i18n="@@delete-confirmation.delete-this-printer-and">
        Delete this printer and its queued jobs?
      </p>
      <button
        i18n="@@delete-confirmation.confirm-delete"
        class="btn btn-danger btn-sm me-2"
        type="button"
        (click)="confirmed.emit()"
      >
        Confirm delete
      </button>
      <button
        i18n="@@delete-confirmation.cancel"
        class="btn btn-outline-secondary btn-sm"
        type="button"
        (click)="cancelled.emit()"
      >
        Cancel
      </button>
    </div>
  `,
})
export class DeleteConfirmationComponent {
  readonly cancelled = output();
  readonly confirmed = output();
}
