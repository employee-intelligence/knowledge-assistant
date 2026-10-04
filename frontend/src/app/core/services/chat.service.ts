import { inject, Injectable, signal } from '@angular/core';
import { Observable, catchError, map, of, switchMap, tap } from 'rxjs';

import { ApiError, ApiService } from './api.service';
import { Message, SessionThread } from '../models/session.model';
import { SessionService } from './session.service';
import { AuthService } from './auth.service';

/**
 * Manages the active chat session and its message thread.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(ApiService);
  private readonly sessions = inject(SessionService);
  private readonly auth = inject(AuthService);

  private readonly threadState = signal<SessionThread | null>(null);
  private readonly sendingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly thread = this.threadState.asReadonly();
  readonly isSending = this.sendingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  readonly messages = signal<Message[]>([]);

  /** Opens a session by loading its history. */
  openSession(sessionId: string): Observable<SessionThread | null> {
    this.errorState.set(null);

    return this.api.getHistory(sessionId).pipe(
      map((dto) => this.api.toSessionThread(dto)),
      tap((thread) => {
        this.threadState.set(thread);
        this.messages.set(thread.messages);
        // Update session title in the list if it was untitled
        if (thread.title && thread.title !== 'New session') {
          this.sessions.updateTitle(thread.id, thread.title);
        }
      }),
      catchError((error: unknown) => {
        const apiError = error instanceof ApiError ? error : new ApiError('Failed to load session', 0, true);
        this.errorState.set(apiError.message);
        return of(null);
      }),
    );
  }

  /** Sends a message in the current session. */
  sendMessage(content: string): Observable<Message | null> {
    const thread = this.threadState();

    if (!thread) {
      return of(null);
    }

    this.sendingState.set(true);
    this.errorState.set(null);

    // Add the user message optimistically
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
      map((response) => ({
        id: `assistant-${Date.now()}`,
        role: 'assistant' as const,
        text: response.response,
        createdAt: new Date().toISOString(),
        status: 'answered' as const,
        sources: [],
        documentCount: 0,
      })),
      tap((assistantMessage) => {
        // Replace the pending user message with the confirmed one, add assistant
        this.messages.update((msgs) =>
          msgs.map((m) => (m.id === userMessage.id ? { ...userMessage, status: 'answered' as const } : m)),
        );
        this.messages.update((msgs) => [...msgs, assistantMessage]);
        this.sessions.touch(thread.id);
      }),
      catchError((error: unknown) => {
        const apiError = error instanceof ApiError ? error : new ApiError('Failed to send message', 0, true);
        this.errorState.set(apiError.message);
        this.sendingState.set(false);

        // Mark user message as failed
        this.messages.update((msgs) =>
          msgs.map((m) => (m.id === userMessage.id ? { ...m, status: 'failed' as const } : m)),
        );

        return of(null);
      }),
      tap(() => this.sendingState.set(false)),
    );
  }

  /** Creates a new session and opens it. */
  startNewSession(): Observable<SessionThread | null> {
    return this.sessions.create().pipe(
      switchMap((session) => this.openSession(session.id)),
    );
  }

  /** Clears the current thread. */
  clear(): void {
    this.threadState.set(null);
    this.messages.set([]);
    this.errorState.set(null);
  }
}