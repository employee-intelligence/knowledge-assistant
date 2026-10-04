// Local development backend. The backend runs from `backend/` with
// `uvicorn app.main:app --host 127.0.0.1 --port 8099`, and its ALLOWED_ORIGINS
// lists http://127.0.0.1:4200. Use 127.0.0.1 (not localhost) for cookies to work.
export const API_BASE_URL = 'http://127.0.0.1:8099';

// The deployed backend on Render. Both services are `*.onrender.com`, so they are
// the same site and the `SameSite=Lax` session cookies are attached; the backend
// reflects the origin because `ALLOWED_ORIGINS` is `*`, which is what makes a
// credentialed cross-origin response acceptable to the browser.
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
 * Where this browser's session id is kept, so its sessions are still its own
 * after a reload.
 */
export const SESSION_ID_STORAGE_KEY = 'ika.sessionId';