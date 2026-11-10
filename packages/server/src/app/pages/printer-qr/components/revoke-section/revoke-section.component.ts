import { Component, input, output } from '@angular/core';

/** Revokes every QR code and PIN link issued for a printer. */
@Component({
  selector: 'app-revoke-section',
  template: `
    <section aria-labelledby="revoke-heading">
      <h2
        i18n="@@revoke-section.revoke-access"
        class="h4"
        id="revoke-heading"
      >
        Revoke access
      </h2>
      <p
        i18n="@@revoke-section.stops-every-qr-code"
        class="text-muted"
      >
        Stops every QR code and PIN link issued so far for
        {{ printerName() }}, including printed posters. The PIN
        itself keeps working.
      </p>
      <button
        i18n="@@revoke-section.revoke-all-qr-codes"
        type="button"
        class="btn btn-danger"
        [disabled]="busy()"
        (click)="revoke.emit()"
      >
        <i class="bi bi-x-octagon" aria-hidden="true"></i> Revoke
        all QR codes
      </button>
    </section>
  `,
})
export class RevokeSectionComponent {
  readonly busy = input(false);
  readonly printerName = input.required<string>();
  readonly revoke = output();
}
