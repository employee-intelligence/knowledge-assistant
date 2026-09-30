/**
 * Single source for the backend base URL. Every HTTP call is built from this
 * constant, so pointing the app at a different deployment is a one-line change.
 *
 * The backend serves CORS with a wildcard origin, so the browser calls it
 * directly and no dev-server proxy is involved.
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
 * Where the session id is kept across a reload.
 *
 * `sessionStorage` rather than `localStorage` on purpose: the backend scopes
 * history to a session and expires it, so a conversation that outlives the tab
 * would only ever come back as an empty list.
 */
export const SESSION_STORAGE_KEY = 'ika.session';
