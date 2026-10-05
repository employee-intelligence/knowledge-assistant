import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine({
  trustProxyHeaders: true,
});

/**
 * Serve static files from /browser
 *
 * Before the redirect below, and that ordering is load-bearing. The sign-in screen is
 * itself an application: its bundle, its stylesheet and its fonts are all fetched
 * from here. Redirecting a visitor with no session before this ran would answer
 * those requests with a 302 to `/login` and the sign-in screen would arrive with no
 * JavaScript at all.
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * No session redirect here, on purpose.
 *
 * A previous version sent any request without an `ika_access` cookie to
 * `/login`. That check can never pass in this deployment: the session cookies
 * are host-only cookies of the API's host, while this server is the app's
 * host, so the browser never sends them here. Every refresh of a signed-in
 * page was therefore bounced to the sign-in screen, and the client — whose
 * `GET /api/auth/me` to the API still carried the cookies — bounced straight
 * back. That round trip is the refresh flash: a server redirect, not a client
 * race, which is why waiting longer on the client never fixed it.
 *
 * Verifying the token here instead would need the signing key on this server,
 * which must never leave the API, and presence alone proves nothing (an
 * expired access token is present and dead). So this server never decides who
 * is signed in: the app initializer settles the session before the first
 * navigation, the guards wait for that answer before redirecting anywhere, and
 * the shell shows a spinner until it has. No refresh renders the wrong screen
 * in either direction.
 */

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
