import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { applyEach, form, validate } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';
import type { DocumentRow } from '../../helpers/print-upload/print-upload';
import { UploadDocumentRowComponent } from './upload-document-row.component';

@Component({
  imports: [UploadDocumentRowComponent],
  template: `<app-upload-document-row
    [document]="f.documents[0]"
    [index]="1"
    [copyOptions]="['1', '2', '3']"
    [canRemove]="canRemove()"
    (remove)="removed.push($event)"
  />`,
})
class HostComponent {
  readonly canRemove = signal(true);
  readonly removed: number[] = [];
  readonly model = signal<{ documents: DocumentRow[] }>({
    documents: [{ id: 42, file: null, copies: '2' }],
  });
  readonly f = form(this.model, (path) =>
    applyEach(path.documents, (d) =>
      validate(d.file, () => ({ kind: 'x', message: 'Too big.' })),
    ),
  );
}

describe('UploadDocumentRowComponent', () => {
  const setup = async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  it('labels the controls by row number and id', async () => {
    const { el } = await setup();
    expect(
      el.querySelector('label[for=document-file-42]')?.textContent,
    ).toContain('Document 2');
    expect(el.querySelector('#document-copies-42')).not.toBeNull();
    expect(
      el.querySelector('button')!.getAttribute('aria-label'),
    ).toBe('Remove document 2');
    expect(
      el.querySelector<HTMLSelectElement>('#document-copies-42')!.value,
    ).toBe('2');
    expect(el.querySelectorAll('option')).toHaveLength(3);
  });

  it('emits its id on remove and can disable the button', async () => {
    const { fixture, el } = await setup();
    el.querySelector('button')!.click();
    expect(fixture.componentInstance.removed).toEqual([42]);
    fixture.componentInstance.canRemove.set(false);
    await fixture.whenStable();
    expect(el.querySelector('button')!.disabled).toBe(true);
  });

  it('reveals the file error only once touched', async () => {
    const { fixture, el } = await setup();
    expect(el.querySelector('#document-file-error-42')).toBeNull();
    fixture.componentInstance.f.documents[0].file().markAsTouched();
    await fixture.whenStable();
    expect(
      el.querySelector('#document-file-error-42')?.textContent,
    ).toContain('Too big.');
    expect(
      el.querySelector('#document-file-42')!.getAttribute('aria-errormessage'),
    ).toBe('document-file-error-42');
  });
});
