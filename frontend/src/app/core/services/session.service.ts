import { inject, Injectable, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { ApiError, ApiService } from './api.service';
import { Message, Session, SessionThread, UNTITLED_SESSION } from '../models/session.model';
import { AuthService } from './auth.service';

const SESSIONS_STORAGE_KEY = 'ika.sessions';

/**
 * Manages the list of sessions this browser owns.
 *
 * The list is a signal so the sidebar and any view can react to the same value.
 * Since the backend doesn't have a "list sessions" endpoint, we store session
 * metadata locally and sync with the backend when needed.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private readonly sessionsState = signal<Session[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly sessions = this.sessionsState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  constructor() {
    this.loadFromStorage();
  }

  /** Loads sessions from localStorage. */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (stored) {
        const sessions = JSON.parse(stored) as Session[];
        this.sessionsState.set(sessions);
      }
    } catch {
      // Ignore parse errors
    }
  }

  /** Saves sessions to localStorage. */
  private saveToStorage(): void {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(this.sessionsState()));
    } catch {
      // Ignore quota errors
    }
  }

  /** Creates a new session and adds it to the list. */
  create(): Observable<Session> {
    return this.api.createSession().pipe(
      map((response) => {
        const session: Session = {
          id: response.session_id,
          title: UNTITLED_SESSION,
          updatedAt: new Date().toISOString(),
        };
        this.sessionsState.update((sessions) => [session, ...sessions]);
        this.saveToStorage();
        return session;
      }),
      catchError((error: unknown) => {
        const apiError = error instanceof ApiError ? error : new ApiError('Failed to create session', 0, true);
        this.errorState.set(apiError.message);
        throw error;
      }),
    );
  }

  /** Gets a session by ID from the loaded list. */
  getSession(id: string): Session | undefined {
    return this.sessionsState().find((s) => s.id === id);
  }

  /** Deletes a session from the list. */
  delete(id: string): void {
    this.sessionsState.update((sessions) => sessions.filter((s) => s.id !== id));
    this.saveToStorage();
  }

  /** Updates a session's title. */
  updateTitle(id: string, title: string): void {
    this.sessionsState.update((sessions) =>
      sessions.map((s) => (s.id === id ? { ...s, title } : s)),
    );
    this.saveToStorage();
  }

  /** Updates a session's updatedAt timestamp. */
  touch(id: string): void {
    this.sessionsState.update((sessions) =>
      sessions.map((s) => (s.id === id ? { ...s, updatedAt: new Date().toISOString() } : s)),
    );
    this.saveToStorage();
  }
}