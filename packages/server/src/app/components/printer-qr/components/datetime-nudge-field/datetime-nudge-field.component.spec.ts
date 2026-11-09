import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, required } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';
import { DatetimeNudgeFieldComponent } from './datetime-nudge-field.component';

@Component({
  imports: [DatetimeNudgeFieldComponent],
  template: `<app-datetime-nudge-field
    inputId="when"
    label="When"
    context="the time"
    [field]="f.when"
  />`,
})
class HostComponent {
  readonly model = signal({ when: '2030-01-02T03:50' });
  readonly f = form(this.model, (path) =>
    required(path.when, { message: 'Pick a time.' }),
  );
}

describe('DatetimeNudgeFieldComponent', () => {
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

  it('labels the input and distinguishes its buttons for screen readers', async () => {
    const { el } = await setup();
    expect(el.querySelector('label')?.textContent).toContain('When');
    expect(el.textContent).toContain('+15 min (the time)');
    expect(el.textContent).toContain('−15 min (the time)');
  });

  it('shifts the value by 15 minutes and marks it touched', async () => {
    const { fixture, button } = await setup();
    button('+15').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.model().when).toBe(
      '2030-01-02T04:05',
    );
    expect(fixture.componentInstance.f.when().touched()).toBe(true);
    button('−15').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.model().when).toBe(
      '2030-01-02T03:50',
    );
  });

  it('ignores nudges on an empty value and shows its error once touched', async () => {
    const { fixture, el, button } = await setup();
    fixture.componentInstance.model.set({ when: '' });
    await fixture.whenStable();
    expect(el.querySelector('#when-error')).toBeNull();
    button('+15').click();
    fixture.componentInstance.f.when().markAsTouched();
    await fixture.whenStable();
    expect(fixture.componentInstance.model().when).toBe('');
    expect(el.querySelector('#when-error')?.textContent).toContain(
      'Pick a time.',
    );
    expect(
      el.querySelector('input')!.getAttribute('aria-errormessage'),
    ).toBe('when-error');
  });
});
