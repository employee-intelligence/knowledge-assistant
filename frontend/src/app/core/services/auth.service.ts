import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Observable, catchError, firstValueFrom, from, map, of, tap } from 'rxjs';

import { API_BASE_URL } from '../api.config';
import {
  AccessRequestDecisionDto,
  CreateAccountRequestDto,
  AccessRequestDecisionRequestDto,
  AccessRequestDto,
  AccessRequestListDto,
  AccessRequestSubmittedDto,
} from '../models/access-request.model';
import {
  AcceptInviteRequestDto,
  CsrfResponseDto,
  InvitePreviewDto,
  InviteRequestDto,
  InviteResponseDto,
  LoginRequestDto,
  Role,
  UserDto,
  UserResponseDto,
} from '../models/auth.model';

/** Name of the CSRF cookie, which is the one cookie this app is allowed to read. */
const CSRF_COOKIE = 'ika_csrf';

/**
 * Name of the readable flag saying "this browser probably has a session".
 *
 * Set by the backend next to the session cookies, carrying nothing of value and
 * carrying no token. It exists so this app can tell, without a round trip, whether
 * asking who somebody is is worth doing.
 */
const SESSION_HINT_COOKIE = 'ika_session';

/** Header the CSRF cookie's value has to come back in. */
export const CSRF_HEADER = 'X-CSRF-Token';

/**
 * Where this browser's memory of who signed in is kept.
 *
 * The session cookies live on the API's host and this page cannot read them: on a
 * split deployment (app on one host, API on another) even the `ika_session` hint
 * cookie is invisible to frontend JavaScript, because it is a host-only cookie of
 * the API's host. Without a memory of its own, every refresh settles as "nobody"
 * and the guards send a signed-in person to the sign-in screen.
 *
 * What is stored is the user the server last confirmed — no token, nothing the
 * server does not already hand out. It is a hint, not a credential: it is
 * revalidated against `GET /api/auth/me` on the next load, and anything it says
 * is dropped the moment the server disagrees. Versioned so a future shape change
 * fails closed (unknown shape reads as "no memory") rather than half-parsed.
 */
const SESSION_CACHE_KEY = 'ika.session.v1';

