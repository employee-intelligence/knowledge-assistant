import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Observable, catchError, firstValueFrom, map, of, switchMap, tap } from 'rxjs';

import { ConfigService } from '../config.service';
import {
  LoginRequestDto,
  RegisterRequestDto,
  Role,
  TokenResponseDto,
  UserDto,
} from '../models/auth.model';

/**
 * Where the access token lives. `localStorage` rather than a cookie on purpose:
 * this backend answers `POST /auth/login` with a Bearer token and expects it back
 * in an `Authorization` header, so there is no cookie to hold and nothing for the
 * browser to attach on its own. The interceptor reads this back for every call.
 */
const ACCESS_TOKEN_KEY = 'ika.access_token';

/**
 * Where the app stands on authentication, which is not the same as not being signed
 * in.
 *
 * `unknown` is the honest answer between page load and the first `GET /auth/me`
 * returning, and it exists so a guard can wait rather than guess. Guessing would
 * either flash the sign-in screen at somebody who is signed in, or let a signed-out
 * visitor see a frame of the dashboard before it decided to redirect.
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

/**
 * Who is signed in.
 *
 * The token lives in `localStorage` and the user in a signal, so the guards, the
 * header and the role-gated views all react to the same single value rather than
 * each holding a copy that can disagree. There is no refresh endpoint on this
 * backend: when the token stops working the next call comes back 401 and the
 * interceptor sends the person to sign in again.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly config = inject(ConfigService);

  private get baseUrl(): string {
    return this.config.getApiBaseUrl();
  }

  private readonly userState = signal<UserDto | null>(null);
  private readonly statusState = signal<AuthStatus>('unknown');

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
   * An administrator lands on the user list, because their job starts there. A
   * staff member or intern lands on the assistant, which is the whole of what
   * they can see.
   */
  readonly landingPath = computed(() => (this.isAdmin() ? '/admin' : '/'));

  /**
   * A readable name for the header. The backend stores no display name, so this
   * is the part of the address before the `@`.
   */
  readonly displayName = computed(() => {
    const email = this.userState()?.email ?? '';
    const local = email.split('@')[0] ?? '';
    return local || email;
  });

  /**
   * The one `GET /auth/me` per app load, however many callers ask for it.
   *
   * Shared as a promise rather than left to each caller: the route guard and the
   * app shell both need to know, and two calls could disagree if one landed before
   * sign-in and the other after it.
   */
  private bootstrapPromise: Promise<UserDto | null> | null = null;

  /**
   * Whether the question can even be asked here.
   *
   * False during a server render. The token lives in `localStorage`, which only
   * exists in the browser, so there is no question to answer there.
   */
  isBrowserOnly(): boolean {
    return this.isBrowser;
  }

  /**
   * The token to send, or null when there is none to send.
   *
   * Null on the server, where `localStorage` does not exist: reading it there
   * would throw rather than answer.
   */
  getToken(): string | null {
    if (!this.isBrowser) {
      return null;
    }

    try {
      return localStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Whether this browser looks like it has a session, judged without a request.
   *
   * Reads the stored token and nothing else. It proves nothing on its own — a
   * token can be expired — so the answer here is only ever "worth asking", never
   * "signed in".
   */
  looksSignedIn(): boolean {
    return this.getToken() !== null;
  }

  /**
   * Settles the session, asking the backend only if it looks worth asking.
   *
   * The entry point the guards use. When there is no token the answer is
   * "signed out" with no network call at all — which is the ordinary case on the
   * signed-out screens, and why those screens never see a failed `/auth/me`.
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
   * Finds out who is signed in, once, by asking.
   *
   * Does nothing without a token and nothing on the server: both are cases where
   * the answer is already known and asking would only produce a failure.
   */
  bootstrap(): Promise<UserDto | null> {
    if (this.bootstrapPromise) {
      return this.bootstrapPromise;
    }

    if (!this.isBrowser || !this.looksSignedIn()) {
      return Promise.resolve(null);
    }

    this.bootstrapPromise = firstValueFrom(
      this.http.get<UserDto>(`${this.baseUrl}/auth/me`).pipe(
        tap((user) => this.setUser(user)),
        catchError(() => {
          // An expired or revoked token answers 401 here. It is forgotten rather
          // than kept: holding onto a dead token would make every later call fail
          // the same way instead of sending the person to sign in once.
          this.forgetToken();
          this.setUser(null);
          return of(null);
        }),
      ),
    );

    return this.bootstrapPromise;
  }

  /**
   * `POST /auth/login`.
   *
   * The backend answers with a token, not a user, so the user is fetched right
   * after with it. What the caller gets is still the user: holding the token is
   * this service's job, not the form's.
   */
  login(email: string, password: string): Observable<UserDto> {
    const body: LoginRequestDto = { email: email.trim(), password };

    return this.http.post<TokenResponseDto>(`${this.baseUrl}/auth/login`, body).pipe(
      tap((response) => this.rememberToken(response.access_token)),
      switchMap(() => this.fetchMe()),
    );
  }

  /**
   * `POST /auth/register`, then straight into a sign-in with the same password.
   *
   * Registration answers with the account but no token, so without the second
   * call the person would register and then be asked to sign in with the
   * credentials they just typed. The role is the backend's default (`staff`):
   * choosing one here would let a stranger grant themselves `admin`.
   */
  register(email: string, password: string): Observable<UserDto> {
    const body: RegisterRequestDto = { email: email.trim(), password };

    return this.http.post(`${this.baseUrl}/auth/register`, body).pipe(
      switchMap(() => this.login(email, password)),
    );
  }

  /**
   * Signs out locally.
   *
   * There is no logout endpoint on this backend — a Bearer token cannot be taken
   * back server-side — so forgetting the token here is the whole of signing out.
   * The local session is ended even if anything else failed: the user asked to
   * sign out, and leaving them apparently signed in would be the worse answer.
   */
  logout(): Observable<void> {
    this.forgetToken();
    this.setUser(null);
    return of(undefined);
  }

  /** Forgets the current user without touching the server. */
  clear(): void {
    this.forgetToken();
    this.setUser(null);
  }

  /**
   * Marks the session gone.
   *
   * The bootstrap promise is cleared as well as the user: it resolved to "signed
   * out", and holding onto that answer would make the next guard that asks bounce
   * straight to the sign-in screen without ever re-checking a token that may since
   * have arrived.
   */
  private setUser(user: UserDto | null): void {
    this.userState.set(user);
    this.statusState.set(user ? 'authenticated' : 'anonymous');

    if (!user) {
      this.bootstrapPromise = null;
    }
  }

  /** `GET /auth/me`, and records who it names. */
  private fetchMe(): Observable<UserDto> {
    return this.http
      .get<UserDto>(`${this.baseUrl}/auth/me`)
      .pipe(tap((user) => this.setUser(user)));
  }

  /** Keeps the token where the interceptor can find it. */
  private rememberToken(token: string): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, token);
    } catch {
      // Storage may be unavailable in private modes. The sign-in still succeeded;
      // the session simply will not survive a reload.
    }
  }

  /** Drops the token, so no later call can send it. */
  private forgetToken(): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    } catch {
      // Nothing useful to do: the point was to forget, and there is nowhere the
      // forgetting itself can be reported to.
    }
  }
}
