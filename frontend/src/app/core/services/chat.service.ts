import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MOCK_SUGGESTIONS } from '../data/mock-chat.data';
import { ChatSession } from '../models/chat-session.model';
import { AnswerResponse, Message, SourceReference } from '../models/message.model';
import { Question } from '../models/question.model';
import { formatDocumentDate } from '../../shared/utils/format-date.util';
import { ApiService } from './api.service';
import { HistoryService } from './history.service';

/**
 * Owns the open conversation: its question, its turns, and the loading state
 * while an answer is being retrieved. The dashboard, the response view and the
 * sidebar all read from here rather than keeping their own copies.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(ApiService);
  private readonly history = inject(HistoryService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly sessionState = signal<ChatSession | null>(null);
  private readonly loadingState = signal(false);
  private readonly openingSessionIdState = signal<string | null>(null);
  private readonly suggestionsState = signal<string[]>(MOCK_SUGGESTIONS);

  private newSessionCounter = 0;

  /** The open conversation, or null on the dashboard. */
  readonly session = this.sessionState.asReadonly();

  /** True while an answer is being generated. */
  readonly isLoading = this.loadingState.asReadonly();

  /** Starter prompts offered on the dashboard. */
  readonly suggestions = this.suggestionsState.asReadonly();

  /** The question that opened the open conversation. */
  readonly question = computed(() => this.sessionState()?.question ?? null);

  /** Turns of the open conversation, oldest first. */
  readonly messages = computed(() => this.sessionState()?.messages ?? []);

  /** True once the conversation has at least one turn to render. */
  readonly hasMessages = computed(() => this.messages().length > 0);

  /** True while a stored conversation is being fetched. */
  readonly isOpeningSession = computed(() => this.openingSessionIdState() !== null);

  /**
   * The most recent completed answer, or null while the newest one is still
   * pending. Earlier answers are intentionally ignored so the header, the
   * citations and the not-found card always describe the latest turn.
   */
  readonly latestAnswer = computed<AnswerResponse | null>(() => {
    const last = this.lastAssistantMessage();

    if (!last || last.status === 'pending') {
      return null;
    }

    return {
      text: last.text,
      status: last.status,
      sources: last.sources,
      documentCount: last.documentCount,
    };
  });

  /** Citations backing the most recent answer. */
  readonly sources = computed<SourceReference[]>(() => this.latestAnswer()?.sources ?? []);

  /** True when the most recent answer found nothing in the corpus. */
  readonly isNotFound = computed(() => this.latestAnswer()?.status === 'not-found');

  /**
   * `Grounded in 4 documents · Updated 20 September 2026`, or null while the
   * newest answer is pending.
   */
  readonly groundingSummary = computed(() => {
    const question = this.question();
    const answer = this.latestAnswer();

    if (!question || !answer || answer.status !== 'answered') {
      return null;
    }

    const documentCount = answer.documentCount;
    const noun = documentCount === 1 ? 'document' : 'documents';

    return `Grounded in ${documentCount} ${noun} · Updated ${formatDocumentDate(
      question.documentsUpdatedAt,
    )}`;
  });

  /** Topic shown in the thread header. */
  readonly threadTitle = computed(() => this.question()?.topic ?? '');

  /**
   * Opens a stored conversation. Asking from the dashboard creates a new one;
   * asking while a conversation is open appends to it.
   */
  ask(question: string): void {
    const trimmed = question.trim();

    if (!trimmed) {
      return;
    }

    const turnId = this.nextTurnId();
    const askedAt = new Date().toISOString();
    const isNewSession = this.sessionState() === null;
    const questionModel = isNewSession ? this.createQuestion(trimmed, turnId) : this.question()!;

    this.sessionState.set({
      question: questionModel,
      messages: [
        ...this.messages(),
        this.createTurn(turnId, 'user', trimmed, askedAt),
        this.createTurn(turnId, 'assistant', '', askedAt),
      ],
    });

    if (isNewSession) {
      this.history.upsert({ question: questionModel, answerPreview: '' });
    }

    this.loadingState.set(true);

    this.api
      .ask(trimmed)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((answer) => {
        this.applyAnswer(turnId, answer);
        this.loadingState.set(false);
      });
  }

  /** Opens a stored conversation by id. Unknown ids leave the view empty. */
  openSession(sessionId: string): void {
    // Re-entering the route of the conversation already open must not discard
    // the live thread, which is where a freshly asked question is still pending.
    if (this.sessionState()?.question.id === sessionId) {
      return;
    }

    this.openingSessionIdState.set(sessionId);

    this.api
      .getSession(sessionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((session) => {
        if (session) {
          this.sessionState.set(session);
        }

        this.openingSessionIdState.set(null);
      });
  }

  /** Drops the open conversation and returns the user to the dashboard. */
  startNewConversation(): void {
    this.sessionState.set(null);
    this.loadingState.set(false);
  }

  /** The newest assistant turn, pending or not. */
  private lastAssistantMessage(): Message | undefined {
    const assistantMessages = this.messages().filter((message) => message.role === 'assistant');

    return assistantMessages[assistantMessages.length - 1];
  }

  /** Fills in the pending turn of the pair identified by `turnId`. */
  private applyAnswer(turnId: string, answer: AnswerResponse): void {
    this.sessionState.update((session) => {
      if (!session) {
        return session;
      }

      // Only the newest turn reflects the question's current answer status.
      const isNewestTurn =
        session.messages[session.messages.length - 1]?.id === `${turnId}-assistant`;

      return {
        question: isNewestTurn
          ? {
              ...session.question,
              answerStatus: answer.status,
              documentCount: answer.documentCount,
            }
          : session.question,
        messages: session.messages.map((message) => {
          if (message.id === `${turnId}-assistant`) {
            return {
              ...message,
              text: answer.text,
              status: answer.status,
              sources: answer.sources,
              documentCount: answer.documentCount,
            };
          }

          return message.id === `${turnId}-user` ? { ...message, status: answer.status } : message;
        }),
      };
    });

    this.history.updateAnswer(turnId, answer);
  }

  /** Builds one turn of a question/answer pair. */
  private createTurn(
    turnId: string,
    role: Message['role'],
    text: string,
    createdAt: string,
  ): Message {
    return {
      id: `${turnId}-${role}`,
      role,
      text,
      createdAt,
      status: 'pending',
      sources: [],
      documentCount: 0,
    };
  }

  /** Monotonic id for a question/answer pair opened in this browser session. */
  private nextTurnId(): string {
    this.newSessionCounter += 1;

    return `turn-${this.newSessionCounter}`;
  }

  /** Builds the question model for a conversation opened in this session. */
  private createQuestion(text: string, id: string): Question {
    const now = new Date().toISOString();

    return {
      id,
      title: text,
      topic: text,
      askedAt: now,
      updatedAt: now,
      answerStatus: 'pending',
      documentCount: 0,
      documentsUpdatedAt: now,
    };
  }
}
