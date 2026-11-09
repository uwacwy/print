import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';
import { FilesInput } from './files-input.component';

@Component({
  imports: [FormField, FilesInput],
  template: `<input type="file" multiple [formField]="f.files" />`,
})
class HostComponent {
  readonly model = signal<{ files: File[] }>({ files: [] });
  readonly f = form(this.model);
}

const a = new File(['a'], 'a.pdf');
const b = new File(['b'], 'b.pdf');

describe('FilesInput', () => {
  const setup = async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const input: HTMLInputElement =
      fixture.nativeElement.querySelector('input');
    const choose = async (files: File[]) => {
      Object.defineProperty(input, 'files', {
        value: files,
        configurable: true,
      });
      input.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    const control = () =>
      fixture.debugElement.children[0].injector.get(FilesInput);
    return { fixture, input, choose, control };
  };

  it('writes all chosen files to the form field', async () => {
    const { fixture, choose } = await setup();
    await choose([a, b]);
    expect(fixture.componentInstance.model().files).toEqual([a, b]);
  });

  it('writes an empty list when the selection is cleared', async () => {
    const { fixture, choose } = await setup();
    await choose([a]);
    await choose([]);
    expect(fixture.componentInstance.model().files).toEqual([]);
  });

  it('clears the native input when the field is emptied', async () => {
    const { fixture, input, choose } = await setup();
    await choose([a]);
    let cleared = false;
    Object.defineProperty(input, 'value', {
      get: () => '',
      set: (v: string) => {
        cleared = v === '';
      },
      configurable: true,
    });
    fixture.componentInstance.model.set({ files: [] });
    await fixture.whenStable();
    expect(cleared).toBe(true);
  });

  it('focuses the native input', async () => {
    const { fixture, input, control } = await setup();
    document.body.append(fixture.nativeElement);
    control().focus();
    expect(document.activeElement).toBe(input);
    fixture.nativeElement.remove();
  });

  it('reset() empties the value', async () => {
    const { fixture, choose, control } = await setup();
    await choose([a, b]);
    control().reset();
    await fixture.whenStable();
    expect(fixture.componentInstance.model().files).toEqual([]);
  });
});
