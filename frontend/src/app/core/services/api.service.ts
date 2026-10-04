import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError, timeout } from 'rxjs';

import { API_TIMEOUT_MS } from '../api.config';
import { ConfigService } from '../config.service';
import {
  ChatRequestDto,
  ChatResponseDto,
  DocumentsDto,
  HealthDto,
  HistoryItemDto,
  HistoryListDto,
  SourceDto,
  parseUtcTimestamp,
} from '../models/api.model';
import { Message, SessionThread, SourceReference } from '../models/session.model';

/** An error from the backend, already reduced to something a view can show. */
export class ApiError extends Error {
  constructor(
    override readonly message: string,
    /** HTTP status, or 0 when the request never reached the backend. */
    readonly status: number,
    /** True when retrying the same request could plausibly succeed. */
    readonly isTransient: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The only place that talks to the backend. Components never inject
 * `HttpClient` themselves; they go through the feature services, which in turn
 * call this one.
 *
 * Authentication travels as an `Authorization: Bearer ...` header, attached by
 * the interceptor from the token `AuthService` keeps. Nothing here touches
 * cookies: this backend issues tokens, not sessions-in-cookies.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);

  private get baseUrl(): string {
    return this.config.getApiBaseUrl();
  }

  /** `GET /health`. Needs no token. */
  getHealth(): Observable<HealthDto> {
    return this.get<HealthDto>('/health');
  }

  /** `GET /documents`. The titles in the indexed corpus. */
  getDocuments(): Observable<DocumentsDto> {
    return this.get<DocumentsDto>('/documents');
  }

  /** `POST /sessions`. Opens a session for the signed-in account. */
  createSession(): Observable<{ session_id: string; expires_at: string }> {
    return this.post<{ session_id: string; expires_at: string }>('/sessions', {});
  }

  /**
   * `POST /chat`. Asks inside a session.
   *
   * The backend answers with the finished answer, its citations and whether the
   * corpus actually held anything — no streaming, so what arrives is complete.
   */
  chat(sessionId: string, question: string): Observable<ChatResponseDto> {
    const body: ChatRequestDto = { session_id: sessionId, question };
    return this.post<ChatResponseDto>('/chat', body);
  }

  /** `GET /history/{session_id}`. Every answered exchange in a session. */
  getHistory(sessionId: string): Observable<HistoryListDto> {
    return this.get<HistoryListDto>(`/history/${encodeURIComponent(sessionId)}`);
  }

  /** `GET /admin/users`. Every account, as a bare list. Administrators only. */
  getUsers(): Observable<import('../models/auth.model').UserDto[]> {
    return this.get<import('../models/auth.model').UserDto[]>('/admin/users');
  }

  /**
   * `PATCH /admin/users/{user_id}/role`. Administrators only.
   *
   * Answers with the corrected account, so the row can be updated from what the
   * server actually stored rather than from what was sent.
   */
  updateUserRole(
    userId: string,
    role: import('../models/auth.model').Role,
  ): Observable<import('../models/auth.model').UserDto> {
    return this.patch<import('../models/auth.model').UserDto>(
      `/admin/users/${encodeURIComponent(userId)}/role`,
      { role },
    );
  }

  /** `DELETE /admin/users/{user_id}`. Deactivates an account. Administrators only. */
  deactivateUser(userId: string): Observable<void> {
    return this.send(
      this.http.delete(`${this.baseUrl}/admin/users/${encodeURIComponent(userId)}`),
    ).pipe(map(() => undefined));
  }

