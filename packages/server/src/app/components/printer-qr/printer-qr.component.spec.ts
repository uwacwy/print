import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PrinterService,
  type IssuedQrToken,
  type PrinterSummary,
} from '../../services/printer/printer.service';
import {
  PrinterQrComponent,
  toLocalInput,
  untilPresets,
} from './printer-qr.component';

const frontOffice: PrinterSummary = {
  id: 1,
  slug: 'front-office',
  name: 'Front Office',
  queue: 'cups://Front_Office',
  coverPage: true,
  lastSeenAt: null,
  activeJobs: 0,
  failedJobs: 0,
  online: true,
  pin: null,
  qrEpoch: 0,
};

const issued: IssuedQrToken = {
  token: 'qr.jwt.value',
  path: '/print/front-office?token=qr.jwt.value',
  url: 'http://localhost:4200/print/front-office?token=qr.jwt.value',
  notBefore: '2030-01-01T00:00:00.000Z',
  expiresAt: '2030-01-02T00:00:00.000Z',
};

async function setup(
  api: Partial<Record<keyof PrinterService, unknown>> = {},
) {
  const issueQrToken = vi.fn(() => of(issued));
  await TestBed.configureTestingModule({
    imports: [PrinterQrComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ slug: 'front-office' }),
          },
        },
      },
      {
        provide: PrinterService,
        useValue: {
          getAdminPrinter: () => of({ ...frontOffice }),
          issueQrToken,
          ...api,
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PrinterQrComponent);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    [...element.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(label),
    )!;
  const generate = async () => {
    (element.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };
  return { fixture, element, button, generate, issueQrToken };
}

describe('toLocalInput', () => {
  it('formats local wall-clock time for datetime-local inputs', () => {
    expect(toLocalInput(new Date(2030, 0, 2, 3, 4, 59))).toBe(
      '2030-01-02T03:04',
    );
  });
});

describe('untilPresets', () => {
  it('starts at the next whole local hour and marks hours on later days', () => {
    const presets = untilPresets(new Date(2030, 0, 2, 21, 5), 4);
    expect(presets.map(({ value }) => value)).toEqual([
      '2030-01-02T22:00',
      '2030-01-02T23:00',
      '2030-01-03T00:00',
      '2030-01-03T01:00',
    ]);
    const time = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
    });
    expect(presets[0].label).toBe(
      time.format(new Date(2030, 0, 2, 22)),
    );
    expect(presets[2].label).not.toBe(
      time.format(new Date(2030, 0, 3, 0)),
    );
    expect(presets[2].label).toContain(
      time.format(new Date(2030, 0, 3, 0)),
    );
  });

  it('skips to the following hour when already on the hour', () => {
    expect(
      untilPresets(new Date(2030, 0, 2, 13, 0), 1)[0].value,
    ).toBe('2030-01-02T14:00');
  });
});