/**
 * Where the app stands on authentication, which is not the same as not being signed
 * in.
 *
 * `unknown` is the honest answer between page load and the first `GET /api/auth/me`
 * returning, and it exists so a guard can wait rather than guess. Guessing would
 * either flash the sign-in screen at somebody who is signed in, or let a signed-out
 * visitor see a frame of the dashboard before it decided to redirect.
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

/**
 * Who is signed in, and the four things that can change it.
 *
 * The session itself lives entirely in `httpOnly` cookies. This service cannot read
 * a token, cannot put one in storage, and has no expiry to track — which is why
 * there is no countdown to a silent refresh anywhere in the app. When the access
 * token runs out, the next request comes back 401, and `authInterceptor` handles
 * that by refreshing and replaying. That is less clever than scheduling a refresh
 * against a known expiry, and it is the only option that works without the token
 * ever being visible to this code.
 *
 * `user` is a signal so the guards, the sidebar and the role-gated views all react
 * to the same single value rather than each holding a copy that can disagree.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly userState = signal<UserDto | null>(null);
  private readonly statusState = signal<AuthStatus>('unknown');

  /**
   * Whether the one startup auth check has settled.
   *
   * Separate from "is somebody signed in" on purpose. `status` starts as
   * `unknown`, which cannot tell "not checked yet" apart from "checked and
   * nobody is there" to a reader that only looks at `isAuthenticated()` — and a
   * guard that reads that during the first `GET /api/auth/me` sees "no user yet"
   * and sends a signed-in person to the sign-in screen, only for the answer to
   * land a moment later and send them back. That round trip is the refresh flash:
   * a race, not a refusal. Nothing may decide on the session until this is true.
   */
  private readonly initializedState = signal(false);

  /**
   * The startup check, shared so every waiter queues behind the same request.
   *
   * One promise however many callers: the app initializer starts it and each
   * guard awaits it, and a second `GET /api/auth/me` would be a second chance
   * for the answers to disagree.
   */
  private initPromise: Promise<void> | null = null;

  /** The signed-in person, or null. */
  readonly user = this.userState.asReadonly();

  /** Where the app stands on authentication. */
  readonly status = this.statusState.asReadonly();

  /** Whether somebody is signed in and the backend has confirmed it. */
  readonly isAuthenticated = computed(() => this.statusState() === 'authenticated');

  /** Whether the signed-in person may reach the admin-only routes. */
  readonly isAdmin = computed(() => this.userState()?.role === 'admin');

  /**
   * Where somebody lands after signing in, which depends on their role.
   *
   * An administrator lands on the dashboard, because their job starts there. An
   * employee lands on the assistant, which is the whole of what they can see.
   *
   * Held here rather than decided at each call site, because there are four of them
   * — sign-in, accepting an invitation, the guest guard and the sign-out path — and
   * four copies of "where does this person go" is four chances for an administrator
   * to be dropped into a chat screen instead.
   */
  readonly landingPath = computed(() => (this.isAdmin() ? '/admin' : '/'));

  /**
   * Whether the startup auth check has settled. False from page load until the
   * single `GET /api/auth/me` (or the decision that none is needed) resolves.
   *
   * Guards wait on this rather than reading `isAuthenticated()` directly, and
   * the shell shows a loading state while it is false, so neither the sign-in
   * screen nor a protected page renders on a guess.
   */
  readonly initialized = this.initializedState.asReadonly();

  /**
   * The one `GET /api/auth/me` per app load, however many callers ask for it.
   *
   * Shared as a promise rather than left to each caller: the route guard and the
   * app shell both need to know, and two calls could disagree if one landed before
   * sign-in and the other after it.
   */
  private bootstrapPromise: Promise<UserDto | null> | null = null;

  /** The in-flight refresh, shared so concurrent 401s cause one refresh, not several. */
  private refreshPromise: Promise<UserDto | null> | null = null;

  /**
   * Whether the question can even be asked here.
   *
   * False during a server render. The session lives in cookies the browser holds, so
   * there is nothing to check on the server and any answer would be a guess.
   */
  isBrowserOnly(): boolean {
    return this.isBrowser;
  }

  /**
   * Whether this browser looks like it has a session, judged without a request.
   *
   * Reads the readable hint cookie the backend sets beside the session cookies. It
   * proves nothing on its own — it is a flag, not a credential — so the answer here
   * is only ever "worth asking", never "signed in".
   *
   * Why this exists: without it, every signed-out visit to the sign-in screen had to
   * call `GET /api/auth/me` in order to be told it was not signed in. That is a
   * request for somebody's user details, made by somebody who has not signed in,
   * before they have signed in — and it failed, noisily, on the page least likely
   * to want a failure.
   */
  looksSignedIn(): boolean {
    if (!this.isBrowser) {
      return false;
    }

    return document.cookie
      .split(';')
      .some((pair) => pair.trim().startsWith(`${SESSION_HINT_COOKIE}=`));
  }

  /**
   * Settles the session, asking the backend only if it looks worth asking.
   *
   * The entry point the guards use. When there is no hint cookie the answer is
   * "signed out" with no network call at all, which is the ordinary case on the
   * signed-out screens and the reason those screens no longer talk to the API.
   *
   * When there is a hint — a returning visitor, or somebody who has just signed in
   * and had their session rotated — it asks, because at that point the answer
   * changes what gets rendered and there is no way to know it locally.
   */
  async maybeBootstrap(): Promise<UserDto | null> {
    if (!this.looksSignedIn()) {
      // Recorded rather than left unknown, so a guard waiting on this does not wait
      // for an answer that is not coming.
      if (this.statusState() === 'unknown') {
        this.statusState.set('anonymous');
      }

      return null;
    }

    return this.bootstrap();
  }

  /**
    * Runs the one startup auth check and records that it settled.
    *
    * Idempotent: the first caller starts it and every later caller — the app
    * initializer, each guard, any test — queues behind the same promise, so
    * there is exactly one `GET /api/auth/me` per page load, however many ask.
    *
    * Asked through the hint-aware path when there is no cached user, so a visitor
    * with plainly no session settles without a request, exactly as the guards
    * already did. A skipped request is not a skipped check: with no cookies there
    * is nothing `/me` could have answered with, and firing it anyway would only
    * log a 401 on every signed-out visit.
    *
    * When a previous visit cached its user, that answer is restored synchronously
    * and the check is the background revalidation rather than a blocking question:
    * the guards and the shell see who signed in on the first paint, with no round
    * trip and no flash of the sign-in screen. The cache is trusted for the first
    * paint only — the revalidation replaces it with the server's live answer, and
    * a session that has since died still lands on the sign-in screen through the
    * interceptor and the guards, just without having shown it to somebody who is
    * signed in.
    *
    * Never rejects. A failed check (expired session, unreachable backend) is an
    * answer — "nobody is signed in" — not a startup failure, and rejecting here
    * would either hang the router on a promise that never settles or fail the
    * whole application boot over a session that simply is not there.
    *
    * Safe on the server: `maybeBootstrap` resolves without a request there, so
    * a server render is never held waiting on a call that could not succeed.
    */
  initialize(): Promise<void> {
    if (!this.initPromise) {
      const cached = this.restoreCachedUser();

      if (cached) {
        this.setUser(cached);
        this.initializedState.set(true);
        this.initPromise = Promise.resolve();

        // Revalidate without holding the boot: the guards and the shell already
        // have their answer. A live session stays exactly where it is; a dead one
        // is cleared here and the guards move the person to the sign-in screen.
        void this.bootstrap().then(
          () => undefined,
          () => undefined,
        );

        return this.initPromise;
      }

      // Chained rather than `void …finally` on purpose: awaiting this promise
      // means the check has settled AND the flag says so. Resolving first and
      // setting the flag a microtask later lets the router navigate on a promise
      // that says "done" while the shell still says "checking".
      this.initPromise = this.maybeBootstrap()
        .then(
          () => undefined,
          () => undefined,
        )
        .finally(() => {
          this.initializedState.set(true);
        });
    }

    return this.initPromise;
  }

  /**
   * Resolves once the startup auth check has settled, starting it if needed.
   *
   * The guards call this before deciding anything. In production the app
   * initializer has already started (usually finished) the check, so this is
   * free; anywhere the initializer did not run — tests, a future entry point —
   * this starts the check rather than hanging on one that never will.
   */
  whenInitialized(): Promise<void> {
    if (this.initializedState()) {
      return Promise.resolve();
    }

    return this.initialize();
  }

  /**
    * Finds out who is signed in, once, by asking.
    *
    * Prefers `maybeBootstrap`, which skips the request when there is plainly no
    * session. Shared as a promise rather than left to each caller: the route guard
    * and the app shell both need to know, and two calls could disagree if one landed
    * before sign-in and the other after it.
    *
    * A 401 here is not always "signed out": the access token lives fifteen minutes
    * and the refresh token fourteen days, so a refresh hours after the last click
    * routinely meets a dead access token beside a live refresh token. When nobody
    * is known to be signed in yet — the ordinary refresh case, status still
    * `unknown` — one refresh is attempted before concluding the session is over.
    * When somebody already is (the cached-user revalidation), the interceptor has
    * already had its own refresh attempt at that same 401, so trying again would
    * present a rotated token as a replay and revoke the whole family: the 401
    * stands as the answer.
    *
    * Does nothing on the server. The session is a pair of cookies in the browser and
    * a server render has neither them nor the `document` the hint is read out of, so
    * there is no question to answer there — only a round trip that could not succeed
    * anyway. The guards treat that as "defer to the browser".
    */
  bootstrap(): Promise<UserDto | null> {
    if (this.bootstrapPromise) {
      return this.bootstrapPromise;
    }

    if (!this.isBrowser) {
      return Promise.resolve(null);
    }

    const alreadyKnown = this.isAuthenticated();

    this.bootstrapPromise = firstValueFrom(
      this.http.get<UserDto>(`${API_BASE_URL}/api/auth/me`, this.credentials()).pipe(
        tap((user) => this.setUser(user)),
        catchError(() => {
          if (alreadyKnown) {
            // The interceptor has already tried its refresh at this 401 (see
            // above): repeating it here would look like token replay.
            this.setUser(null);
            return of(null);
          }

          // The access token may simply have expired while the refresh token is
          // still good. `refresh()` sets the user itself on either outcome, so
          // there is nothing further to record here.
          return from(this.refresh());
        }),
      ),
    ).then((user) => {
      // The CSRF token is fetched whether or not anybody is signed in: the sign-in
      // and accept-invite forms are exempt from the check server-side, but every
      // later state-changing request needs one, and issuing it now means the first
      // question asked after signing in does not have to wait for it.
      this.loadCsrfToken();

      return user;
    });

    return this.bootstrapPromise;
  }

  /** `POST /api/auth/login`. */
  login(email: string, password: string): Observable<UserDto> {
    const body: LoginRequestDto = { email: email.trim(), password };

    return this.http
      .post<UserResponseDto>(`${API_BASE_URL}/api/auth/login`, body, this.credentials())
      .pipe(
        map((response) => response.user),
        tap((user) => {
          this.setUser(user);
          // Sign-in rotates the CSRF cookie server-side, so the one held here is no
          // longer the one the server expects.
          this.loadCsrfToken();
        }),
      );
  }

  /** `GET /api/auth/invite/{token}`. Used to pre-fill the accept screen. */
  previewInvite(token: string): Observable<InvitePreviewDto> {
    return this.http.get<InvitePreviewDto>(
      `${API_BASE_URL}/api/auth/invite/${encodeURIComponent(token)}`,
      this.credentials(),
    );
  }

  /** `POST /api/auth/accept-invite`. Sets the password and signs the person in. */
  acceptInvite(token: string, password: string): Observable<UserDto> {
    const body: AcceptInviteRequestDto = { token, password };

    return this.http
      .post<UserResponseDto>(`${API_BASE_URL}/api/auth/accept-invite`, body, this.credentials())
      .pipe(
        map((response) => response.user),
        tap((user) => {
          this.setUser(user);
          this.loadCsrfToken();
        }),
      );
  }

  /**
   * `POST /api/auth/request-access`. Registers with a password, pending approval.
   *
   * Creates a request and nothing else: no account exists until somebody approves
   * one, so nothing here can sign in yet. Approval moves the password onto the
   * new account and activates it. That is what makes this safe to leave open,
   * where a plain registration form would let anyone who could type a colleague's
   * address claim it.
   *
   * A CSRF header is attached to it by the interceptor, unlike signing in. There is
   * nothing here that needs an exemption — the token comes from a public endpoint and
   * the frontend has one before this screen is reachable — so requiring it costs
   * nothing and closes a way to fill an administrator's queue from another site.
   */
  requestAccess(name: string, email: string, password: string): Observable<AccessRequestSubmittedDto> {
    const body: AccessRequestDto = { name: name.trim(), email: email.trim(), password };

    return this.http.post<AccessRequestSubmittedDto>(
      `${API_BASE_URL}/api/auth/request-access`,
      body,
      this.credentials(),
    );
  }

  /**
   * `POST /api/auth/invite`. Administrators only.
   *
   * Returns the link rather than sending anything: there is no mail service, so the
   * link is the deliverable and whoever holds it passes it on. See the admin invite
   * screen for what that means in practice.
   */
  invite(name: string, email: string, role: Role): Observable<InviteResponseDto> {
    const body: InviteRequestDto = { name: name.trim(), email: email.trim(), role };

    return this.http.post<InviteResponseDto>(
      `${API_BASE_URL}/api/auth/invite`,
      body,
      this.credentials(),
    );
  }

  /**
   * `POST /api/auth/accounts`. Administrators only.
   *
   * Creates the account outright, with a password chosen here rather than one the
   * person sets for themselves. That is what makes it the only flow available when
   * there is no mail service to deliver an invitation with, and it is the weaker of
   * the two: from this point the administrator knows the password and could sign in
   * as the person they created. The role is decided here and nowhere else, exactly as
   * it is for an invitation.
   */
  createAccount(name: string, email: string, role: Role, password: string): Observable<UserDto> {
    const body: CreateAccountRequestDto = { name: name.trim(), email: email.trim(), role, password };

    return this.http
      .post<UserResponseDto>(`${API_BASE_URL}/api/auth/accounts`, body, this.credentials())
      .pipe(map((response) => response.user));
  }

  /** `GET /api/auth/requests`. Administrators only. */
  listAccessRequests(): Observable<AccessRequestListDto> {
    return this.http.get<AccessRequestListDto>(
      `${API_BASE_URL}/api/auth/requests`,
      this.credentials(),
    );
  }

  /**
   * `POST /api/auth/requests/{id}/approve`. Administrators only.
   *
   * The role is decided here and nowhere else: the person who asked could not set
   * one, so this is the only place an administrator role can come into being.
   */
  approveAccessRequest(requestId: string, role: Role): Observable<AccessRequestDecisionDto> {
    const body: AccessRequestDecisionRequestDto = { role };

    return this.http.post<AccessRequestDecisionDto>(
      `${API_BASE_URL}/api/auth/requests/${encodeURIComponent(requestId)}/approve`,
      body,
      this.credentials(),
    );
  }

  /** `POST /api/auth/requests/{id}/decline`. Administrators only. */
  declineAccessRequest(requestId: string): Observable<AccessRequestDecisionDto> {
    return this.http.post<AccessRequestDecisionDto>(
      `${API_BASE_URL}/api/auth/requests/${encodeURIComponent(requestId)}/decline`,
      {},
      this.credentials(),
    );
  }

  /**
   * `POST /api/auth/refresh`. Trades the refresh cookie for a new pair.
   *
   * Returns null rather than throwing when the refresh is refused: a refresh that
   * fails means the session is over, which the caller handles by sending the person
   * to the sign-in screen, not by surfacing an error they could do anything about.
   */
  refresh(): Promise<UserDto | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = firstValueFrom(
      this.http
        .post<UserResponseDto>(`${API_BASE_URL}/api/auth/refresh`, {}, this.credentials())
        .pipe(
          map((response) => response.user),
          tap((user) => this.setUser(user)),
          catchError(() => {
            this.setUser(null);
            return of(null);
          }),
        ),
    ).finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  /** `POST /api/auth/logout`. Ends the session server-side, then locally. */
  logout(): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/api/auth/logout`, {}, this.credentials()).pipe(
      // The local session is ended even if the request failed. The user asked to
      // sign out, and leaving them apparently signed in because a network call
      // timed out would be the worse of the two answers.
      tap(() => this.setUser(null)),
      catchError(() => {
        this.setUser(null);
        return of(undefined);
      }),
      map(() => undefined),
    );
  }

  /** The CSRF token to send with a state-changing request, or null if there is none. */
  readCsrfToken(): string | null {
    if (!this.isBrowser) {
      return null;
    }

    for (const part of document.cookie.split(';')) {
      const [name, ...rest] = part.trim().split('=');

      if (name === CSRF_COOKIE) {
        return decodeURIComponent(rest.join('='));
      }
    }

    return null;
  }

  /** Forgets the current user without touching the server. */
  clear(): void {
    this.setUser(null);
  }

  /**
    * Marks the session gone.
    *
    * The bootstrap promise is cleared as well as the user: it resolved to "signed
    * out", and holding onto that answer would make the next guard that asks bounce
    * straight to the sign-in screen without ever re-checking a cookie that may since
    * have arrived.
    *
    * The cached user follows the live one in both directions: remembered on the
    * way in so the next load starts from the right answer, forgotten on the way
    * out so a signed-out browser never replays somebody into a session.
    */
  private setUser(user: UserDto | null): void {
    this.userState.set(user);
    this.statusState.set(user ? 'authenticated' : 'anonymous');

    if (user) {
      this.persistCachedUser(user);
    } else {
      this.bootstrapPromise = null;
      this.clearCachedUser();
    }
  }

  /**
    * Remembers who signed in, in this browser's own storage.
    *
    * Browser-only and failure-silent: storage can be unavailable (private modes,
    * disabled cookies-adjacent settings), and the session still works for the
    * page's lifetime without it — the next load simply checks the server instead
    * of starting from the answer.
    */
  private persistCachedUser(user: UserDto): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(user));
    } catch {
      // The session is in the cookies and works regardless; only the fast
      // restart is lost.
    }
  }

  /** Forgets the remembered user, if any. */
  private clearCachedUser(): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.removeItem(SESSION_CACHE_KEY);
    } catch {
      // Nothing to do: the entry is either gone or unreadable, both of which
      // read as "no memory".
    }
  }

  /**
    * Who the last load left signed in, if that memory parses.
    *
    * Validated rather than trusted: anything that is not exactly a user — a
    * half-write, a value from an older shape, somebody else's key — reads as no
    * memory and is dropped, so a corrupt entry can never sign anybody in, not
    * even briefly.
    */
  private restoreCachedUser(): UserDto | null {
    if (!this.isBrowser) {
      return null;
    }

    let raw: string | null = null;

    try {
      raw = localStorage.getItem(SESSION_CACHE_KEY);
    } catch {
      return null;
    }

    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<UserDto> | null;

      if (
        !parsed ||
        typeof parsed.id !== 'string' ||
        typeof parsed.name !== 'string' ||
        typeof parsed.email !== 'string' ||
        (parsed.role !== 'admin' && parsed.role !== 'employee')
      ) {
        localStorage.removeItem(SESSION_CACHE_KEY);

        return null;
      }

      return { id: parsed.id, name: parsed.name, email: parsed.email, role: parsed.role };
    } catch {
      try {
        localStorage.removeItem(SESSION_CACHE_KEY);
      } catch {
        // Already handling a corrupt entry; a storage that will not even clear
        // is simply treated as empty from here on.
      }

      return null;
    }
  }

  /**
   * Asks for a CSRF token, which arrives as the readable cookie the interceptor
   * picks it up from.
   *
   * Subscribed here rather than returned, because an `HttpClient` request is cold:
   * building one and not subscribing to it sends nothing at all. Nothing needs the
   * value — the cookie is the store, and the interceptor reads it back at the
   * moment it needs it — so a failure here is swallowed rather than surfaced.
   * Duplicating the token in memory would create a second copy of a secret that
   * exists precisely so that only the server and this cookie hold it.
   */
  private loadCsrfToken(): void {
    if (!this.isBrowser) {
      return;
    }

    this.http.get<CsrfResponseDto>(`${API_BASE_URL}/api/auth/csrf`, this.credentials()).subscribe({
      error: () => undefined,
    });
  }

  /**
   * Cookie options for every call.
   *
   * `withCredentials` is what makes a cross-origin request carry and store the
   * session cookies at all: without it the browser drops them, and sign-in appears
   * to work while leaving the app signed out on the next request.
   */
  private credentials(): { withCredentials: boolean } {
    return { withCredentials: true };
  }
}
