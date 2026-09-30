import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError, timeout } from 'rxjs';

import { API_BASE_URL, API_TIMEOUT_MS } from '../api.config';
import {
  ChatRequest,
  ChatResponse,
  HistoryItemDto,
  SessionCreateResponse,
  SourceDto,
  parseUtcTimestamp,
} from '../models/api.model';
import { AnswerResponse, SourceReference } from '../models/message.model';
import { AnswerStatus } from '../models/question.model';
import { Turn } from '../models/turn.model';

/** An error from the backend, already reduced to something a view can show. */
export class ApiError extends Error {
  constructor(
    override readonly message: string,
    /** HTTP status, or 0 when the request never reached the backend. */
    readonly status: number,
    /** True when retrying the same request could plausibly succeed. */
    readonly isTransient: boolean,
    /**
     * True when the backend no longer accepts the session the request was made
     * under, so the conversation it belonged to is gone rather than unfinished.
     */
    readonly isSessionLost: boolean = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The wording the backend answers with when it will not accept the session a
 * question was posted under.
 *
 * `/chat` reports a session it no longer recognises as an ordinary 200 with
 * `answered: false`, which by status alone is indistinguishable from a genuine
 * gap in the corpus. Reading that as a gap is the more damaging of the two
 * mistakes: it tells the user their question was unanswerable when it was never
 * asked, and it leaves the conversation accumulating turns against a session that
 * is already closed, so the follow-up questions that would have made sense are
 * posted into a session that is gone. Recognising it here keeps the decision in
 * one place, next to the endpoint that speaks it.
 */
const SESSION_LOST_ANSWER = 'session expired or invalid';

/** The message shown for a request the backend has no session for. */
const SESSION_LOST_MESSAGE = 'Your session has expired. Start a new conversation to ask again.';

/** The status an answer outcome maps to. `answered: false` is a genuine gap. */
function statusFor(answered: boolean): AnswerStatus {
  return answered ? 'answered' : 'not-found';
}

/**
 * True when an answer is the backend declining to answer because the session is
 * gone, rather than an answer about the corpus.
 *
 * Only consulted for an `answered: false` response. An answer that happens to
 * mention expiry while actually answering the question is an answer, and is left
 * alone.
 */
function isSessionLost(answer: string): boolean {
  return answer.toLowerCase().includes(SESSION_LOST_ANSWER);
}

/**
 * The only place that talks to the backend. Components never inject
 * `HttpClient` themselves; they go through the feature services, which in turn
 * call this one.
 *
 * Two layers meet here. The methods return the backend's own wire types, so the
 * shape of the HTTP contract is readable in one place, and the `toEntry` mapper
 * turns a history row into the domain model the rest of the app uses. Backend
 * changes land in the mapper instead of rippling outward.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  /** `POST /sessions`. Opens the conversation the session id keys. */
  createSession(): Observable<SessionCreateResponse> {
    return this.post<SessionCreateResponse>('/sessions', {});
  }

  /**
   * `POST /chat`. Asks one question and returns the grounded answer.
   *
   * Not retried automatically: a retry would post the question a second time and
   * the backend would record the duplicate in the session's history. A failed ask
   * is retried by the user, from the thread, where the effect is visible.
   */
  ask(sessionId: string, question: string): Observable<AnswerResponse> {
    const body: ChatRequest = { session_id: sessionId, question };

    return this.post<ChatResponse>('/chat', body).pipe(map((response) => this.toAnswer(response)));
  }

  /** `GET /history/{session_id}`. Every answered turn in the session, oldest first. */
  getHistory(sessionId: string): Observable<Turn[]> {
    return this.get<HistoryItemDto[]>(`/history/${encodeURIComponent(sessionId)}`).pipe(
      // The backend returns a session newest first, which is the right order for a
      // list the user reads top down but the wrong one for a conversation. Every
      // consumer here assumes oldest first: a turn's id is its position in that
      // order, a thread is a slice up to the open turn, and the newest turn is the
      // last one. Reversing here keeps that single assumption true instead of
      // scattering corrections across the services that read this.
      //
      // The array is reversed before ids are assigned, so id 0 is still the oldest
      // turn and the newest is last, matching a turn appended locally.
      map((items) => [...items].reverse().map((item, index) => this.toTurn(item, index))),
    );
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

  /** Applies the request timeout and flattens transport failures into `ApiError`. */
  private send<T>(request: Observable<T>): Observable<T> {
    return request.pipe(
      timeout(API_TIMEOUT_MS),
      catchError((error: unknown) => throwError(() => this.toApiError(error))),
    );
  }

  /** Turns a wire source into the domain shape, with every field given a value. */
  private toSource(dto: SourceDto): SourceReference {
    return {
      document: dto.document,
      section: dto.section,
      snippet: dto.snippet,
      score: dto.score,
    };
  }

  /**
   * A chat response as the domain model the services work with.
   *
   * A response the backend refused to answer because the session is gone is
   * raised as an error rather than returned as an answer. It reaches this method
   * as a success, so without the check it would be filed on the turn as a "not
   * found in the documents" card and the user would be told their question had no
   * answer, when the question was never asked. Raising it puts it on the same
   * path as any other failure, which is where the services already know to report
   * an expired session and offer a new conversation.
   */
  private toAnswer(response: ChatResponse): AnswerResponse {
    if (!response.answered && isSessionLost(response.answer)) {
      throw new ApiError(SESSION_LOST_MESSAGE, 0, false, true);
    }

    return {
      text: response.answer,
      status: statusFor(response.answered),
      sources: (response.sources ?? []).map((dto) => this.toSource(dto)),
    };
  }

  /**
   * A history row as a turn.
   *
   * The position in the list becomes the turn's id. The backend keys history by
   * session and returns no per-question identifier, and a session's history only
   * grows at the end, so a position is the one handle that stays valid across a
   * reload.
   */
  private toTurn(dto: HistoryItemDto, index: number): Turn {
    return {
      id: String(index),
      question: dto.question,
      answer: dto.answer,
      status: statusFor(dto.answered),
      sources: (dto.sources ?? []).map((source) => this.toSource(source)),
      createdAt: parseUtcTimestamp(dto.created_at),
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
   * A 422 means the question itself was rejected, so the backend's own wording is
   * passed through; a 5xx means the answer may still be there and is worth
   * retrying.
   *
   * A rejection of the session itself is kept apart from both, because retrying
   * it is pointless and telling the user to rephrase would be wrong: the id they
   * are posting under is dead. Those statuses are marked as a lost session so the
   * caller reports an expiry rather than a failed question.
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

      // 401 and 403 are how an endpoint says the session is not usable; 404 is how
      // one says the session itself is no longer there. All three mean the same
      // thing here, and none of them are worth a retry.
      if (error.status === 401 || error.status === 403 || error.status === 404) {
        return new ApiError(SESSION_LOST_MESSAGE, error.status, false, true);
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
