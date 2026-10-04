import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Observable, catchError, firstValueFrom, map, of, tap } from 'rxjs';

import { API_BASE_URL } from '../api.config';
import { LoginRequestDto, LoginResponseDto, RegisterRequestDto, RegisterResponseDto, Role, UserDto } from '../models/auth.model';

/** Name of the CSRF cookie, which is the one cookie this app is allowed to read. */
const CSRF_COOKIE = 'ika_csrf';

/**
 * Name of the readable flag saying "this browser probably has a session".
 */
const SESSION_HINT_COOKIE = 'ika_session';

/** Header the CSRF cookie's value has to come back in. */
export const CSRF_HEADER = 'X-CSRF-Token';

/**
 * Where the app stands on authentication.
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

/**
 * Who is signed in, and the four things that can change it.
 *
 * The session itself lives entirely in `httpOnly` cookies. This service cannot read
 * a token, cannot put one in storage, and has no expiry to track.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

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
   */
  readonly landingPath = computed(() => (this.isAdmin() ? '/admin' : '/'));

  private bootstrapPromise: Promise<UserDto | null> | null = null;

  /** Whether the question can even be asked here. */
  isBrowserOnly(): boolean {
    return this.isBrowser;
  }

  /**
   * Whether this browser looks like it has a session, judged without a request.
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
   */
  async maybeBootstrap(): Promise<UserDto | null> {
    if (!this.looksSignedIn()) {
      if (this.statusState() === 'unknown') {
        this.statusState.set('anonymous');
      }
      return null;
    }
    return this.bootstrap();
  }

  /**
   * Finds out who is signed in, once, by asking.
   */
  bootstrap(): Promise<UserDto | null> {
    if (this.bootstrapPromise) {
      return this.bootstrapPromise;
    }

    if (!this.isBrowser) {
      return Promise.resolve(null);
    }

    this.bootstrapPromise = firstValueFrom(
      this.http.get<UserDto>(`${API_BASE_URL}/auth/me`, this.credentials()).pipe(
        tap((user) => this.setUser(user)),
        catchError(() => {
          this.setUser(null);
          return of(null);
        }),
      ),
    ).then((user) => {
      this.loadCsrfToken();
      return user;
    });

    return this.bootstrapPromise;
  }

  /** `POST /auth/login`. */
  login(email: string, password: string): Observable<UserDto> {
    const body: LoginRequestDto = { email: email.trim(), password };

    return this.http
      .post<LoginResponseDto>(`${API_BASE_URL}/auth/login`, body, this.credentials())
      .pipe(
        map((response) => response.user),
        tap((user) => {
          this.setUser(user);
          this.loadCsrfToken();
        }),
      );
  }

  /** `POST /auth/register`. */
  register(name: string, email: string, password: string): Observable<UserDto> {
    const body: RegisterRequestDto = { name: name.trim(), email: email.trim(), password };

    return this.http
      .post<RegisterResponseDto>(`${API_BASE_URL}/auth/register`, body, this.credentials())
      .pipe(
        map((response) => response.user),
        tap((user) => {
          this.setUser(user);
          this.loadCsrfToken();
        }),
      );
  }

  /** `POST /auth/logout`. Ends the session server-side, then locally. */
  logout(): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/auth/logout`, {}, this.credentials()).pipe(
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

  private setUser(user: UserDto | null): void {
    this.userState.set(user);
    this.statusState.set(user ? 'authenticated' : 'anonymous');

    if (!user) {
      this.bootstrapPromise = null;
    }
  }

  private loadCsrfToken(): void {
    if (!this.isBrowser) {
      return;
    }

    this.http.get<{ csrf_token: string }>(`${API_BASE_URL}/auth/csrf`, this.credentials()).subscribe({
      error: () => undefined,
    });
  }

  private credentials(): { withCredentials: boolean } {
    return { withCredentials: true };
  }
}