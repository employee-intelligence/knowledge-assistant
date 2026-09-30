import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, ReplaySubject, catchError, of, switchMap } from 'rxjs';

import { toDateBucket, type DateBucket } from '../../shared/utils/format-date.util';
import { AnswerResponse } from '../models/message.model';
import { HistoryEntry } from '../models/question.model';
import { Turn } from '../models/turn.model';
import { ApiError, ApiService } from './api.service';
import { SessionService } from './session.service';

/** List headings, in the order they are shown. */
const BUCKET_ORDER: DateBucket[] = ['Recent', 'Old'];

/** A run of history entries sharing one date heading. */
export interface HistoryGroup {
  bucket: DateBucket;
  entries: HistoryEntry[];
}

/** A turn as the sidebar and history list render it. */
function toEntry(turn: Turn): HistoryEntry {
  return {
    question: {
      id: turn.id,
      title: turn.question,
      askedAt: turn.createdAt,
      answerStatus: turn.status,
      documentCount: new Set(turn.sources.map((source) => source.document)).size,
    },
    answerPreview: turn.answer,
  };
}

/** Renumbers turns so ids stay equal to positions after any change in length. */
function reindex(turns: Turn[]): Turn[] {
  return turns.map((turn, index) => ({ ...turn, id: String(index) }));
}

