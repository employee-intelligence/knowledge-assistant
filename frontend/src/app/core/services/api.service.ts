import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError, timeout } from 'rxjs';

import { API_BASE_URL, API_TIMEOUT_MS } from '../api.config';
import {
  ChatStreamEventDto,
  ConversationCreateResponse,
  ConversationDetailResponse,
  ConversationListResponse,
  ConversationSummaryDto,
  MessageSendRequest,
  SourceDto,
  parseUtcTimestamp,
} from '../models/api.model';
import { Conversation, ConversationThread } from '../models/conversation.model';
import { Message, SourceReference, countDocuments } from '../models/message.model';

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
 * Shown when a stream ends without a `done` event.
 *
 * A connection dropped part way through has produced no answer at all, which is
 * different from an answer saying the corpus holds nothing, so it is reported as a
 * temporary failure and stays retryable.
 */
export const STREAM_INCOMPLETE_MESSAGE =
  'The connection to the assistant was interrupted before the answer finished. Please try again.';

/**
 * The only place that talks to the backend. Components never inject
 * `HttpClient` themselves; they go through the feature services, which in turn
 * call this one.
 *
 * Two layers meet here. The methods return the backend's own wire types, so the
 * shape of the HTTP contract is readable in one place, and the mappers turn them
 * into the domain models the rest of the app uses. Backend changes land in a mapper
 * instead of rippling outward.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  /**
   * `POST /api/conversations`. Opens a conversation for this client.
   *
   * Only ever called for a conversation the user asked to start. A message posted
   * to an existing conversation appends to it, so asking a follow-up never lands
   * the user in a new one.
   */
  createConversation(clientId: string): Observable<ConversationCreateResponse> {
    return this.post<ConversationCreateResponse>('/api/conversations', { client_id: clientId });
  }

  /** `GET /api/conversations`. Every conversation this client owns, newest first. */
  getConversations(clientId: string): Observable<Conversation[]> {
    const path = `/api/conversations?client_id=${encodeURIComponent(clientId)}`;

    return this.get<ConversationListResponse>(path).pipe(
      map((response) => response.conversations.map((dto) => this.toConversation(dto))),
    );
  }

  /**
   * `GET /api/conversations/{id}`. One conversation's whole thread, oldest first.
   *
   * Ordered oldest first by the backend, which is the order a conversation reads
   * in, so it is used as it arrives.
   */
  getConversation(conversationId: string, clientId: string): Observable<ConversationThread> {
    const path =
      `/api/conversations/${encodeURIComponent(conversationId)}` +
      `?client_id=${encodeURIComponent(clientId)}`;

    return this.get<ConversationDetailResponse>(path).pipe(
      map((response) => ({
        id: response.id,
        title: response.title,
        messages: response.messages.map((dto) => this.toMessage(dto)),
      })),
    );
  }

  /** `POST /api/conversations/{id}/messages`. Asks, and emits the answer as written. */
  sendMessage(
    conversationId: string,
    clientId: string,
    content: string,
  ): Observable<ChatStreamEventDto> {
    return new Observable<ChatStreamEventDto>((subscriber) => {
      const controller = new AbortController();
      const body: MessageSendRequest = { client_id: clientId, content };
      // Emitted from inside the read loop, so the caller sees each piece of the
      // answer as it lands rather than when the stream ends.
      const emit = (event: ChatStreamEventDto): void => {
        if (!controller.signal.aborted) {
          subscriber.next(event);
        }
      };

      void this.readStream(conversationId, body, controller.signal, emit).then(
        () => subscriber.complete(),
        (error: unknown) => {
          if (!controller.signal.aborted) {
            subscriber.error(this.toApiError(error));
          }
        },
      );

      return () => controller.abort();
    });
  }

  /** `PATCH /api/conversations/{id}`. Names a conversation. */
  renameConversation(conversationId: string, clientId: string, title: string): Observable<void> {
    const path = `/api/conversations/${encodeURIComponent(conversationId)}`;

    return this.patch<void>(path, { client_id: clientId, title }).pipe(map(() => undefined));
  }

  /** `DELETE /api/conversations/{id}`. Removes a conversation and its messages. */
  deleteConversation(conversationId: string, clientId: string): Observable<void> {
    const path =
      `/api/conversations/${encodeURIComponent(conversationId)}` +
      `?client_id=${encodeURIComponent(clientId)}`;

    return this.send(this.http.delete<void>(`${API_BASE_URL}${path}`)).pipe(map(() => undefined));
  }

  /**
   * Reads a `text/event-stream` body, handing each event to `onEvent` as it is
   * parsed.
   *
   * Events are separated by a blank line and may arrive split across network
   * chunks, so the buffer is only drained on a complete frame and whatever follows
   * the last newline is kept for the next read.
   */
  private async readStream(
    conversationId: string,
    body: MessageSendRequest,
    signal: AbortSignal,
    onEvent: (event: ChatStreamEventDto) => void,
  ): Promise<void> {
    let response: Response;

    try {
      response = await fetch(
        `${API_BASE_URL}/api/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        },
      );
    } catch {
      // fetch reports a dropped connection and a refused request the same way,
      // which is the status-0 case the rest of this service already describes.
      throw new HttpErrorResponse({ status: 0, error: null });
    }

    if (!response.ok) {
      throw new HttpErrorResponse({
        status: response.status,
        error: await this.readErrorBody(response),
      });
    }

    if (!response.body) {
      throw new HttpErrorResponse({ status: response.status, error: null });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');

      while (boundary !== -1) {
        const event = this.parseFrame(buffer.slice(0, boundary));

        if (event) {
          onEvent(event);
        }

        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }
  }

  /**
   * The JSON body of a failed response, or null when it is not JSON.
   *
   * A proxy in front of the backend can answer with HTML of its own, which is
   * a status to report rather than a body to read.
   */
  private async readErrorBody(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  /** One SSE frame as an event, or null for a frame that carries no payload. */
  private parseFrame(frame: string): ChatStreamEventDto | null {
    const payload = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');

    if (!payload) {
      return null;
    }

    try {
      return JSON.parse(payload) as ChatStreamEventDto;
    } catch {
      // A frame that is not JSON is not something this client can act on, and
      // dropping it keeps the rest of the stream usable.
      return null;
    }
  }

  /**
   * A GET against a path, with the timeout and the error mapping applied.
   *
   * Paths are spelled out in full at every call site rather than being assembled
   * from a base inside a shared helper. Handing each caller the bare base URL
   * instead made it possible to send a request to the origin with no path at all,
   * which is a request that cannot fail loudly.
   */
  private get<T>(path: string): Observable<T> {
    return this.send(this.http.get<T>(`${API_BASE_URL}${path}`));
  }

  /** A POST against a path, with the timeout and the error mapping applied. */
  private post<T>(path: string, body: unknown): Observable<T> {
    return this.send(this.http.post<T>(`${API_BASE_URL}${path}`, body));
  }

  /** A PATCH against a path, with the timeout and the error mapping applied. */
  private patch<T>(path: string, body: unknown): Observable<T> {
    return this.send(this.http.patch<T>(`${API_BASE_URL}${path}`, body));
  }

  /** Applies the request timeout and flattens transport failures into `ApiError`. */
  private send<T>(request: Observable<T>): Observable<T> {
    return request.pipe(
      timeout(API_TIMEOUT_MS),
      catchError((error: unknown) => throwError(() => this.toApiError(error))),
    );
  }

  /** A wire conversation as the domain shape. */
  private toConversation(dto: ConversationSummaryDto): Conversation {
    return {
      id: dto.id,
      title: dto.title,
      updatedAt: parseUtcTimestamp(dto.updated_at),
    };
  }

  /**
   * A wire message as the domain shape.
   *
   * `sources` is null on a question, which cites nothing, so it becomes an empty
   * list rather than a nullable field every consumer would have to check. The
   * status is derived here rather than stored: a message that is in the backend is
   * finished, and only a locally streamed one is still pending or has failed.
   */
  private toMessage(dto: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    sources: SourceDto[] | null;
    created_at: string;
  }): Message {
    const sources = (dto.sources ?? []).map((source) => this.toSource(source));

    return {
      id: dto.id,
      role: dto.role,
      text: dto.content,
      createdAt: parseUtcTimestamp(dto.created_at),
      // A message in the backend has been delivered, so it is never pending and
      // never failed. Those two states belong to an answer being streamed here, and
      // a question carries no outcome at all.
      status: 'answered',
      sources,
      documentCount: countDocuments(sources),
    };
  }

  /** Turns a wire source into the domain shape. */
  private toSource(dto: SourceDto): SourceReference {
    return {
      document: dto.document,
      section: dto.section,
      snippet: dto.snippet,
      score: dto.score,
    };
  }

  /**
   * A failure worth showing a user.
   *
   * A browser reports a request the network dropped and a request the server
   * answered without CORS headers identically, as a status of 0, so those are
   * described together: from here they are the same thing and saying otherwise
   * would be a distinction the page cannot actually make.
   *
   * A 422 means the message itself was rejected, so the backend's own wording is
   * passed through; a 5xx means the answer may still be there and is worth
   * retrying. A 404 means the conversation is not there to answer into, which is
   * the one failure a retry cannot fix.
   */
  private toApiError(error: unknown): ApiError {
    if (error instanceof HttpErrorResponse) {
      const detail = this.readValidationDetail(error.error);

      if (error.status === 422 && detail) {
        return new ApiError(detail, 422, false);
      }

      if (error.status === 0) {
        return new ApiError(
          'Could not get a response from the assistant. It may be temporarily unavailable.',
          0,
          true,
        );
      }

      if (error.status >= 500) {
        return new ApiError(
          'The assistant is temporarily unavailable. Please try again.',
          error.status,
          true,
        );
      }

      if (error.status === 404) {
        return new ApiError('That conversation is no longer available.', 404, false);
      }

      return new ApiError('The request could not be completed.', error.status, false);
    }

    if (error instanceof Error && error.name === 'TimeoutError') {
      return new ApiError('The assistant took too long to respond. Please try again.', 0, true);
    }

    return new ApiError('Something went wrong. Please try again.', 0, true);
  }

  /** The first human readable message out of a FastAPI 422 body, if there is one. */
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
