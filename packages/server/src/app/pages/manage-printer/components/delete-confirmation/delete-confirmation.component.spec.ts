import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DeleteConfirmationComponent } from './delete-confirmation.component';

describe('DeleteConfirmationComponent', () => {
  it('emits confirm and cancel', () => {
    const fixture = TestBed.createComponent(DeleteConfirmationComponent);
    const events: string[] = [];
    fixture.componentInstance.confirmed.subscribe(() =>
      events.push('confirmed'),
    );
    fixture.componentInstance.cancelled.subscribe(() =>
      events.push('cancelled'),
    );
    fixture.detectChanges();
    const [confirm, cancel] = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('button'),
    );
    confirm.click();
    cancel.click();
    expect(events).toEqual(['confirmed', 'cancelled']);
  });
});