/**
 * Single source of truth for the session's turns. The sidebar, the history view
 * and the thread all read from here, so a turn can never be listed in one place
 * and missing from another.
 *
 * Turns come from the backend rather than being invented locally, which changes
 * two things worth knowing:
 *
 * - The list is scoped to one session, so it covers the questions asked in this
 *   browser session rather than all time. The backend keys history by session
 *   and expires the session, and there is no endpoint that lists across them.
 * - A turn is identified by its position. The backend returns no per-question
 *   id, and because a session's history only grows at the end, a position is
 *   stable across reloads. That is what makes `/response/:id` a usable link.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly turnsState = signal<Turn[]>([]);
  private readonly loadingState = signal(false);
  private readonly loadedState = signal(false);
  private readonly searchTermState = signal('');

  /** Completes once the first load has settled, so callers can queue behind it. */
  private readonly settled = new ReplaySubject<void>(1);

  /** Every turn in the session, oldest first. */
  readonly turns = this.turnsState.asReadonly();

  /** Turns as the sidebar and history list render them. */
  readonly entries = computed(() => this.turnsState().map(toEntry));

  /** True while the session's turns are being fetched for the first time. */
  readonly isLoading = this.loadingState.asReadonly();

  /** True once a load has finished, successfully or not. */
  readonly isLoaded = this.loadedState.asReadonly();

  /** Current sidebar / history search term. */
  readonly searchTerm = this.searchTermState.asReadonly();

  /** Entries matching the search term. */
  readonly filteredEntries = computed(() => {
    const term = this.searchTermState().trim().toLowerCase();

    if (!term) {
      return this.entries();
    }

    return this.entries().filter(
      (entry) =>
        entry.question.title.toLowerCase().includes(term) ||
        entry.answerPreview.toLowerCase().includes(term),
    );
  });

  /**
   * Filtered entries grouped into the two list headings, always `Recent`
   * first so a search that only matches old questions does not reorder them.
   */
  readonly groups = computed<HistoryGroup[]>(() => {
    const grouped = new Map<DateBucket, HistoryEntry[]>();

    for (const entry of this.filteredEntries()) {
      const bucket = toDateBucket(entry.question.askedAt);
      grouped.set(bucket, [...(grouped.get(bucket) ?? []), entry]);
    }

    return BUCKET_ORDER.filter((bucket) => grouped.has(bucket)).map((bucket) => ({
      bucket,
      entries: grouped.get(bucket) ?? [],
    }));
  });

  /** True when the session has at least one question. */
  readonly hasHistory = computed(() => this.turnsState().length > 0);

  /** True when a search is active and matched nothing. */
  readonly hasNoResults = computed(
    () => this.searchTermState().trim().length > 0 && this.filteredEntries().length === 0,
  );

  constructor() {
    // Skipped on the server. Turns belong to a browser session and a server
    // render would otherwise pay the round trip on every request to paint a
    // conversation the client is about to fetch anyway.
    //
    // Loaded is still marked, because on the server "resolved" and "empty" are
    // the same thing: there is no request to wait for. Leaving it unresolved
    // would render the response route's spinner into the served HTML for a turn
    // that is never going to arrive.
    if (this.isBrowser) {
      this.load();
      return;
    }

    this.loadedState.set(true);
    this.markSettled();
  }

  /**
   * Completes when the initial load has settled, immediately if it already has.
   *
   * Asks queue behind this so a turn can never be appended against an empty
   * list and then renumbered when the load lands.
   */
  ready(): Observable<void> {
    return this.settled.asObservable();
  }

  /** Fetches the session's turns from the backend. */
  load(): void {
    this.loadingState.set(true);

    this.session
      .ensureSession()
      .pipe(
        switchMap((sessionId) => this.api.getHistory(sessionId)),
        catchError((error: unknown) => {
          // A session the backend no longer knows about is gone for good, so it
          // is dropped rather than retried and the turns that belonged to it go
          // with it. Leaving them on screen would show a conversation against a
          // session the backend knows nothing about, and every follow-up
          // question would be posted into a session that is already closed.
          const isLost = error instanceof ApiError && error.status === 404;

          if (isLost) {
            this.session.handleSessionLoss(error);
            this.clear();
          } else {
            console.error('Could not load question history', error);
          }

          return of<Turn[]>([]);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((turns) => {
        this.turnsState.set(reindex(turns));
        this.loadingState.set(false);
        this.loadedState.set(true);
        this.markSettled();
      });
  }

  /**
   * Records a question the moment it is asked, before any answer exists, and
   * returns the id it was given. The turn is a real one from here on: it is what
   * the thread renders as pending, and what a later answer is written onto.
   */
  appendPendingTurn(question: string): string {
    const turn: Turn = {
      id: String(this.turnsState().length),
      question,
      answer: '',
      status: 'pending',
      sources: [],
      createdAt: new Date().toISOString(),
    };

    this.turnsState.update((turns) => [...turns, turn]);

    return turn.id;
  }

  /** Writes a completed answer onto a pending turn. */
  resolveTurn(turnId: string, answer: AnswerResponse): void {
    this.patchTurn(turnId, {
      answer: answer.text,
      status: answer.status,
      sources: answer.sources,
    });
  }

  /**
   * Marks a turn as failed. The message is shown in place of an answer, so it is
   * written to `answer` rather than kept on the side: there is one place a turn's
   * text is read from.
   */
  failTurn(turnId: string, message: string): void {
    this.patchTurn(turnId, { answer: message, status: 'failed', sources: [] });
  }

  /** Puts a turn back to pending, so a retry shows the search state again. */
  markTurnPending(turnId: string): void {
    this.patchTurn(turnId, { answer: '', status: 'pending', sources: [] });
  }

  /** The turn at a position, or undefined when the id is not one of ours. */
  turnAt(turnId: string): Turn | undefined {
    return this.turnsState().find((turn) => turn.id === turnId);
  }

  /** Clears the turns, for a new conversation in the same session. */
  clear(): void {
    this.turnsState.set([]);
  }

  /** Updates the search term shared by the sidebar and the history view. */
  setSearchTerm(term: string): void {
    this.searchTermState.set(term);
  }

  /** Clears the search term. */
  clearSearch(): void {
    this.searchTermState.set('');
  }

  /** Applies a change to one turn, ignoring ids that are no longer present. */
  private patchTurn(turnId: string, change: Partial<Turn>): void {
    this.turnsState.update((turns) =>
      turns.map((turn) => (turn.id === turnId ? { ...turn, ...change } : turn)),
    );
  }

  /** Releases everything waiting on the first load, once or many times over. */
  private markSettled(): void {
    this.settled.next();
    this.settled.complete();
  }
}
