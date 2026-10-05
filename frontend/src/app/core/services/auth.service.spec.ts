import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../api.config';
import { AuthService } from './auth.service';

const ME = `${API_BASE_URL}/api/auth/me`;
const REFRESH = `${API_BASE_URL}/api/auth/refresh`;
const SESSION_CACHE_KEY = 'ika.session.v1';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  /** The readable flag the backend sets beside the session cookies. */
  const withHint = (): void => {
    document.cookie = 'ika_session=1; path=/';
  };

  const answerWithUser = (role: 'employee' | 'admin'): void => {
    http.expectOne(ME).flush({ id: 'u1', name: 'Ama Konadu', email: 'ama@acmetech.example', role });
  };

  const answerWithNobody = (): void => {
    http
      .expectOne(ME)
      .flush({ detail: 'Not authenticated' }, { status: 401, statusText: 'Unauthorized' });
  };

  /**
   * Answers the single refresh attempt a `GET /api/auth/me` 401 triggers while
   * nobody is known to be signed in, with a session that is genuinely over.
   *
   * Needed because the access token dies after fifteen minutes while the refresh
   * token lives fourteen days: a 401 alone cannot tell "signed out" from "the
   * access token ran out", so the service tries once before concluding.
   */
  const answerRefreshWithNobody = (): void => {
    http
      .expectOne(REFRESH)
      .flush({ detail: 'No active session.' }, { status: 401, statusText: 'Unauthorized' });
  };

  /** The same attempt, answered with a session that is still alive. */
  const answerRefreshWithUser = (role: 'employee' | 'admin'): void => {
    http.expectOne(REFRESH).flush({
      user: { id: 'u1', name: 'Ama Konadu', email: 'ama@acmetech.example', role },
    });
  };

  /**
   * Awaits a settled bootstrap and answers the CSRF token request that follows it.
   *
   * That request is made from a `.then()`, so it appears only after the promise has
   * resolved — not the moment `/me` is answered. It comes regardless of the answer:
   * a 401 means the sign-in screen is about to be shown and needs a token to submit,
   * so the token is issued either way and later requests need not wait for it.
   */
  const settle = async <T>(pending: Promise<T>): Promise<T> => {
    const settled = await pending;
    http.expectOne(`${API_BASE_URL}/api/auth/csrf`).flush({ csrf_token: 'test-token' });

    return settled;
  };

  beforeEach(async () => {
    // `document.cookie` outlives the injector, so a hint left by one test would make
    // the next one believe it had a session.
    document.cookie = 'ika_session=; path=/; max-age=0';

    // The cached user outlives the injector the same way: without this, a sign-in
    // in one test would make the next test's fresh service believe it was signed
    // in before asking anybody.
    localStorage.clear();

    await TestBed.configureTestingModule({
      providers: [provideHttpClientTesting()],
    });

    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('looksSignedIn', () => {
    it('is false, and asks nobody, when there is no hint cookie', () => {
      expect(auth.looksSignedIn()).toBe(false);
    });

    it('is true when the hint cookie is there', () => {
      withHint();

      expect(auth.looksSignedIn()).toBe(true);
    });

    it('is not fooled by a cookie whose name merely starts the same', () => {
      // A prefix match here would be a bug, not a tolerance: `ika_session_hint` is a
      // different cookie and must not imply a session.
      document.cookie = 'ika_session_hint=1; path=/';

      expect(auth.looksSignedIn()).toBe(false);
    });

    it('is not fooled by the CSRF cookie', () => {
      // Both cookies are readable, so this is the mistake worth guarding against.
      document.cookie = 'ika_csrf=abc123; path=/';

      expect(auth.looksSignedIn()).toBe(false);
    });

    it('does not care what the hint says, only that it is there', () => {
      // Deliberately: the value is never interpreted. Anything at all means "worth
      // asking", and the server has the last word either way.
      document.cookie = 'ika_session=anything-at-all; path=/';

      expect(auth.looksSignedIn()).toBe(true);
    });
  });

  describe('maybeBootstrap', () => {
    it('sends no request at all without a hint, and settles as anonymous', async () => {
      const user = await auth.maybeBootstrap();

      expect(user).toBeNull();
      expect(auth.status()).toBe('anonymous');
      expect(auth.isAuthenticated()).toBe(false);
      http.verify();
    });

    it('asks when the hint suggests there might be a session', async () => {
      withHint();

      const settled = auth.maybeBootstrap();
      answerWithUser('employee');

      // One request, not two: the hint licensed exactly one question.
      expect((await settle(settled))?.email).toBe('ama@acmetech.example');
      expect(auth.isAuthenticated()).toBe(true);
    });

    it('trusts the server over the hint when the session turns out to be gone', async () => {
      // A stale hint is the ordinary case after a session is revoked in another tab.
      // The flag says "ask"; it does not say "signed in".
      withHint();

      const settled = auth.maybeBootstrap();
      answerWithNobody();
      // The access token's 401 alone cannot say the session is over (it dies in
      // fifteen minutes, the refresh token in fourteen days), so one refresh is
      // tried first. Here it is refused too, which is the actual answer.
      answerRefreshWithNobody();

      expect(await settle(settled)).toBeNull();
      expect(auth.status()).toBe('anonymous');
    });

    it('does not send a second request when something has already settled it', async () => {
      withHint();

      const first = auth.maybeBootstrap();
      answerWithUser('employee');
      await settle(first);

      // Already answered: asking again would be the app talking to itself.
      expect(await auth.maybeBootstrap()).not.toBeNull();
      http.verify();
    });

    it('does not re-ask once sign-in has already settled it', async () => {
      withHint();

      const signedIn = auth.maybeBootstrap();
      answerWithUser('employee');
      await settle(signedIn);

      // A navigation that follows sign-in must not go back to the API for something
      // this tab already knows, hint cookie or not.
      expect(await auth.maybeBootstrap()).not.toBeNull();
      http.verify();
    });
  });

  describe('bootstrap', () => {
    it('asks regardless of the hint, for callers that genuinely need the answer', async () => {
      // The deliberate asymmetry: `bootstrap` is the unconditional question, kept for
      // callers that must know rather than guess.
      const settled = auth.bootstrap();
      answerWithNobody();
      answerRefreshWithNobody();

      expect(await settle(settled)).toBeNull();
    });

    it('heals an expired access token with the refresh token before giving up', async () => {
      // The refresh-hours-later case: the access token died at fifteen minutes but
      // the refresh token is still good, so this is a live session, not a signed-out
      // browser. Concluding "anonymous" on the first 401 would send a signed-in
      // person to the sign-in screen for nothing.
      withHint();

      const settled = auth.bootstrap();
      answerWithNobody();
      answerRefreshWithUser('employee');

      expect((await settle(settled))?.email).toBe('ama@acmetech.example');
      expect(auth.isAuthenticated()).toBe(true);
    });
  });

  describe('initialize', () => {
    /** Answers the CSRF request the settled check fires on its way out. */
    const flushCsrf = (): void => {
      http.expectOne(`${API_BASE_URL}/api/auth/csrf`).flush({ csrf_token: 'test-token' });
    };

    it('starts uninitialized and settles once the single check answers', async () => {
      withHint();

      expect(auth.initialized()).toBe(false);

      const pending = auth.initialize();
      answerWithUser('employee');
      await pending;
      flushCsrf();

      expect(auth.initialized()).toBe(true);
      expect(auth.isAuthenticated()).toBe(true);
    });

    it('settles without any request when there is plainly no session', async () => {
      // No hint cookie, so no cookies for `/me` to judge by: firing it anyway
      // would only log a 401 on every signed-out visit. Skipping the request is
      // not skipping the check — the answer is already known.
      await auth.initialize();

      expect(auth.initialized()).toBe(true);
      expect(auth.status()).toBe('anonymous');
      http.verify();
    });

    it('settles as anonymous when the session has expired', async () => {
      // The stale-hint case: the flag outlives a session revoked elsewhere, so
      // the check asks and the 401 is the answer. Initialization still settles —
      // an expired session must release the guards, not hold them forever.
      withHint();

      const pending = auth.initialize();
      answerWithNobody();
      answerRefreshWithNobody();
      await pending;
      flushCsrf();

      expect(auth.initialized()).toBe(true);
      expect(auth.isAuthenticated()).toBe(false);
    });

    it('asks only once however many callers initialize', async () => {
      // The app initializer and the first guards all arrive together on a
      // refresh. A second `GET /api/auth/me` would be a second chance for the
      // answers to disagree — and the visible symptom would be the refresh
      // flash this exists to remove.
      withHint();

      const first = auth.initialize();
      const second = auth.initialize();
      answerWithUser('employee');
      await first;
      await second;
      flushCsrf();

      expect(auth.initialized()).toBe(true);
      http.verify();
    });

    it('whenInitialized starts the check itself when the initializer did not run', async () => {
      // The guards cannot assume an initializer ran — tests and future entry
      // points reach them without one. Waiting on a check nobody started would
      // hang the navigation forever, so the wait starts it.
      withHint();

      const pending = auth.whenInitialized();
      answerWithUser('employee');
      await pending;
      flushCsrf();

      expect(auth.initialized()).toBe(true);
      expect(auth.isAuthenticated()).toBe(true);
    });

    it('whenInitialized resolves at once once the check has settled', async () => {
      await auth.initialize();

      // Must neither hang nor ask again: the answer is already in hand.
      await auth.whenInitialized();
      http.verify();
    });
  });

  describe('session cache', () => {
    const cachedUser = {
      id: 'u1',
      name: 'Ama Konadu',
      email: 'ama@acmetech.example',
      role: 'employee',
    };

    /** A previous visit's memory, as `setUser` would have written it. */
    const seedCache = (): void => {
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cachedUser));
    };

    it('remembers who signed in, so the next load starts from the answer', async () => {
      withHint();

      const settled = auth.maybeBootstrap();
      answerWithUser('employee');
      await settle(settled);

      // The session cookies live on the API's host and are unreadable here, so
      // without this the next refresh would start from "nobody".
      const stored = localStorage.getItem(SESSION_CACHE_KEY);

      expect(stored).toBeTruthy();
      expect(JSON.parse(stored as string).email).toBe('ama@acmetech.example');
    });

    it('restores the cached user before any request answers', async () => {
      // A refresh: every signal is back to its page-load value, but the storage
      // survived. The guards and the shell must see the right answer on the
      // first paint rather than after the round trip — that round trip is what
      // used to flash the sign-in screen.
      seedCache();

      await auth.initialize();

      expect(auth.isAuthenticated()).toBe(true);
      expect(auth.initialized()).toBe(true);

      // The live check is still in flight behind that answer: nothing was
      // decided from the network yet.
      const revalidation = http.expectOne(ME);

      // And it confirms rather than contradicts.
      revalidation.flush({ ...cachedUser });
      await new Promise((resolve) => setTimeout(resolve, 0));
      http.expectOne(`${API_BASE_URL}/api/auth/csrf`).flush({ csrf_token: 'test-token' });

      expect(auth.isAuthenticated()).toBe(true);
    });

    it('forgets a session the server says is over', async () => {
      // The cache is trusted for the first paint only. Here the server
      // disagrees, so the memory goes with the session.
      seedCache();

      await auth.initialize();
      expect(auth.isAuthenticated()).toBe(true);

      http.expectOne(ME).flush(
        { detail: 'Not authenticated' },
        { status: 401, statusText: 'Unauthorized' },
      );

      // No refresh is tried here: a known session's 401 has already been through
      // the interceptor's own refresh attempt in the real app (this TestBed wires
      // no interceptors, so none fires at all). Repeating it would present a
      // rotated token as a replay.
      http.expectNone(REFRESH);

      await new Promise((resolve) => setTimeout(resolve, 0));
      http.expectOne(`${API_BASE_URL}/api/auth/csrf`).flush({ csrf_token: 'test-token' });

      expect(auth.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(SESSION_CACHE_KEY)).toBeNull();
    });

    it('ignores a corrupt entry rather than signing anybody in from it', async () => {
      localStorage.setItem(SESSION_CACHE_KEY, 'half-written{{{');

      await auth.initialize();

      // Reads as no memory: the ordinary signed-out path, with no request.
      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.initialized()).toBe(true);
      expect(localStorage.getItem(SESSION_CACHE_KEY)).toBeNull();
      http.verify();
    });
  });
});
