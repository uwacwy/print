import { Component, input, output } from '@angular/core';

/** Revokes every QR code and PIN link issued for a printer. */
@Component({
  selector: 'app-revoke-section',
  template: `
    <section aria-labelledby="revoke-heading">
      <h2 class="h4" id="revoke-heading">Revoke access</h2>
      <p class="text-muted">
        Stops every QR code and PIN link issued so far for
        {{ printerName() }}, including printed posters. The PIN itself
        keeps working.
      </p>
      <button
        type="button"
        class="btn btn-danger"
        [disabled]="busy()"
        (click)="revoke.emit()"
      >
        <i class="bi bi-x-octagon" aria-hidden="true"></i> Revoke all QR
        codes
      </button>
    </section>
  `,
})
export class RevokeSectionComponent {
  readonly printerName = input.required<string>();
  readonly busy = input(false);
  readonly revoke = output();
}
