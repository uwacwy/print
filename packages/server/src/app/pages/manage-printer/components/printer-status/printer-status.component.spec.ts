import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { PrinterStatusComponent } from './printer-status.component';

describe('PrinterStatusComponent', () => {
  const render = (online: boolean, activeJobs: number) => {
    const fixture = TestBed.createComponent(
      PrinterStatusComponent,
    );
    fixture.componentRef.setInput('online', online);
    fixture.componentRef.setInput('activeJobs', activeJobs);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows an online agent and its jobs', () => {
    const el = render(true, 3);
    expect(el.textContent).toContain('Online');
    expect(el.textContent).toContain('3 active job(s)');
  });

  it('shows an offline agent', () => {
    expect(render(false, 0).textContent).toContain('Offline');
  });
});
