import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AlertComponent } from './alert.component';

describe('AlertComponent', () => {
  const create = (inputs: Record<string, unknown> = {}) => {
    const fixture = TestBed.createComponent(AlertComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture;
  };

  it('is a role=alert danger alert without a dismiss button by default', () => {
    const el: HTMLElement = create().nativeElement;
    const alert = el.querySelector('.alert')!;
    expect(alert.classList).toContain('alert-danger');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(el.querySelector('button')).toBeNull();
  });

  it('can drop the role and emit dismissals', () => {
    const fixture = create({
      variant: 'success',
      role: null,
      dismissLabel: 'Dismiss message',
    });
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => dismissed++);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.alert')!.hasAttribute('role')).toBe(false);
    const button = el.querySelector<HTMLButtonElement>('button')!;
    expect(button.getAttribute('aria-label')).toBe('Dismiss message');
    button.click();
    expect(dismissed).toBe(1);
  });
});
