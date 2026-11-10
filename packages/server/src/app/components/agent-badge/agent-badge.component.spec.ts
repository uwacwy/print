import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AgentBadgeComponent } from './agent-badge.component';

describe('AgentBadgeComponent', () => {
  it.each([
    [true, 'Online'],
    [false, 'Offline'],
  ])('shows %s as %s', (online, text) => {
    const fixture = TestBed.createComponent(AgentBadgeComponent);
    fixture.componentRef.setInput('online', online);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe(text);
  });
});
