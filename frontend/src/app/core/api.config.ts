/**
 * Single source for the backend origin. Every HTTP call is built from this,
 * so pointing the app at a different deployment is a one-line change — and in
 * practice it is not even that: `public/config.json` overrides it at runtime
 * without a rebuild, and this is only the fallback when that file is missing.
 *
 * The deployed backend is https://knowledge-assistant-backend-88gw.onrender.com.
 * Local development keeps `config.json` empty instead, so calls stay same-origin
 * and the dev-server proxy forwards them past CORS (see `proxy.conf.json`).
 */
export const API_BASE_URL = 'https://knowledge-assistant-backend-88gw.onrender.com';

/**
 * How long a single request may take before it is abandoned.
 *
 * Generous because the backend is on a free Render tier, where a cold start can
 * hold the first request for the best part of a minute. Below this a slow but
 * healthy answer would be reported as a failure the user can do nothing about.
 */
export const API_TIMEOUT_MS = 90_000;

/**
 * Where this browser's session id is kept, so its conversations are still its own
 * after a reload.
 *
 * `localStorage` rather than `sessionStorage` on purpose. The backend scopes
 * history to a session id and never expires it within the day, so a session
 * started in one tab is still there in the next one, and dropping the id when
 * the tab closed would strand every session this browser had.
 */
export const SESSION_ID_STORAGE_KEY = 'ika.sessionId';
