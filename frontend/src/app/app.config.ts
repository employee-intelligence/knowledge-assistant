import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    // `ApiService` is the only place allowed to use HttpClient, and it is the
    // only thing that knows the backend's URLs. Nothing here fetches on the
    // server: the conversation belongs to a browser session, and a server render
    // would pay the round trip on every request to paint what the client is about
    // to fetch anyway.
    provideHttpClient(),
    provideClientHydration(),
  ],
};