  /**
   * A session's history as the thread the chat view renders.
   *
   * Each stored exchange becomes two messages — the question and the answer that
   * followed it — oldest first, so a reopened session reads exactly like the
   * conversation that produced it. Ids are derived from the session and the
   * position because the backend names no per-message id of its own.
   */
  toSessionThread(sessionId: string, items: HistoryItemDto[]): SessionThread {
    const ordered = [...items].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    const messages: Message[] = ordered.flatMap((item, index) => [
      {
        id: `${sessionId}-q-${index}`,
        role: 'user' as const,
        text: item.question,
        createdAt: parseUtcTimestamp(item.created_at),
        status: 'answered' as const,
        sources: [],
        documentCount: 0,
      },
      {
        id: `${sessionId}-a-${index}`,
        role: 'assistant' as const,
        text: item.answer,
        createdAt: parseUtcTimestamp(item.created_at),
        status: 'answered' as const,
        sources: (item.sources ?? []).map((source) => this.toSource(source)),
        documentCount: new Set((item.sources ?? []).map((s) => s.document)).size,
      },
    ]);

    return {
      id: sessionId,
      title: ordered.length > 0 ? this.titleOf(ordered[0].question) : null,
      messages,
    };
  }

  /** Turns a wire source into the domain shape. */
  toSource(dto: SourceDto): SourceReference {
    return {
      document: dto.document,
      section: dto.section,
      snippet: dto.snippet,
      score: dto.score,
    };
  }

  /** A title from the session's first question, bounded rather than endless. */
  private titleOf(question: string): string {
    const text = question.trim();
    return text.length > 50 ? `${text.slice(0, 50)}…` : text;
  }

  private get<T>(path: string): Observable<T> {
    return this.send(this.http.get<T>(`${this.baseUrl}${path}`));
  }

  private post<T>(path: string, body: unknown): Observable<T> {
    return this.send(this.http.post<T>(`${this.baseUrl}${path}`, body));
  }

  private patch<T>(path: string, body: unknown): Observable<T> {
    return this.send(this.http.patch<T>(`${this.baseUrl}${path}`, body));
  }

  /** Applies the request timeout and flattens transport failures into `ApiError`. */
  private send<T>(request: Observable<T>): Observable<T> {
    return request.pipe(
      timeout(API_TIMEOUT_MS),
      catchError((error: unknown) => throwError(() => this.toApiError(error))),
    );
  }

  /**
   * A failure worth showing a user.
   *
   * The backend's own wording is passed through for every 4xx: it is written for
   * the person who hit it — "Invalid email or password", "Email already
   * registered" — so replacing it with a generic sentence throws away the only
   * part of the failure the reader can act on. Only a dropped connection and a
   * 5xx get a generic message, because there is no server wording worth showing
   * for a request that never arrived or failed inside the backend.
   */
  private toApiError(error: unknown): ApiError {
    if (error instanceof HttpErrorResponse) {
      const detail = this.readBackendDetail(error.error);

      if (detail && error.status !== 0 && error.status < 500) {
        return new ApiError(detail, error.status, error.status >= 500);
      }

      if (error.status === 0) {
        return new ApiError(
          'Could not reach the server. It may be temporarily unavailable.',
          0,
          true,
        );
      }

      if (error.status >= 500) {
        return new ApiError(
          'The server is temporarily unavailable. Please try again.',
          error.status,
          true,
        );
      }

      if (error.status === 404) {
        return new ApiError('Not found.', 404, false);
      }

      return new ApiError('The request could not be completed.', error.status, false);
    }

    if (error instanceof Error && error.name === 'TimeoutError') {
      return new ApiError('The request took too long. Please try again.', 0, true);
    }

    return new ApiError('Something went wrong. Please try again.', 0, true);
  }

  /**
   * What the backend said went wrong, as a sentence.
   *
   * Handles both shapes a FastAPI failure arrives in: a plain `detail` string,
   * which is what an `HTTPException` carries, and the `detail` array a
   * validation failure produces, where the first entry's `msg` is the sentence.
   */
  private readBackendDetail(body: unknown): string | null {
    if (typeof body !== 'object' || body === null || !('detail' in body)) {
      return null;
    }

    const { detail } = body as { detail: unknown };

    if (typeof detail === 'string') {
      return detail;
    }

    if (!Array.isArray(detail) || detail.length === 0) {
      return null;
    }

    const first = (detail as { msg?: unknown }[])[0];

    return typeof first?.msg === 'string' ? first.msg : null;
  }
}
