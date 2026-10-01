/**
 * Single source for the backend base URL. Every HTTP call is built from this
 * constant, so pointing the app at a different deployment is a one-line change.
 *
 * The backend serves CORS with a wildcard origin, so the browser calls it
 * directly and no dev-server proxy is involved.
 *
 * Pointed at a locally running backend for now. Start it with
 * `uvicorn app.main:app --reload` from `backend/`.
 */
export const API_BASE_URL = 'http://localhost:8000';

// The deployed backend. Kept here so restoring it is a matter of swapping the two
// lines, and not of finding the URL again. It does not serve `/chat/stream` yet,
// which is why the app is talking to localhost.
// export const API_BASE_URL = 'https://knowledge-assistant-backend-88gw.onrender.com';

/**
 * How long a single request may take before it is abandoned.
 *
 * Generous because the backend is on a free Render tier, where a cold start can
 * hold the first request for the best part of a minute. Below this a slow but
 * healthy answer would be reported as a failure the user can do nothing about.
 */
export const API_TIMEOUT_MS = 90_000;

/**
 * Where this browser's client id is kept, so its conversations are still its own
 * after a reload.
 *
 * `localStorage` rather than `sessionStorage` on purpose. The backend scopes
 * conversations to a client id and never expires them, so a conversation asked in
 * one tab is still there in the next one, and dropping the id when the tab closed
 * would strand every conversation this browser had.
 */
export const CLIENT_ID_STORAGE_KEY = 'ika.clientId';
