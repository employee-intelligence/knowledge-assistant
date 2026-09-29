import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { HistoryEntry } from '../models/question.model';
import { AnswerResponse } from '../models/message.model';
import { ApiService } from './api.service';
import { toDateBucket, type DateBucket } from '../../shared/utils/format-date.util';

/** List headings, in the order they are shown. */
const BUCKET_ORDER: DateBucket[] = ['Recent', 'Old'];

/** A run of history entries sharing one date heading. */
export interface HistoryGroup {
  bucket: DateBucket;
  entries: HistoryEntry[];
}

/**
 * Single source of truth for past questions. The sidebar and the history view
 * both read from here rather than keeping their own copies.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly entriesState = signal<HistoryEntry[]>([]);
  private readonly loadingState = signal(false);
  private readonly searchTermState = signal('');

  /** Every past question, newest first. */
  readonly entries = this.entriesState.asReadonly();

  /** True while the history is being fetched for the first time. */
  readonly isLoading = this.loadingState.asReadonly();

  /** Current sidebar / history search term. */
  readonly searchTerm = this.searchTermState.asReadonly();

  /** Entries matching the search term. */
  readonly filteredEntries = computed(() => {
    const term = this.searchTermState().trim().toLowerCase();

    if (!term) {
      return this.entriesState();
    }

    return this.entriesState().filter(
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

  /** True when there is at least one question in the history. */
  readonly hasHistory = computed(() => this.entriesState().length > 0);

  /** True when a search is active and matched nothing. */
  readonly hasNoResults = computed(
    () => this.searchTermState().trim().length > 0 && this.filteredEntries().length === 0,
  );

  constructor() {
    this.refresh();
  }

  /** Reloads the history from the data layer. */
  refresh(): void {
    this.loadingState.set(true);
    this.api
      .getHistory()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((entries) => {
        this.entriesState.set(entries);
        this.loadingState.set(false);
      });
  }

  /** Updates the search term shared by the sidebar and the history view. */
  setSearchTerm(term: string): void {
    this.searchTermState.set(term);
  }

  /** Clears the search term. */
  clearSearch(): void {
    this.searchTermState.set('');
  }

  /**
   * Adds a question the user has just asked to the top of the history, or
   * refreshes it if it is already listed.
   */
  upsert(entry: HistoryEntry): void {
    this.entriesState.update((entries) => {
      const withoutExisting = entries.filter((item) => item.question.id !== entry.question.id);

      return [entry, ...withoutExisting];
    });
  }

  /** Stores the answer for a question the user has just asked. */
  updateAnswer(turnId: string, answer: AnswerResponse): void {
    this.entriesState.update((entries) =>
      entries.map((entry) =>
        entry.question.id === turnId
          ? {
              ...entry,
              answerPreview: answer.text,
              question: {
                ...entry.question,
                answerStatus: answer.status,
                documentCount: answer.documentCount,
              },
            }
          : entry,
      ),
    );
  }
}
