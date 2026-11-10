import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { RevokeSectionComponent } from './revoke-section.component';

describe('RevokeSectionComponent', () => {
  const create = (busy = false) => {
    const fixture = TestBed.createComponent(
      RevokeSectionComponent,
    );
    fixture.componentRef.setInput('printerName', 'Front Office');
    fixture.componentRef.setInput('busy', busy);
    fixture.detectChanges();
    return fixture;
  };

  it('names the printer and emits revoke', () => {
    const f = create();
    expect(f.nativeElement.textContent).toContain(
      'Front Office',
    );
    let n = 0;
    f.componentInstance.revoke.subscribe(() => n++);
    f.nativeElement.querySelector('button').click();
    expect(n).toBe(1);
  });

  it('disables the button while busy', () => {
    expect(
      create(true).nativeElement.querySelector('button')
        .disabled,
    ).toBe(true);
  });
});
