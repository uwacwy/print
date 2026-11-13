import type { ClientConfig } from '@uwacwy/print-shared';

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  MsalBroadcastService,
  MsalService,
} from '@azure/msal-angular';
import { EMPTY } from 'rxjs';

import { environment } from '../environments/environment';
import { App } from './app';
import { CLIENT_ENVIRONMENT } from './auth/client-environment';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: MsalBroadcastService,
          useValue: { inProgress$: EMPTY },
        },
        {
          provide: MsalService,
          useValue: {
            instance: {
              getActiveAccount: () => null,
              getAllAccounts: () => [],
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the print server heading', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(
      environment.site.title,
    );
  });

  it('shows the deployment logo beside the heading when there is one', async () => {
    TestBed.overrideProvider(CLIENT_ENVIRONMENT, {
      useValue: {
        ...environment,
        site: {
          ...environment.site,
          logo: { alt: 'United Way', url: '/logo.png?v=1' },
        },
      } satisfies ClientConfig,
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const img = (
      fixture.nativeElement as HTMLElement
    ).querySelector('header img');
    expect(img?.getAttribute('alt')).toBe('United Way');
  });
});
