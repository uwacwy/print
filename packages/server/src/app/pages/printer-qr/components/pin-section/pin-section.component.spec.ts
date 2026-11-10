import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PinSectionComponent } from './pin-section.component';

describe('PinSectionComponent', () => {
  const create = (pin: string | null, busy = false) => {
    const fixture = TestBed.createComponent(PinSectionComponent);
    fixture.componentRef.setInput('printer', { pin });
    fixture.componentRef.setInput('busy', busy);
    fixture.detectChanges();
    return fixture;
  };
  const buttons = (f: ReturnType<typeof create>) =>
    Array.from<HTMLButtonElement>(
      f.nativeElement.querySelectorAll('button'),
    );

  it('offers to turn the PIN on when none exists', () => {
    const f = create(null);
    expect(f.nativeElement.textContent).toContain('PIN uploads are off');
    expect(buttons(f).map((b) => b.textContent?.trim())).toEqual([
      'Turn on PIN',
    ]);
  });

  it('shows the PIN with refresh and turn-off actions', () => {
    const f = create('123456');
    expect(f.nativeElement.querySelector('.pin').textContent).toBe(
      '123456',
    );
    const calls: string[] = [];
    f.componentInstance.refresh.subscribe(() => calls.push('refresh'));
    f.componentInstance.disable.subscribe(() => calls.push('disable'));
    buttons(f).forEach((b) => b.click());
    expect(calls).toEqual(['refresh', 'disable']);
  });

  it('disables buttons while busy', () => {
    expect(buttons(create('123456', true)).every((b) => b.disabled)).toBe(
      true,
    );
  });
});
