import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { PrintServerClientEnvironment } from '../../../environments/environment.interface';

import { environment } from '../../../environments/environment';
import { CLIENT_ENVIRONMENT } from '../../auth/client-environment';
import { SiteLogoComponent } from './site-logo.component';

describe('SiteLogoComponent', () => {
  function render(
    clientEnvironment: PrintServerClientEnvironment,
  ) {
    TestBed.configureTestingModule({
      imports: [SiteLogoComponent],
      providers: [
        {
          provide: CLIENT_ENVIRONMENT,
          useValue: clientEnvironment,
        },
      ],
    });
    const fixture = TestBed.createComponent(SiteLogoComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the logo with its text alternative', () => {
    const element = render({
      ...environment,
      logo: { alt: 'United Way', src: '/logo.svg?v=1' },
    });
    const img = element.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/logo.svg?v=1');
    expect(img?.getAttribute('alt')).toBe('United Way');
    expect(element.classList).not.toContain('d-none');
  });

  it('is hidden without a logo', () => {
    const element = render(environment);
    expect(element.querySelector('img')).toBeNull();
    expect(element.classList).toContain('d-none');
  });
});
