import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  Router,
  type Params,
} from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
  PrinterService,
  type PublicPrinter,
  type UploadAccess,
} from '../../services/printer/printer.service';
import { formatPinInput, PrintComponent } from './print.component';

const printerWith = (
  access: Partial<UploadAccess> = {},
): PublicPrinter => ({
  slug: 'front-office',
  name: 'Front Office',
  coverPage: false,
  access: {
    pinEnabled: true,
    token: 'valid',
    tokenExpiresAt: null,
    ...access,
  },
  upload: {
    maxDocuments: 2,
    maxCopies: 3,
    maxUploadBytes: 5 * 1048576,
  },
});

async function render(
  service: Partial<PrinterService>,
  query: Params = { token: 'jwt' },
) {
  const queryParams = new BehaviorSubject(convertToParamMap(query));
  const navigate = vi.fn(
    (_commands: unknown[], extras?: { queryParams?: Params }) => {
      queryParams.next(convertToParamMap(extras?.queryParams ?? {}));
      return Promise.resolve(true);
    },
  );
  await TestBed.configureTestingModule({
    imports: [PrintComponent],
    providers: [
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ slug: 'front-office' }),
          },
          queryParamMap: queryParams,
        },
      },
      { provide: Router, useValue: { navigate } },
      { provide: PrinterService, useValue: service },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PrintComponent);
  await fixture.whenStable();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    navigate,
  };
}

function chooseFile(
  element: HTMLElement,
  selector: string,
  file: File,
) {
  const input = element.querySelector(selector) as HTMLInputElement;
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  input.dispatchEvent(new Event('change'));
}

function typePin(element: HTMLElement, value: string) {
  const input = element.querySelector(
    '#printer-pin',
  ) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  return input;
}

describe('formatPinInput', () => {
  it('groups digits and drops everything else', () => {
    expect(formatPinInput('1234')).toBe('123-4');
    expect(formatPinInput('123 456-7890')).toBe('123-456-789');
    expect(formatPinInput('abc')).toBe('');
  });
});

