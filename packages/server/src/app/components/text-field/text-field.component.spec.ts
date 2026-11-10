import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, required } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';

import { TextFieldComponent } from './text-field.component';

@Component({
  imports: [TextFieldComponent],
  template: `<app-text-field
    inputId="x"
    label="Thing"
    hint="A hint"
    [field]="f.thing"
  />`,
})
class HostComponent {
  readonly f = form(signal({ thing: '' }), (path) =>
    required(path.thing, { message: 'Thing is required.' }),
  );
}

describe('TextFieldComponent', () => {
  it('labels the input, shows the hint, and reports the error once touched', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector<HTMLInputElement>('#x')!;
    expect(el.querySelector('label')?.textContent).toContain(
      'Thing',
    );
    expect(input.getAttribute('aria-describedby')).toBe(
      'x-hint',
    );
    expect(el.textContent).toContain('A hint');
    expect(el.textContent).not.toContain('Thing is required.');

    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(el.textContent).toContain('Thing is required.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});
