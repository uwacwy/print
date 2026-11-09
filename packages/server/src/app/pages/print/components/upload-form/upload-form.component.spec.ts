import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { describe, expect, it, vi } from 'vitest';
import {
  addDocument,
  emptyUpload,
  removeDocument,
} from '../../helpers/print-upload/print-upload';
import { UploadFormComponent } from './upload-form.component';

@Component({
  imports: [UploadFormComponent],
  template: `<app-upload-form
    [uploadForm]="f"
    [maxUploadMb]="5"
    [maxDocuments]="2"
    [copyOptions]="['1', '2']"
    (addDocument)="add()"
    (removeDocument)="remove($event)"
  />`,
})
class HostComponent {
  #next = 2;
  readonly submitted = vi.fn();
  readonly model = signal(emptyUpload(1));
  readonly f = form(this.model, () => undefined, {
    submission: { action: async () => void this.submitted() },
  });
  add() {
    this.model.update((m) => addDocument(m, this.#next++));
  }
  remove(id: number) {
    this.model.update((m) => removeDocument(m, id));
  }
}

describe('UploadFormComponent', () => {
  const setup = async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const button = (label: string) =>
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes(label),
      )!;
    return { fixture, el, button };
  };

  it('states the size limit and starts with one non-removable row', async () => {
    const { el } = await setup();
    expect(el.textContent).toContain('up to 5 MB per document');
    expect(el.querySelectorAll('app-upload-document-row')).toHaveLength(1);
    expect(
      el.querySelector<HTMLButtonElement>('[aria-label="Remove document 1"]')!
        .disabled,
    ).toBe(true);
  });

  it('adds rows up to the printer limit', async () => {
    const { fixture, el, button } = await setup();
    button('Add another').click();
    await fixture.whenStable();
    expect(el.querySelectorAll('app-upload-document-row')).toHaveLength(2);
    expect(button('Add another').disabled).toBe(true);
  });

  it('removes a row', async () => {
    const { fixture, el, button } = await setup();
    button('Add another').click();
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('[aria-label="Remove document 1"]')!.click();
    await fixture.whenStable();
    expect(el.querySelectorAll('app-upload-document-row')).toHaveLength(1);
  });

  it('binds the title and submits', async () => {
    const { fixture, el } = await setup();
    const title = el.querySelector<HTMLInputElement>('#job-title')!;
    title.value = 'Report';
    title.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.model().title).toBe('Report');
    expect(fixture.componentInstance.submitted).toHaveBeenCalled();
  });
});