describe('PrinterQrComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prefills a 24-hour window and issues a QR token with a clickable print link', async () => {
    const { element, generate, issueQrToken } = await setup();
    const from = element.querySelector(
      '#qr-not-before',
    ) as HTMLInputElement;
    const until = element.querySelector(
      '#qr-expires-at',
    ) as HTMLInputElement;
    expect(Date.parse(until.value) - Date.parse(from.value)).toBe(
      24 * 3_600_000,
    );

    await generate();

    const [slug, window] = issueQrToken.mock.calls[0] as unknown as [
      string,
      { notBefore: string; expiresAt: string },
    ];
    expect(slug).toBe('front-office');
    expect(window.notBefore).toBe(
      new Date(from.value).toISOString(),
    );
    expect(window.expiresAt).toBe(
      new Date(until.value).toISOString(),
    );

    const link = element.querySelector(
      'a.print-link',
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(
      '/print/front-office?token=qr.jwt.value',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(element.textContent).toContain(issued.url);
    const image = element.querySelector(
      'img.qr-image',
    ) as HTMLImageElement;
    expect(image.getAttribute('src')).toMatch(
      /^data:image\/svg\+xml/,
    );
    expect(image.alt).toContain('Front Office');
  });

  it('sets the end time from an hour preset', async () => {
    const { fixture, element } = await setup();
    const group = element.querySelector(
      '[role=group][aria-labelledby=qr-until-presets]',
    )!;
    const buttons = [...group.querySelectorAll('button')];
    expect(buttons).toHaveLength(8);
    const next = new Date();
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    expect(buttons[0].textContent?.trim()).toContain(
      new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(
        next,
      ),
    );

    buttons[2].click();
    await fixture.whenStable();
    const until = element.querySelector(
      '#qr-expires-at',
    ) as HTMLInputElement;
    next.setHours(next.getHours() + 2);
    expect(until.value).toBe(toLocalInput(next));
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('nudges either boundary by 15 minutes', async () => {
    const { fixture, element, button } = await setup();
    const from = element.querySelector(
      '#qr-not-before',
    ) as HTMLInputElement;
    const until = element.querySelector(
      '#qr-expires-at',
    ) as HTMLInputElement;
    const start = Date.parse(from.value);
    const end = Date.parse(until.value);

    button('+15 min (valid until)').click();
    button('+15 min (valid until)').click();
    button('−15 min (valid from)').click();
    await fixture.whenStable();

    expect(Date.parse(until.value)).toBe(end + 30 * 60_000);
    expect(Date.parse(from.value)).toBe(start - 15 * 60_000);
  });

  it('refuses a window that ends before it starts', async () => {
    const { fixture, element, generate, issueQrToken } =
      await setup();
    const until = element.querySelector(
      '#qr-expires-at',
    ) as HTMLInputElement;
    until.value = '2000-01-01T00:00';
    until.dispatchEvent(new Event('input'));
    until.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    await generate();
    expect(issueQrToken).not.toHaveBeenCalled();
    expect(
      element.querySelector('#qr-expires-at-error')?.textContent,
    ).toContain('after the start');
  });

  it('reuses the issued token for the poster PDF and the printed poster', async () => {
    const printQrPoster = vi.fn(() =>
      of({ jobId: 'j', agentOnline: true }),
    );
    const getQrPoster = vi.fn(() => of(new Blob(['%PDF'])));
    const tab = {
      opener: {},
      location: { href: '' },
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(
      tab as unknown as Window,
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:poster');
    const { fixture, button, generate } = await setup({
      printQrPoster,
      getQrPoster,
    });
    await generate();

    button('Open poster PDF').click();
    await fixture.whenStable();
    expect(getQrPoster).toHaveBeenCalledWith('front-office', {
      token: issued.token,
    });
    expect(tab.location.href).toBe('blob:poster');
    expect(tab.opener).toBeNull();

    button('Print poster').click();
    await fixture.whenStable();
    expect(printQrPoster).toHaveBeenCalledWith('front-office', {
      token: issued.token,
    });
  });

  it('turns on, displays, and turns off the PIN', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const refreshPin = vi.fn(() =>
      of({ ...frontOffice, pin: '987-654-321' }),
    );
    const disablePin = vi.fn(() =>
      of({ ...frontOffice, pin: null }),
    );
    const { fixture, element, button } = await setup({
      refreshPin,
      disablePin,
    });
    expect(element.textContent).toContain('PIN uploads are off');

    button('Turn on PIN').click();
    await fixture.whenStable();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(element.querySelector('.pin')?.textContent).toBe(
      '987-654-321',
    );

    button('Turn off PIN').click();
    await fixture.whenStable();
    expect(disablePin).toHaveBeenCalledWith('front-office');
    expect(element.querySelector('.pin')).toBeNull();
  });

  it('revokes outstanding QR codes after confirmation', async () => {
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValue(false);
    const revokeQrCodes = vi.fn(() =>
      of({ ...frontOffice, qrEpoch: 1 }),
    );
    const { fixture, element, button, generate } = await setup({
      revokeQrCodes,
    });
    await generate();

    button('Revoke all QR codes').click();
    expect(revokeQrCodes).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    button('Revoke all QR codes').click();
    await fixture.whenStable();
    expect(revokeQrCodes).toHaveBeenCalledWith('front-office');
    expect(element.querySelector('a.print-link')).toBeNull();
    expect(
      element.querySelector('[role=status]')?.textContent,
    ).toContain('revoked');
  });
});
