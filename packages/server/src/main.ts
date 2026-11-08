import { mergeApplicationConfig } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import {
  CLIENT_ENVIRONMENT,
  loadClientEnvironment,
} from './app/auth/client-environment';

loadClientEnvironment(undefined)
  .then((clientEnvironment) =>
    bootstrapApplication(
      App,
      mergeApplicationConfig(appConfig, {
        providers: [
          {
            provide: CLIENT_ENVIRONMENT,
            useValue: clientEnvironment,
          },
        ],
      }),
    ),
  )
  .catch((err) => console.error(err));
