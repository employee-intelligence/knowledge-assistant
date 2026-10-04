import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError, timeout } from 'rxjs';

import { API_BASE_URL, API_TIMEOUT_MS } from '../api.config';
import {
  ChatRequestDto,
  ChatResponseDto,
  DocumentsDto,
  HealthDto,
  HistoryDto,
  HistoryMessageDto,
  SessionCreateResponse,
} from '../models/api.model';
import { Message, Session, SessionThread, SourceReference, UNTITLED_SESSION } from '../models/session.model';
import { AuthService, CSRF_HEADER } from './auth.service';

/** An error from the backend, already reduced to something a view can show. */
export class ApiError extends Error {
  constructor(
    override readonly message: string,
    readonly status: number,
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
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly credentials = { withCredentials: true } as const;
  private readonly auth = inject(AuthService);

  /** `GET /health`. */
  getHealth(): Observable<HealthDto> {
    return this.get<HealthDto>('/health');
  }

  /** `GET /documents`. The titles in the indexed corpus. */
  getDocuments(): Observable<DocumentsDto> {
    return this.get<DocumentsDto>('/documents');
  }

  /** `POST /sessions`. Creates a new session. */
  createSession(): Observable<SessionCreateResponse> {
    return this.post<SessionCreateResponse>('/sessions', {});
  }

  /** `POST /chat`. Sends a message and gets a response. */
  chat(sessionId: string, message: string): Observable<ChatResponseDto> {
    const body: ChatRequestDto = { session_id: sessionId, message };
    return this.post<ChatResponseDto>('/chat', body);
  }

  /** `GET /history/{session_id}`. Gets the message history for a session. */
  getHistory(sessionId: string): Observable<HistoryDto> {
    return this.get<HistoryDto>(`/history/${encodeURIComponent(sessionId)}`);
  }

  /** `GET /admin/users`. Lists all users (admin only). */
  getUsers(): Observable<{ users: { id: string; name: string; email: string; role: string }[] }> {
    return this.get<{ users: { id: string; name: string; email: string; role: string }[] }>('/admin/users');
  }

  /** `PATCH /admin/users/{user_id}/role`. Updates a user's role (admin only). */
  updateUserRole(userId: string, role: string): Observable<void> {
    return this.patch<void>(`/admin/users/${encodeURIComponent(userId)}/role`, { role });
  }

  /** `DELETE /admin/users/{user_id}`. Deactivates a user (admin only). */
  deactivateUser(userId: string): Observable<void> {
    return this.delete<void>(`/admin/users/${encodeURIComponent(userId)}`);
  }

  /**
   * Converts a wire history DTO to domain session thread.
   */
  toSessionThread(dto: HistoryDto): SessionThread {
    return {
      id: dto.session_id,
      title: dto.messages.length > 0 ? this.generateTitle(dto.messages[0]) : null,
      messages: dto.messages.map((m) => this.toMessage(m)),
    };
  }

  /** Converts a wire message to domain message. */
  private toMessage(dto: HistoryMessageDto): Message {
    return {
      id: dto.id,
      role: dto.role,
      text: dto.content,
      createdAt: dto.created_at,
      status: 'answered',
      sources: [],
      documentCount: 0,
    };
  }

  /** Generates a title from the first message. */
  private generateTitle(firstMessage: HistoryMessageDto): string {
    const text = firstMessage.content.trim();
    return text.length > 50 ? text.slice(0, 50) + '...' : text;
  }

  private get<T>(path: string): Observable<T> {
    return this.send(this.http.get<T>(`${API_BASE_URL}${path}`, this.credentials));
  }

  private post<T>(path: string, body: unknown): Observable<T> {
    return this.send(this.http.post<T>(`${API_BASE_URL}${path}`, body, this.credentials));
  }

  private patch<T>(path: string, body: unknown): Observable<T> {
    return this.send(this.http.patch<T>(`${API_BASE_URL}${path}`, body, this.credentials));
  }

  private delete<T>(path: string): Observable<T> {
    return this.send(this.http.delete<T>(`${API_BASE_URL}${path}`, this.credentials));
  }

  private send<T>(request: Observable<T>): Observable<T> {
    return request.pipe(
      timeout(API_TIMEOUT_MS),
      catchError((error: unknown) => throwError(() => this.toApiError(error))),
    );
  }

  private toApiError(error: unknown): ApiError {
    if (error instanceof HttpErrorResponse) {
      const detail = this.readValidationDetail(error.error);

      if (error.status === 422 && detail) {
        return new ApiError(detail, 422, false);
      }

      if (error.status === 401) {
        return new ApiError('Please sign in to continue.', 401, false);
      }

      if (error.status === 403) {
        return new ApiError('You do not have permission to do that.', 403, false);
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

      return new ApiError(detail ?? 'The request could not be completed.', error.status, false);
    }

    if (error instanceof Error && error.name === 'TimeoutError') {
      return new ApiError('The request took too long. Please try again.', 0, true);
    }

    return new ApiError('Something went wrong. Please try again.', 0, true);
  }

  private readValidationDetail(body: unknown): string | null {
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