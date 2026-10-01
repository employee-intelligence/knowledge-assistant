/**
 * Single source for the backend origin. Every HTTP call is built from this
 * constant, so pointing the app at a different deployment is a one-line change.
 *
 * The backend serves CORS with a wildcard origin, so the browser calls it
 * directly and no dev-server proxy is involved.
 *
 * The deployed backend. Paths are appended by `ApiService`, which builds them
 * from this origin, so the `/api` prefix that the conversation routes live under
 * is not part of it.
 */
export const API_BASE_URL = 'https://knowledge-assistant-backend-45ob.onrender.com';

// A locally running backend, for working on the two halves together. Start it
// with `uvicorn app.main:app --reload` from `backend/`. Note that the origin
// carries no trailing slash, because the paths are concatenated onto it.
// export const API_BASE_URL = 'http://localhost:8000';

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
