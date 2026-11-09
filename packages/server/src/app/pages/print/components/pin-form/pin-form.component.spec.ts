import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, maxLength, pattern, required } from '@angular/forms/signals';
import { describe, expect, it, vi } from 'vitest';
import { PIN_HINT, PIN_MAX_LENGTH, PIN_PATTERN } from '../../helpers/print-pin/print-pin';
import { PinFormComponent } from './pin-form.component';

@Component({
  imports: [PinFormComponent],
  template: `<app-print-pin-form [pinForm]="f" />`,
})
class HostComponent {
  readonly submitted = vi.fn();
  readonly model = signal({ pin: '' });
  readonly f = form(
    this.model,
    (path) => {
      required(path.pin, { message: PIN_HINT });
      maxLength(path.pin, PIN_MAX_LENGTH);
      pattern(path.pin, PIN_PATTERN, { message: PIN_HINT });
    },
    { submission: { action: async () => void this.submitted() } },
  );
}

describe('PinFormComponent', () => {
  const setup = async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector<HTMLInputElement>('#printer-pin')!;
    const type = async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const submit = async () => {
      el.querySelector('form')!.dispatchEvent(
        new Event('submit', { cancelable: true }),
      );
      await fixture.whenStable();
    };
    return { fixture, el, input, type, submit };
  };

  it('formats digits as the user types', async () => {
    const { fixture, input, type } = await setup();
    await type('1234');
    expect(input.value).toBe('123-4');
    expect(fixture.componentInstance.model().pin).toBe('123-4');
  });

  it('shows no error until the field is touched, then describes it', async () => {
    const { fixture, el, input, submit } = await setup();
    expect(el.querySelector('#printer-pin-error')).toBeNull();
    await submit();
    expect(el.querySelector('#printer-pin-error')?.textContent).toContain(
      PIN_HINT,
    );
    expect(input.getAttribute('aria-errormessage')).toBe(
      'printer-pin-error',
    );
    expect(fixture.componentInstance.submitted).not.toHaveBeenCalled();
  });

  it('submits a complete PIN', async () => {
    const { fixture, type, submit } = await setup();
    await type('123456789');
    await submit();
    expect(fixture.componentInstance.submitted).toHaveBeenCalled();
  });
});
