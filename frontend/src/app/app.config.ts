import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  APP_INITIALIZER,
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Settles the session before the router's first navigation runs, so no
    // guard ever decides on signals that are still at their page-load values.
    // Without this, a refresh of a protected page lets the guard answer "signed
    // out" before the one `GET /api/auth/me` resolves, and the app flashes
    // through the sign-in screen on its way back. The factory returns the real
    // check's promise — not a timer — so slow networks simply settle later
    // rather than deciding wrongly. Never rejects and never requests on the
    // server, so neither a dead session nor a server render can hold up the boot.
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (auth: AuthService) => () => auth.initialize(),
      deps: [AuthService],
    },
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
    //
    // The interceptor is registered here rather than inside `ApiService` because it
    // has to see every request, including any made by a service added later by
    // somebody who has not thought about auth at all.
    provideHttpClient(withInterceptors([authInterceptor])),
    provideClientHydration(),
  ],
};
