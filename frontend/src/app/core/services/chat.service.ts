import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, catchError, finalize, map, of, switchMap } from 'rxjs';

import { Message } from '../models/message.model';
import { Turn } from '../models/turn.model';
import { ApiError, ApiService } from './api.service';
import { HistoryService } from './history.service';
import { SessionService } from './session.service';

/**
 * Owns the open conversation: which turn the response view is showing, the turns
 * that lead up to it, and the request in flight while an answer is retrieved.
 *
 * It keeps no copy of the conversation. The turns live in `HistoryService`,
 * which is backed by the backend's own history for the session, so the thread,
 * the sidebar and the history view cannot drift apart. What this service adds is
 * that list read for one turn: which question is open, which messages make up
 * its thread, and where an answer currently stands.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(ApiService);
  private readonly history = inject(HistoryService);
  private readonly session = inject(SessionService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * The turn the view was asked to show, or null to follow the newest one. The
   * dashboard leaves it null so that asking a question moves the view to the turn
   * it just created, with no id to thread through the navigation.
   */
  private readonly requestedTurnIdState = signal<string | null>(null);

  private readonly askingState = signal(false);

  /** Id of the open turn, or null when there is nothing to show. */
  readonly activeTurnId = computed(() => this.activeTurn()?.id ?? null);

  /** True while a question is being sent or an answer is being retrieved. */
  readonly isLoading = this.askingState.asReadonly();

  /** True while the session's turns have not arrived yet. */
  readonly isResolving = computed(() => !this.history.isLoaded());

  /** The open turn, or undefined when the requested id is not one of this session's. */
  readonly activeTurn = computed<Turn | undefined>(() => {
    const turns = this.history.turns();
    const requested = this.requestedTurnIdState();

    if (requested === null) {
      return turns[turns.length - 1];
    }

    return turns.find((turn) => turn.id === requested);
  });

  /** Title shown in the thread header, which is the question itself. */
  readonly threadTitle = computed(() => this.activeTurn()?.question ?? '');

  /**
   * The thread for the open turn: every turn up to and including it, flattened
   * into the user and assistant messages the thread renders. Opening an older
   * turn shows the conversation that led to it rather than a bare answer, which
   * is what makes a history link worth following.
   */
  readonly messages = computed<Message[]>(() => {
    const turns = this.history.turns();
    const active = this.activeTurn();

    if (!active) {
      return [];
    }

    const lastIndex = turns.findIndex((turn) => turn.id === active.id);

    return turns
      .slice(0, lastIndex + 1)
      .flatMap((turn) => [this.toMessage(turn, 'user'), this.toMessage(turn, 'assistant')]);
  });

  /** True once the open turn has something to render. */
  readonly hasMessages = computed(() => this.activeTurn() !== undefined);

  /**
   * Asks a question.
   *
   * The turn is recorded before the request goes out, so the thread shows the
   * question and its pending state straight away rather than after the round
   * trip. That happens only once the session's history has loaded, because a
   * turn's id is its position in that list, and creating one early could hand it
   * a position the server then gives to a different question.
   */
  ask(question: string): void {
    const trimmed = question.trim();

    if (!trimmed) {
      return;
    }

    this.history
      .ready()
      .pipe(
        switchMap(() => {
          const turnId = this.history.appendPendingTurn(trimmed);
          this.requestedTurnIdState.set(turnId);

          return this.dispatch(turnId, trimmed);
        }),
        finalize(() => this.askingState.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  /**
   * Asks the open turn's question again after a failure.
   *
   * The turn is reused rather than duplicated so it keeps its position, so the
   * link to it and the highlight in the sidebar stay valid. The backend records
   * every `/chat` call as a history entry, so a retried question does appear
   * twice once the session's history is refetched; there is no endpoint that
   * removes it.
   */
  retry(turnId: string): void {
    const turn = this.history.turnAt(turnId);

    if (!turn || this.askingState()) {
      return;
    }

    this.requestedTurnIdState.set(turnId);
    this.askingState.set(true);
    this.history.markTurnPending(turnId);

    this.dispatch(turnId, turn.question)
      .pipe(finalize(() => this.askingState.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  /**
   * Shows a stored turn. An id that is not in this session's history leaves the
   * view with nothing to render, which it reports as not found.
   */
  openTurn(turnId: string | null): void {
    this.requestedTurnIdState.set(turnId);
  }

  /** Stops following a specific turn, so the view returns to the newest one. */
  startNewConversation(): void {
    this.requestedTurnIdState.set(null);
  }

  /**
   * Sends one question and writes the outcome back onto its turn.
   *
   * Failures are recorded on the turn instead of thrown, so a turn is never left
   * searching forever and the user has something to retry from. The turn exists
   * before the session is resolved for the same reason: a session that cannot be
   * created still leaves the question on screen with an explanation.
   */
  private dispatch(turnId: string, question: string): Observable<null> {
    this.askingState.set(true);

    return this.session.ensureSession().pipe(
      switchMap((sessionId) => this.api.ask(sessionId, question)),
      map((answer) => {
        this.history.resolveTurn(turnId, answer);

        return null;
      }),
      catchError((error: unknown) => {
        this.session.handleSessionLoss(error);
        this.history.failTurn(turnId, this.describeFailure(error));

        return of(null);
      }),
    );
  }

  /** Both messages of one turn. The user's half never carries citations. */
  private toMessage(turn: Turn, role: Message['role']): Message {
    const isUser = role === 'user';

    return {
      id: `${turn.id}-${role}`,
      role,
      text: isUser ? turn.question : turn.answer,
      createdAt: turn.createdAt,
      status: turn.status,
      sources: isUser ? [] : turn.sources,
      documentCount: isUser
        ? 0
        : new Set(turn.sources.map((source) => source.document)).size,
    };
  }

  /**
   * What a failed turn says. A question the backend rejected is the user's to
   * fix, so its own wording is passed through with a nudge to rephrase; anything
   * else reads as temporary and invites a retry.
   */
  private describeFailure(error: unknown): string {
    if (error instanceof ApiError) {
      return error.isTransient ? error.message : `${error.message} Try rephrasing your question.`;
    }

    return 'Something went wrong reaching the assistant. Please try again.';
  }
}
