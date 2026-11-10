import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AddModeChoiceComponent } from './add-mode-choice.component';

describe('AddModeChoiceComponent', () => {
  const create = (enrollment: boolean) => {
    const fixture = TestBed.createComponent(
      AddModeChoiceComponent,
    );
    fixture.componentRef.setInput('enrollment', enrollment);
    fixture.componentRef.setInput('mode', 'manual');
    fixture.detectChanges();
    return fixture;
  };

  it('disables enrollment when unavailable', () => {
    const el: HTMLElement = create(false).nativeElement;
    expect(
      el.querySelector<HTMLInputElement>('#add-mode-enroll')!
        .disabled,
    ).toBe(true);
    expect(el.textContent).toContain('PUBLIC_URL');
  });

  it('updates the mode when a choice is picked', () => {
    const fixture = create(true);
    fixture.nativeElement
      .querySelector('#add-mode-enroll')
      .dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.mode()).toBe('enroll');
  });
});
