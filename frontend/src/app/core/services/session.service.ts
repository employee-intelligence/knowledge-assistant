import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, tap, throwError } from 'rxjs';

import { toDateBucket, type DateBucket } from '../../shared/utils/format-date.util';
import { ApiError, ApiService } from './api.service';
import { Session } from '../models/session.model';

/** List headings, in the order they are shown. */
const BUCKET_ORDER: DateBucket[] = ['Recent', 'Old'];

/** A run of sessions sharing one date heading. */
export interface SessionGroup {
  bucket: DateBucket;
  conversations: Session[];
}

const SESSIONS_STORAGE_KEY = 'ika.sessions';

/**
 * Single source of truth for the sessions this browser has, and for the one
 * that is open. The sidebar, the sessions view and the thread all read from
 * here, so a session can never be listed in one place and missing from another.
 *
 * Two things are worth knowing about how the state is held:
 *
 * - This backend has no "list sessions" endpoint, so the list is the sessions
 *   this browser started, remembered in `localStorage`. A reload shows the same
 *   list the last visit left.
 * - The messages of the open session live in `ChatService`, which fetches them
 *   from `GET /history/{session_id}`. This service holds the list and the
 *   search, never the thread.
 *
 * A session is never expired, retired or swapped out from under the user.
 * Asking a follow-up extends the session it belongs to, and a session keeps its
 * id for as long as it exists.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(ApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly sessionsState = signal<Session[]>([]);
  private readonly activeIdState = signal<string | null>(null);
  private readonly searchTermState = signal('');
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  /** Every session this browser has started, newest first. */
  readonly conversations = computed(() =>
    [...this.sessionsState()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );

  /** The open session's id, or null when none is open. */
  readonly activeId = this.activeIdState.asReadonly();

  /** The open session, as the sidebar and the header name it. */
  readonly activeSession = computed(
    () => this.sessionsState().find((item) => item.id === this.activeIdState()) ?? null,
  );

  /** Sessions matching the search term. */
  readonly filteredConversations = computed(() => {
    const term = this.searchTermState().trim().toLowerCase();

    if (!term) {
      return this.conversations();
    }

    return this.conversations().filter((session) =>
      (session.title ?? '').toLowerCase().includes(term),
    );
  });

  /**
   * Filtered sessions grouped into the two list headings, always `Recent`
   * first so a search that only matches old sessions does not reorder them.
   */
  readonly groups = computed<SessionGroup[]>(() => {
    const grouped = new Map<DateBucket, Session[]>();

    for (const session of this.filteredConversations()) {
      const bucket = toDateBucket(session.updatedAt);
      grouped.set(bucket, [...(grouped.get(bucket) ?? []), session]);
    }

    return BUCKET_ORDER.filter((bucket) => grouped.has(bucket)).map((bucket) => ({
      bucket,
      conversations: grouped.get(bucket) ?? [],
    }));
  });

  /** True when this browser has at least one session. */
  readonly hasConversations = computed(() => this.sessionsState().length > 0);

  /** True when a search is active and matched nothing. */
  readonly hasNoResults = computed(
    () => this.searchTermState().trim().length > 0 && this.filteredConversations().length === 0,
  );

  readonly searchTerm = this.searchTermState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  constructor() {
    this.loadFromStorage();
  }

  /** Updates the search term the list and the sidebar filter by. */
  setSearchTerm(value: string): void {
    this.searchTermState.set(value);
  }

  /** Marks a session open. The thread itself is loaded by `ChatService`. */
  setActiveId(id: string | null): void {
    this.activeIdState.set(id);
  }

  /**
   * Opens a session on the backend and remembers it locally.
   *
   * The remembered row starts untitled: the backend names nothing, so the list
   * shows a neutral label until the first exchange arrives and the thread names
   * it after the question that started it.
   */
  create(): Observable<Session> {
    this.loadingState.set(true);
    this.errorState.set(null);

    return this.api.createSession().pipe(
      map((response) => {
        const session: Session = {
          id: response.session_id,
          title: null,
          updatedAt: new Date().toISOString(),
        };
        this.sessionsState.update((sessions) => [session, ...sessions]);
        this.saveToStorage();
        return session;
      }),
      tap({
        next: () => this.loadingState.set(false),
        error: (error: unknown) => {
          this.loadingState.set(false);
          const apiError =
            error instanceof ApiError ? error : new ApiError('Could not start a session.', 0, true);
          this.errorState.set(apiError.message);
        },
      }),
      catchError((error: unknown) => throwError(() => error)),
    );
  }

  /** Gets a session by id from the remembered list. */
  getSession(id: string): Session | undefined {
    return this.sessionsState().find((session) => session.id === id);
  }

  /** Moves a session to the top of the list after activity in it. */
  touch(id: string): void {
    this.sessionsState.update((sessions) =>
      sessions.map((session) =>
        session.id === id ? { ...session, updatedAt: new Date().toISOString() } : session,
      ),
    );
    this.saveToStorage();
  }

  /** Names a session, usually after its first question. */
  updateTitle(id: string, title: string): void {
    this.sessionsState.update((sessions) =>
      sessions.map((session) => (session.id === id ? { ...session, title } : session)),
    );
    this.saveToStorage();
  }

  /** Loads the remembered list. Runs in the constructor, never from a view. */
  private loadFromStorage(): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      const stored = localStorage.getItem(SESSIONS_STORAGE_KEY);

      if (stored) {
        const sessions = JSON.parse(stored) as Session[];
        this.sessionsState.set(Array.isArray(sessions) ? sessions : []);
      }
    } catch {
      // A corrupt entry is forgotten rather than repaired: the sessions it named
      // still exist on the backend and reappear the next time each is opened.
      this.sessionsState.set([]);
    }
  }

  /** Persists the list. Failures are swallowed: the list is a convenience and a
   * full `localStorage` is not worth an error over. */
  private saveToStorage(): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(this.sessionsState()));
    } catch {
      // Ignore quota errors.
    }
  }
}
