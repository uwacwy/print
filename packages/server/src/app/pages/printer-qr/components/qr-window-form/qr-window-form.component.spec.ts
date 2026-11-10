import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { describe, expect, it, vi } from 'vitest';

import { QrWindowFormComponent } from './qr-window-form.component';

@Component({
  imports: [QrWindowFormComponent],
  template: `<app-qr-window-form
    [windowForm]="f"
    [now]="now()"
    [regenerate]="regenerate()"
    [busy]="busy()"
  />`,
})
class HostComponent {
  readonly busy = signal(false);
  readonly model = signal({
    expiresAt: '2030-01-03T09:00',
    notBefore: '2030-01-02T09:00',
  });
  readonly f = form(this.model, () => undefined, {
    submission: { action: async () => void this.submitted() },
  });
  readonly now = signal<Date | undefined>(undefined);
  readonly regenerate = signal(false);
  readonly submitted = vi.fn();
}

describe('QrWindowFormComponent', () => {
  const setup = async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    return { el: fixture.nativeElement as HTMLElement, fixture };
  };

  it('shows both boundaries and hides presets until the clock is known', async () => {
    const { el, fixture } = await setup();
    expect(
      el.querySelector<HTMLInputElement>('#qr-not-before')!
        .value,
    ).toBe('2030-01-02T09:00');
    expect(el.querySelector('#qr-until-presets')).toBeNull();

    fixture.componentInstance.now.set(
      new Date(2030, 0, 2, 10, 30),
    );
    await fixture.whenStable();
    expect(
      el.querySelectorAll('[role=group] button'),
    ).toHaveLength(8);
  });

  it('sets the end time from a preset', async () => {
    const { el, fixture } = await setup();
    fixture.componentInstance.now.set(
      new Date(2030, 0, 2, 10, 30),
    );
    await fixture.whenStable();
    el.querySelectorAll<HTMLButtonElement>(
      '[role=group] button',
    )[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.model().expiresAt).toBe(
      '2030-01-02T12:00',
    );
  });

  it('words and disables the submit button from its state', async () => {
    const { el, fixture } = await setup();
    const submit =
      el.querySelector<HTMLButtonElement>('[type=submit]')!;
    expect(submit.textContent).toContain('Generate');
    fixture.componentInstance.regenerate.set(true);
    fixture.componentInstance.busy.set(true);
    await fixture.whenStable();
    expect(submit.textContent).toContain('Regenerate');
    expect(submit.disabled).toBe(true);
  });

  it('submits the form', async () => {
    const { el, fixture } = await setup();
    el.querySelector('form')!.dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await fixture.whenStable();
    expect(
      fixture.componentInstance.submitted,
    ).toHaveBeenCalled();
  });
});
