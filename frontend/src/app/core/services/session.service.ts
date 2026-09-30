import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, map, of, shareReplay, tap } from 'rxjs';

import { SESSION_EXPIRY_MARGIN_MS, SESSION_STORAGE_KEY } from '../api.config';
import { SessionCreateResponse, parseUtcTimestamp } from '../models/api.model';
import { ApiError, ApiService } from './api.service';

/** A session as this browser remembers it between reloads. */
interface StoredSession {
  id: string;
  expiresAt: number;
}

/**
 * Owns the conversation session: its id, when it expires, and creating a
 * replacement when the old one is gone.
 *
 * Every other endpoint is scoped by session id, so this sits underneath them all.
 * The id is kept in `sessionStorage` rather than held only in memory, because the
 * only thing that makes `/history` survive a reload is knowing which session to
 * ask about.
 *
 * Creating a session is de-duplicated: two components asking at once share one
 * request, because a second session would orphan the first one's history.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly sessionIdState = signal<string | null>(null);
  private readonly expiresAtState = signal<number | null>(null);

  /** In-flight creation, shared so concurrent callers get the same session. */
  private pending: Observable<string> | null = null;

  /** The open session's id, or null before one exists. */
  readonly sessionId = this.sessionIdState.asReadonly();

  constructor() {
    if (this.isBrowser) {
      this.restore();
    }
  }

  /**
   * The current session id, opening a new session if there is none or the stored
   * one is too close to expiry to rely on.
   */
  ensureSession(): Observable<string> {
    const current = this.sessionIdState();

    if (current && !this.isExpiringSoon()) {
      return of(current);
    }

    if (!this.pending) {
      this.pending = this.api.createSession().pipe(
        map((response) => this.adopt(response)),
        tap({
          // Cleared on both paths, so a failed create can be retried rather than
          // leaving a cached error behind forever.
          next: () => (this.pending = null),
          error: () => (this.pending = null),
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }

    return this.pending.pipe(takeUntilDestroyed(this.destroyRef));
  }

  /**
   * Reports that the backend no longer recognises the session, so the next ask
   * opens a fresh one instead of posting into a session whose history is gone.
   */
  handleSessionLoss(error: unknown): void {
    if (error instanceof ApiError && error.status === 404) {
      this.clear();
    }
  }

  /** True once a session exists and the backend will still accept requests for it. */
  get isUsable(): boolean {
    return this.sessionIdState() !== null && !this.isExpiringSoon();
  }

  /** Stores a freshly created session and returns its id. */
  private adopt(response: SessionCreateResponse): string {
    const expiresAt = new Date(parseUtcTimestamp(response.expires_at)).getTime();

    this.sessionIdState.set(response.session_id);
    this.expiresAtState.set(expiresAt);
    this.persist({ id: response.session_id, expiresAt });

    return response.session_id;
  }

  /** Retires the current session so the next ensure opens another one. */
  reset(): void {
    this.clear();
  }

  /** Drops the session and its stored copy. */
  private clear(): void {
    this.sessionIdState.set(null);
    this.expiresAtState.set(null);

    if (!this.isBrowser) {
      return;
    }

    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in private modes. Losing the id only costs the
      // conversation on reload, so it is not worth surfacing.
    }
  }

  /** True when the session is gone or close enough to expiry to be unreliable. */
  private isExpiringSoon(): boolean {
    const expiresAt = this.expiresAtState();

    return expiresAt === null || expiresAt - SESSION_EXPIRY_MARGIN_MS <= Date.now();
  }

  /** Rehydrates the session from storage, discarding one that is already stale. */
  private restore(): void {
    let stored: StoredSession | null = null;

    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);

      stored = raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return;
    }

    if (!stored?.id || stored.expiresAt - SESSION_EXPIRY_MARGIN_MS <= Date.now()) {
      this.clear();
      return;
    }

    this.sessionIdState.set(stored.id);
    this.expiresAtState.set(stored.expiresAt);
  }

  private persist(session: StoredSession): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // As above: the conversation simply will not survive a reload.
    }
  }
}
