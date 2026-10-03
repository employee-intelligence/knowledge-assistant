import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL, SESSION_STORAGE_KEY } from '../api.config';
import { ApiError } from './api.service';
import { SessionService } from './session.service';

/**
 * The session outlives a page load and is what ties a conversation to the history
 * the backend kept for it, so these cover what happens when that stored id is
 * dead: a reload must explain the loss rather than present an empty thread as
 * though the questions had never been asked.
 */
describe('SessionService', () => {
  /** A stored session already past its expiry. */
  const EXPIRED = { id: 'sess-old', expiresAt: Date.now() - 1_000 };

  /** A stored session with time left on it. */
  const LIVE = { id: 'sess-live', expiresAt: Date.now() + 3_600_000 };

  const givenStoredSession = (stored: unknown): void => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored));
  };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('restoring a stored session', () => {
    it('reports an expired session instead of silently opening an empty one', () => {
      givenStoredSession(EXPIRED);

      const session = TestBed.inject(SessionService);

      // The backend deletes a session once it expires, so the conversation this
      // browser remembers is genuinely gone and the user is told why it is empty.
      expect(session.sessionExpired()).toBe(true);
      expect(session.sessionId()).toBeNull();
      // The dead id is dropped so the next question does not post into it.
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });

    it('adopts a session that has not expired', () => {
      givenStoredSession(LIVE);

      const session = TestBed.inject(SessionService);

      expect(session.sessionExpired()).toBe(false);
      expect(session.sessionId()).toBe('sess-live');
    });

    it('treats a first visit as new rather than as an expired conversation', () => {
      expect(TestBed.inject(SessionService).sessionExpired()).toBe(false);
    });

    it('survives unreadable storage, which private browsing can produce', () => {
      sessionStorage.setItem(SESSION_STORAGE_KEY, 'not json');

      expect(TestBed.inject(SessionService).sessionExpired()).toBe(false);
    });
  });

  describe('keeping one session for the conversation', () => {
    it('does not swap out a session that is merely close to expiry', () => {
      // A second before expiry is still usable. Retiring it early would move the
      // conversation onto a new session and lose the history filed under this one,
      // which is the failure this guards against.
      givenStoredSession({ id: 'sess-live', expiresAt: Date.now() + 1_000 });

      const session = TestBed.inject(SessionService);
      const http = TestBed.inject(HttpTestingController);
      let id: string | undefined;

      session.ensureSession().subscribe((value) => (id = value));

      expect(id).toBe('sess-live');
      http.expectNone(`${API_BASE_URL}/sessions`);
      expect(session.sessionExpired()).toBe(false);
    });

    it('creates exactly one session when two callers ask at once', () => {
      const session = TestBed.inject(SessionService);
      const http = TestBed.inject(HttpTestingController);
      const ids: string[] = [];

      session.ensureSession().subscribe((value) => ids.push(value));
      session.ensureSession().subscribe((value) => ids.push(value));

      // A second session would orphan the first one's history.
      const request = http.expectOne(`${API_BASE_URL}/sessions`);

      expect(request.request.method).toBe('POST');
      request.flush({
        session_id: 'sess-new',
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      });

      expect(ids).toEqual(['sess-new', 'sess-new']);
    });
  });

  describe('a session the backend no longer knows', () => {
    it('reports expiry and retires the id when the session is rejected', () => {
      givenStoredSession(LIVE);

      const session = TestBed.inject(SessionService);

      session.handleSessionLoss(new ApiError('gone', 404, false, true));

      expect(session.sessionExpired()).toBe(true);
      expect(session.sessionId()).toBeNull();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });

    it('reports expiry when the backend refuses the session with a 401', () => {
      givenStoredSession(LIVE);

      const session = TestBed.inject(SessionService);

      session.handleSessionLoss(new ApiError('gone', 401, false, true));

      expect(session.sessionExpired()).toBe(true);
    });

    it('leaves a session alone for an error that is not a rejection', () => {
      givenStoredSession(LIVE);

      const session = TestBed.inject(SessionService);

      // A 503 or a timeout says nothing about the session: the id is still good
      // and the turn is worth retrying against it.
      session.handleSessionLoss(new ApiError('unavailable', 503, true));

      expect(session.sessionExpired()).toBe(false);
      expect(session.sessionId()).toBe('sess-live');
    });

    it('leaves a session alone for a question the user can fix', () => {
      givenStoredSession(LIVE);

      const session = TestBed.inject(SessionService);

      // A rejected question says nothing about the session either. Retiring it
      // here would throw the whole conversation away over one bad rephrase.
      session.handleSessionLoss(new ApiError('too short', 422, false));

      expect(session.sessionExpired()).toBe(false);
      expect(session.sessionId()).toBe('sess-live');
    });
  });

  describe('starting a new conversation', () => {
    it('retires the session so the next question opens a fresh one', () => {
      givenStoredSession(LIVE);

      const session = TestBed.inject(SessionService);

      session.startNew();

      expect(session.sessionId()).toBeNull();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });

    it('clears an expiry notice, so a new conversation is not born showing it', () => {
      givenStoredSession(EXPIRED);

      const session = TestBed.inject(SessionService);

      expect(session.sessionExpired()).toBe(true);

      session.startNew();

      expect(session.sessionExpired()).toBe(false);
    });
  });
});
