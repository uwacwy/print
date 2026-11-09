import { NgOptimizedImage } from '@angular/common';
import { Component, inject } from '@angular/core';
import { CLIENT_ENVIRONMENT } from '../../auth/client-environment';

/** The deployment's logo from `GET /api/client-config`; renders nothing without one. */
@Component({
  selector: 'app-site-logo',
  imports: [NgOptimizedImage],
  host: {
    // Prerendered pages are built before the server knows its logo.
    ngSkipHydration: 'true',
    '[class.d-none]': '!logo',
  },
  styles: `
    :host {
      display: block;
      position: relative;
      flex: none;
      height: 4rem;
      width: min(12rem, 40vw);
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
  protected readonly logo = inject(CLIENT_ENVIRONMENT).logo;
}