describe('PrintComponent', () => {
  it('renders the upload form for a valid token without a PIN field', async () => {
    const getPrinter = vi.fn(() => of(printerWith()));
    const { element } = await render({ getPrinter });

    expect(getPrinter).toHaveBeenCalledWith('front-office', 'jwt');
    expect(element.querySelector('h1')?.textContent).toContain(
      'Print to Front Office',
    );
    expect(element.querySelector('#printer-pin')).toBeNull();
    expect(element.querySelectorAll('select option')).toHaveLength(
      3,
    );
  });

  it('submits documents as multipart with the bearer token and reports the result', async () => {
    const submitJob = vi.fn(() =>
      of({ jobId: 'id', title: 'Taxes', agentOnline: true }),
    );
    const { fixture, element } = await render({
      getPrinter: () => of(printerWith()),
      submitJob,
    });

    chooseFile(
      element,
      'input[type=file]',
      new File(['%PDF-1.7'], 'taxes.pdf'),
    );
    const copies = element.querySelector(
      'select',
    ) as HTMLSelectElement;
    copies.value = '2';
    copies.dispatchEvent(new Event('change'));
    (element.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    await fixture.whenStable();

    expect(submitJob).toHaveBeenCalledTimes(1);
    const [slug, body, token] = submitJob.mock
      .calls[0] as unknown as [string, FormData, string];
    expect(slug).toBe('front-office');
    expect(token).toBe('jwt');
    expect(body.has('job__passcode')).toBe(false);
    expect(body.get('document__copies_0')).toBe('2');
    expect((body.get('document__file_0') as File).name).toBe(
      'taxes.pdf',
    );
    expect(
      element.querySelector('[role=status]')?.textContent,
    ).toContain('sent to Front Office');
  });

  it('shows server errors', async () => {
    const { fixture, element } = await render({
      getPrinter: () => of(printerWith()),
      submitJob: () =>
        throwError(() => ({
          error: { error: 'Too many print jobs.' },
        })),
    });
    chooseFile(
      element,
      'input[type=file]',
      new File(['%PDF-1.7'], 'taxes.pdf'),
    );
    (element.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    await fixture.whenStable();

    expect(
      element.querySelector('[role=alert]')?.textContent,
    ).toContain('Too many print jobs');
  });

  it('asks for the PIN without a token, then navigates with the issued token', async () => {
    const getPrinter = vi.fn(
      (_slug: string, token?: string | null) =>
        of(printerWith({ token: token ? 'valid' : null })),
    );
    const exchangePin = vi.fn(() =>
      of({ token: 'short-jwt', expiresAt: '2030-01-01T00:00:00Z' }),
    );
    const { fixture, element, navigate } = await render(
      { getPrinter, exchangePin },
      {},
    );

    expect(element.querySelector('input[type=file]')).toBeNull();
    const input = typePin(element, '123456789');
    expect(input.value).toBe('123-456-789');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    (element.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    await fixture.whenStable();

    expect(exchangePin).toHaveBeenCalledWith(
      'front-office',
      '123-456-789',
    );
    expect(navigate).toHaveBeenCalledWith(
      ['/print', 'front-office'],
      {
        queryParams: { token: 'short-jwt' },
      },
    );
    expect(getPrinter).toHaveBeenLastCalledWith(
      'front-office',
      'short-jwt',
    );
    expect(element.querySelector('input[type=file]')).not.toBeNull();
  });

  it('validates the PIN locally and shows server rejections', async () => {
    const exchangePin = vi.fn(() =>
      throwError(() => ({
        error: {
          code: 'pin_incorrect',
          error: 'That PIN is not correct.',
        },
      })),
    );
    const { fixture, element } = await render(
      {
        getPrinter: () => of(printerWith({ token: null })),
        exchangePin,
      },
      {},
    );
    const form = element.querySelector('form') as HTMLFormElement;

    typePin(element, '1234');
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(exchangePin).not.toHaveBeenCalled();
    expect(
      element.querySelector('[role=alert]')?.textContent,
    ).toContain('9-digit PIN');

    typePin(element, '111222333');
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(
      element.querySelector('[role=alert]')?.textContent,
    ).toContain('not correct');
    expect(
      element
        .querySelector('#printer-pin')
        ?.getAttribute('aria-invalid'),
    ).toBe('true');
  });

  it('explains expired links and falls back to the PIN prompt', async () => {
    const { element } = await render({
      getPrinter: () => of(printerWith({ token: 'expired' })),
    });
    expect(
      element.querySelector('.alert-warning')?.textContent,
    ).toContain('expired');
    expect(element.querySelector('#printer-pin')).not.toBeNull();
  });

  it('only offers the QR hint when the printer has no PIN', async () => {
    const { element } = await render(
      {
        getPrinter: () =>
          of(printerWith({ pinEnabled: false, token: null })),
      },
      {},
    );
    expect(element.querySelector('form')).toBeNull();
    expect(element.textContent).toContain('Scan the QR code');
  });

  it('drops a token the server rejects during upload', async () => {
    const getPrinter = vi.fn(
      (_slug: string, token?: string | null) =>
        of(printerWith({ token: token ? 'valid' : null })),
    );
    const { fixture, element, navigate } = await render({
      getPrinter,
      submitJob: () =>
        throwError(() => ({
          error: {
            code: 'token_expired',
            error: 'This print link has expired.',
          },
        })),
    });
    chooseFile(
      element,
      'input[type=file]',
      new File(['%PDF-1.7'], 'taxes.pdf'),
    );
    (element.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith([
      '/print',
      'front-office',
    ]);
    expect(
      element.querySelector('.alert-warning')?.textContent,
    ).toContain('expired');
    expect(element.querySelector('#printer-pin')).not.toBeNull();
  });

  it('shows a not-found message for unknown printers', async () => {
    const { element } = await render({
      getPrinter: () => throwError(() => new Error('404')),
    });
    expect(element.querySelector('h1')?.textContent).toContain(
      'Printer not found',
    );
  });
});
