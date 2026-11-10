import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type {
  IssuedQrToken,
  PrinterSummary,
} from '../../../../services/printer/printer.service';

import { QrIssuedComponent } from './qr-issued.component';

const printer = {
  id: 1,
  name: 'Front Office',
  slug: 'front-office',
} as PrinterSummary;
const issued: IssuedQrToken = {
  expiresAt: '2030-01-02T00:00:00.000Z',
  notBefore: '2030-01-01T00:00:00.000Z',
  path: '/print/front-office?token=qr.jwt.value',
  token: 'qr.jwt.value',
  url: 'http://localhost:4200/print/front-office?token=qr.jwt.value',
};

describe('QrIssuedComponent', () => {
  const create = (inputs: Record<string, unknown> = {}) => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(QrIssuedComponent);
    fixture.componentRef.setInput('printer', printer);
    fixture.componentRef.setInput('issued', issued);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture;
  };

  it('links to the print page with the token in a new tab', () => {
    const link: HTMLAnchorElement =
      create().nativeElement.querySelector('a.print-link');
    expect(link.getAttribute('href')).toBe(
      '/print/front-office?token=qr.jwt.value',
    );
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('shows the QR image only once drawn', () => {
    expect(
      create().nativeElement.querySelector('img'),
    ).toBeNull();
  });

  it('shows the image and emits poster and link actions', () => {
    const fixture = create({
      qrImage: 'data:image/png;base64,AAA',
    });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('img.qr-image')).not.toBeNull();
    const calls: string[] = [];
    const c = fixture.componentInstance;
    c.copyLink.subscribe(() => calls.push('copy'));
    c.openPoster.subscribe(() => calls.push('open'));
    c.printPoster.subscribe(() => calls.push('print'));
    el.querySelectorAll('button').forEach((b) => b.click());
    expect(calls.sort()).toEqual(['copy', 'open', 'print']);
  });
});
