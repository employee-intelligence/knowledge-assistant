import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { UNTITLED_SESSION } from '../models/session.model';
import { Message, SessionThread } from '../models/session.model';
import { ApiError, ApiService } from './api.service';
import { SessionService } from './session.service';

/**
 * Owns the open session while a question is in flight: what is being asked,
 * what the answer is doing, and what a failure leaves behind.
 *
 * The session list itself lives in `SessionService`, which is backed by the
 * sessions this browser has started. This service keeps the open thread and
 * never decides which session a question belongs to beyond the one that is
 * open: that is the single thing that makes a follow-up a follow-up rather
 * than the start of a second session, so there is one decision to get right
 * and it is made here, in one place, on every question.
 *
 * Answers arrive whole rather than streamed — `POST /chat` answers with the
 * finished answer — so there is no preparing phase and no partial text to
 * accumulate: a question is pending until its answer lands.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(ApiService);
  private readonly sessions = inject(SessionService);

  private readonly threadState = signal<SessionThread | null>(null);
  private readonly sendingState = signal(false);
  private readonly resolvingState = signal(false);
  private readonly missingIdState = signal<string | null>(null);
  private readonly errorState = signal<string | null>(null);

  /** The open session's messages, oldest first. */
  readonly messages = signal<Message[]>([]);

  /** The open thread, or null when none is open. */
  readonly thread = this.threadState.asReadonly();

  /** True while a question is being sent or an answer is being retrieved. */
  readonly isLoading = this.sendingState.asReadonly();

  /**
   * True while an answer is being worked on but has no text to show yet.
   *
   * Always false here: with no streaming there is no phase between "writing"
   * and "first words" to report, so the thread shows the pending question
   * itself instead of a second indicator.
   */
  readonly isPreparing = signal(false).asReadonly();

  /**
   * True until the session's messages are known.
   *
   * Covers the history arriving, so the view can tell "still loading" from
   * "loaded and empty" and never show a not-found page for a session that is
   * simply on its way.
   */
  readonly isResolving = this.resolvingState.asReadonly();

  /**
   * True when the routed session is not there.
   *
   * A link to a session that expired, or that belongs to somebody else, is
   * answered with this rather than with an empty thread: an empty thread would
   * read as a session that had lost its history, which is the opposite of what
   * happened.
   */
  readonly isMissing = computed(() => {
    const missing = this.missingIdState();
    return missing !== null && missing === this.sessions.activeId() && !this.resolvingState();
  });

  /** True once the open session has something to render. */
  readonly hasMessages = computed(() => this.messages().length > 0);

  /**
   * True when the session is loaded and holds no messages at all.
   *
   * Distinct from having no open session. An empty one is a session waiting for
   * its first question, which is what a fresh chat lands on and what the view
   * would otherwise misreport as a missing session.
   */
  readonly isEmpty = computed(() => !this.resolvingState() && this.messages().length === 0);

  /**
   * Title shown in the thread header.
   *
   * The session's own name once it has one, and a neutral label while it has
   * none: a session starts unnamed and is named after its first question.
   */
  readonly threadTitle = computed(() => this.threadState()?.title ?? UNTITLED_SESSION);

  readonly error = this.errorState.asReadonly();

  /** True while an answer is being sent. Kept for the dashboard composer. */
  readonly isSending = this.sendingState.asReadonly();

  /**
   * Opens a session: marks it active and loads its history.
   *
   * Called with the route's id whenever it changes, so navigating away and
   * back, and picking another session from the sidebar, both restore the right
   * thread.
   */
  openSession(sessionId: string): void {
    this.sessions.setActiveId(sessionId);
    this.missingIdState.set(null);
    this.errorState.set(null);
    this.resolvingState.set(true);

    this.api.getHistory(sessionId).subscribe({
      next: (items) => {
        // A session opened elsewhere while this one was loading wins: only the
        // answer to the current question may write the thread.
        if (this.sessions.activeId() !== sessionId) {
          return;
        }
        const thread = this.api.toSessionThread(sessionId, items);
        this.threadState.set(thread);
        this.messages.set(thread.messages);
        if (thread.title) {
          this.sessions.updateTitle(sessionId, thread.title);
        }
        this.resolvingState.set(false);
      },
      error: (error: unknown) => {
        if (this.sessions.activeId() !== sessionId) {
          return;
        }
        const apiError =
          error instanceof ApiError ? error : new ApiError('Could not load this session.', 0, true);
        if (apiError.status === 404) {
          this.missingIdState.set(sessionId);
          this.threadState.set(null);
          this.messages.set([]);
        } else {
          this.errorState.set(apiError.message);
        }
        this.resolvingState.set(false);
      },
    });
  }

  /**
   * Asks a question in the open session, opening one first if there is none.
   *
   * Fire-and-forget on purpose: the dashboard asks and navigates in the same
   * breath, and waiting for the answer before navigating would hold the reader
   * on a screen whose only job was to collect the question.
   */
  ask(question: string): void {
    const thread = this.threadState();

    if (thread) {
      this.sendMessage(question).subscribe();
      return;
    }

    this.sendingState.set(true);
    this.errorState.set(null);

    this.sessions.create().subscribe({
      next: (session) => {
        this.sessions.setActiveId(session.id);
        this.threadState.set({ id: session.id, title: null, messages: [] });
        this.sendMessage(question).subscribe();
      },
      error: (error: unknown) => {
        this.sendingState.set(false);
        const apiError =
          error instanceof ApiError ? error : new ApiError('Could not start a session.', 0, true);
        this.errorState.set(apiError.message);
      },
    });
  }

  /**
   * Asks a failed message's question again.
   *
   * Re-posts the question rather than replaying anything: the backend records
   * every exchange, so the retry is a new question with the same words, and the
   * failed turn stays where it was with its own retry control.
   */
  retry(messageId: string): void {
    const thread = this.messages();
    const index = thread.findIndex((message) => message.id === messageId);

    if (index === -1) {
      return;
    }

    const failed = thread[index];
    const question =
      failed.role === 'user'
        ? failed.text
        : [...thread.slice(0, index)].reverse().find((message) => message.role === 'user')?.text;

    if (question) {
      this.sendMessage(question).subscribe();
    }
  }

  /**
   * Starts a new session and returns to the dashboard.
   *
   * The session is created up front rather than on the first question, so the
   * sidebar lists it immediately and the dashboard's composer already has
   * somewhere to ask into.
   */
  startNewSession(): void {
    this.sendingState.set(true);

    this.sessions.create().subscribe({
      next: (session) => {
        this.sessions.setActiveId(session.id);
        this.threadState.set({ id: session.id, title: null, messages: [] });
        this.messages.set([]);
        this.missingIdState.set(null);
        this.errorState.set(null);
        this.sendingState.set(false);
      },
      error: (error: unknown) => {
        this.sendingState.set(false);
        const apiError =
          error instanceof ApiError ? error : new ApiError('Could not start a session.', 0, true);
        this.errorState.set(apiError.message);
      },
    });
  }

  /**
   * Sends a message in the open session and records the answer.
   *
   * The user message is added optimistically so the question appears at once;
   * the answer replaces nothing and is appended when it lands. A failure marks
   * the question failed in place, with its retry control, rather than removing
   * what the person just asked.
   */
  sendMessage(content: string): Observable<Message | null> {
    const thread = this.threadState();

    if (!thread) {
      return of(null);
    }

    const wasEmpty = this.messages().length === 0;

    this.sendingState.set(true);
    this.errorState.set(null);

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      text: content,
      createdAt: new Date().toISOString(),
      status: 'pending',
      sources: [],
      documentCount: 0,
    };

    this.messages.update((msgs) => [...msgs, userMessage]);

    return this.api.chat(thread.id, content).pipe(
      map((response) => {
        const sources = (response.sources ?? []).map((source) => this.api.toSource(source));
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: response.answer,
          createdAt: new Date().toISOString(),
          status: response.answered ? 'answered' : 'not-found',
          sources,
          documentCount: new Set(sources.map((s) => s.document)).size,
        };
        return { userMessage, assistantMessage };
      }),
      tap(({ userMessage: sent, assistantMessage }) => {
        this.messages.update((msgs) =>
          msgs.map((m) => (m.id === sent.id ? { ...sent, status: 'answered' as const } : m)),
        );
        this.messages.update((msgs) => [...msgs, assistantMessage]);
        this.sessions.touch(thread.id);

        if (wasEmpty) {
          const title = content.trim().length > 50 ? `${content.trim().slice(0, 50)}…` : content.trim();
          this.threadState.update((current) => (current ? { ...current, title } : current));
          this.sessions.updateTitle(thread.id, title);
        }
      }),
      map(({ assistantMessage }) => assistantMessage),
      catchError((error: unknown) => {
        const apiError =
          error instanceof ApiError ? error : new ApiError('Could not send that question.', 0, true);
        this.errorState.set(apiError.message);
        this.sendingState.set(false);

        this.messages.update((msgs) =>
          msgs.map((m) => (m.id === userMessage.id ? { ...m, status: 'failed' as const } : m)),
        );

        return of(null);
      }),
      tap(() => this.sendingState.set(false)),
    );
  }

  /** Clears the open thread. The session itself is left alone. */
  clear(): void {
    this.threadState.set(null);
    this.messages.set([]);
    this.missingIdState.set(null);
    this.errorState.set(null);
  }
}
