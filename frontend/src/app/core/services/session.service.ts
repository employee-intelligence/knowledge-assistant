import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, map, of, shareReplay, tap } from 'rxjs';

import { SESSION_STORAGE_KEY } from '../api.config';
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
  private readonly expiredState = signal(false);

  /** In-flight creation, shared so concurrent callers get the same session. */
  private pending: Observable<string> | null = null;

  /** The open session's id, or null before one exists. */
  readonly sessionId = this.sessionIdState.asReadonly();

  /**
   * True when a session this browser was using is gone and its history with it.
   *
   * Kept as its own signal rather than inferred from a missing id, because "no
   * session yet" and "the session expired" call for different things on screen:
   * the first is a new conversation waiting for a question, the second is an
   * explanation the user needs before they can ask again.
   */
  readonly sessionExpired = this.expiredState.asReadonly();

  constructor() {
    if (this.isBrowser) {
      this.restore();
    }
  }

  /**
   * The current session id, creating one only when there is genuinely none.
   *
   * A session is kept for the life of the conversation and is not swapped out
   * because it is approaching expiry. Retiring one early would silently move the
   * conversation to a new session, and the history it had, which the backend
   * scopes by session id, would disappear mid-thread. Instead the session is used
   * until the backend rejects it, and that rejection is reported as an expiry.
   */
  ensureSession(): Observable<string> {
    const current = this.sessionIdState();

    if (current) {
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
   * Starts a new conversation.
   *
   * The current session is retired so the next question opens a fresh one, which
   * is what makes "New Conversation" mean a clean thread rather than the same
   * session with the view pointed back at its first turn. The expiry notice is
   * cleared with it, so a new conversation is not born showing a warning about
   * the session it just replaced.
   */
  startNew(): void {
    this.expiredState.set(false);
    this.clear();
  }

  /**
   * Reports that the backend no longer recognises the session.
   *
   * Only a rejection counts. A session that is merely close to expiry is still
   * usable, and treating it as lost would throw away a conversation that was
   * about to work. A 5xx or a timeout says nothing about the session and leaves
   * it open, so the failed question stays worth retrying against it.
   */
  handleSessionLoss(error: unknown): void {
    if (error instanceof ApiError && error.isSessionLost) {
      this.expire();
    }
  }

  /**
   * Retires a session the backend has dropped.
   *
   * The stored copy goes with it, so a reload starts a clean conversation rather
   * than trying the same dead id again.
   */
  private expire(): void {
    this.expiredState.set(true);
    this.clear();
  }

  /** Stores a freshly created session and returns its id. */
  private adopt(response: SessionCreateResponse): string {
    const expiresAt = new Date(parseUtcTimestamp(response.expires_at)).getTime();

    this.expiredState.set(false);
    this.sessionIdState.set(response.session_id);
    this.expiresAtState.set(expiresAt);
    this.persist({ id: response.session_id, expiresAt });

    return response.session_id;
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

  /**
   * Rehydrates the session from storage, discarding one that is already stale.
   *
   * A stored session past its expiry is reported as expired rather than dropped
   * in silence: the backend deletes an expired session, so the conversation this
   * browser remembers is genuinely gone and the user is told why it is empty
   * instead of being shown a "question not found" page for a question they can
   * see the title of in the sidebar.
   */
  private restore(): void {
    let stored: StoredSession | null = null;

    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);

      stored = raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return;
    }

    if (!stored?.id) {
      this.clear();
      return;
    }

    if (stored.expiresAt <= Date.now()) {
      this.expire();
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
