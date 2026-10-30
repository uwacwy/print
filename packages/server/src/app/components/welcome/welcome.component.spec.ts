import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { WelcomeComponent } from './welcome.component';

describe('WelcomeComponent', () => {
  it('renders the public welcome page', async () => {
    await TestBed.configureTestingModule({
      imports: [WelcomeComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(WelcomeComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Welcome');
  });
});
