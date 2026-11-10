import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';

import { FileInput } from './file-input.component';

@Component({
  imports: [FormField, FileInput],
  template: `<input type="file" [formField]="f.file" />`,
})
class HostComponent {
  readonly model = signal<{ file: File | null }>({ file: null });
  readonly f = form(this.model);
}

const pdf = new File(['x'], 'a.pdf', {
  type: 'application/pdf',
});

describe('FileInput', () => {
  const setup = async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const input: HTMLInputElement =
      fixture.nativeElement.querySelector('input');
    const choose = async (files: File[]) => {
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: files,
      });
      input.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    return { choose, fixture, input };
  };

  it('writes the chosen file to the form field', async () => {
    const { choose, fixture } = await setup();
    await choose([pdf]);
    expect(fixture.componentInstance.model().file).toBe(pdf);
  });

  it('writes null when the selection is cleared', async () => {
    const { choose, fixture } = await setup();
    await choose([pdf]);
    await choose([]);
    expect(fixture.componentInstance.model().file).toBeNull();
  });

  it('clears the native input when the field is reset to null', async () => {
    const { choose, fixture, input } = await setup();
    await choose([pdf]);
    let cleared = false;
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => '',
      set: (v: string) => {
        cleared = v === '';
      },
    });
    fixture.componentInstance.model.set({ file: null });
    await fixture.whenStable();
    expect(cleared).toBe(true);
  });

  it('focuses the native input', async () => {
    const { fixture, input } = await setup();
    document.body.append(fixture.nativeElement);
    fixture.debugElement.children[0].injector
      .get(FileInput)
      .focus();
    expect(document.activeElement).toBe(input);
    fixture.nativeElement.remove();
  });

  it('reset() empties the value', async () => {
    const { choose, fixture } = await setup();
    await choose([pdf]);
    fixture.debugElement.children[0].injector
      .get(FileInput)
      .reset();
    await fixture.whenStable();
    expect(fixture.componentInstance.model().file).toBeNull();
  });

  it('is not applied to multiple-file inputs', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    expect(
      input.matches('input[type=file]:not([multiple])'),
    ).toBe(false);
  });
});
