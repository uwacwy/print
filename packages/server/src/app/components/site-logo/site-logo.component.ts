import { NgOptimizedImage } from '@angular/common';
import { Component, inject } from '@angular/core';

import { CLIENT_ENVIRONMENT } from '../../auth/client-environment';

/** The deployment's logo from `GET /api/client-config`; renders nothing without one. */
@Component({
  host: {
    '[class.d-none]': '!logo',
    // Prerendered pages are built before the server knows its logo.
    ngSkipHydration: 'true',
  },
  imports: [NgOptimizedImage],
  selector: 'app-site-logo',
  styles: `
    :host {
      display: block;
      position: relative;
      flex: 0 0 100%;
      height: 4rem;
      width: 100%;
    }
    img {
      object-fit: contain;
      object-position: left center;
    }
  `,
  template: `
    @if (logo; as logo) {
      <img [ngSrc]="logo.src" [alt]="logo.alt" fill priority />
    }
  `,
})
export class SiteLogoComponent {
  protected readonly logo = inject(CLIENT_ENVIRONMENT).site.logo;
}
