import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { UntilPresetsComponent } from './until-presets.component';

describe('UntilPresetsComponent', () => {
  const presets = [
    { label: '1 PM', value: '2030-01-02T13:00' },
    { label: '2 PM', value: '2030-01-02T14:00' },
  ];
  const create = (value: string, list = presets) => {
    const fixture = TestBed.createComponent(
      UntilPresetsComponent,
    );
    fixture.componentRef.setInput('presets', list);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return fixture;
  };

  it('renders nothing without presets', () => {
    expect(create('', []).nativeElement.textContent.trim()).toBe(
      '',
    );
  });

  it('marks the chosen preset as pressed', () => {
    const buttons = create(
      '2030-01-02T14:00',
    ).nativeElement.querySelectorAll('button');
    expect(buttons[0].getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('emits the picked value', () => {
    const fixture = create('');
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((v) =>
      picked.push(v),
    );
    fixture.nativeElement.querySelectorAll('button')[1].click();
    expect(picked).toEqual(['2030-01-02T14:00']);
  });
});
