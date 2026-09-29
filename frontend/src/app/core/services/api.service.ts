import { Injectable } from '@angular/core';
import { Observable, map, timer } from 'rxjs';

import { ChatSession } from '../models/chat-session.model';
import { AnswerResponse } from '../models/message.model';
import { HistoryEntry } from '../models/question.model';
import { buildMockHistory, buildMockSession, mockAnswerFor } from '../data/mock-chat.data';

/** Latency of the mock backend, so loading states are actually observable. */
const MOCK_LATENCY_MS = 900;

/**
 * The only place that talks to the backend. Components never inject
 * HttpClient themselves; they go through the feature services, which in turn
 * call this one.
 *
 * Phase 1 ships without API integration, so every method resolves canned data
 * through the same Observable signatures the real endpoints will use. Going
 * live means replacing the bodies below, not the call sites, for example:
 *
 * ```ts
 * private readonly http = inject(HttpClient);
 *
 * getHistory(): Observable<HistoryEntry[]> {
 *   return this.http.get<HistoryEntry[]>(`${API_V1}/questions`);
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  /** Every question the user has asked, newest first. */
  getHistory(): Observable<HistoryEntry[]> {
    return timer(MOCK_LATENCY_MS).pipe(map(() => buildMockHistory()));
  }

  /** A single conversation, or null when the id is unknown. */
  getSession(sessionId: string): Observable<ChatSession | null> {
    return timer(MOCK_LATENCY_MS).pipe(map(() => buildMockSession(sessionId)));
  }

  /** Asks the assistant a question and returns its grounded answer. */
  ask(question: string): Observable<AnswerResponse> {
    return timer(MOCK_LATENCY_MS).pipe(map(() => mockAnswerFor(question)));
  }
}
