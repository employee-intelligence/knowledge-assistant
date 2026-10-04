/**
 * Wire types, transcribed field for field from the backend's OpenAPI schema
 * (`GET /openapi.json` on https://knowledge-assistant-backend-88gw.onrender.com).
 * These describe what travels over HTTP and nothing else.
 *
 * They are kept apart from the domain models on purpose. The backend is free to
 * rename or drop a field, and when it does, the change belongs in the mapping
 * inside `ApiService` rather than rippling through every component.
 */

/** `GET /health` response. */
export interface HealthDto {
  status: 'ok' | 'degraded';
  message?: string;
}

/** `GET /documents` response. */
export type DocumentsDto = string[];

/** `POST /sessions` response. */
export interface SessionCreateResponse {
  session_id: string;
  expires_at: string;
}

/** One question-answer pair, as `GET /history/{session_id}` returns it. */
export interface HistoryItemDto {
  question: string;
  answer: string;
  answered: boolean;
  confidence?: number;
  sources: SourceDto[];
  created_at: string;
}

/** `GET /history/{session_id}` response: a bare list, oldest or newest first. */
export type HistoryListDto = HistoryItemDto[];

/** One citation backing an answer. */
export interface SourceDto {
  document: string;
  section: string;
  /** The passage the answer was drawn from. */
  snippet: string;
  /**
   * Retrieval relevance. The schema documents neither its range nor its unit, so
   * it is carried through untouched and never rendered as a number.
   */
  score: number;
}

/** `POST /chat` request body. */
export interface ChatRequestDto {
  session_id: string;
  /** The backend rejects questions shorter than 3 or longer than 500 characters. */
  question: string;
}

/** `POST /chat` response. */
export interface ChatResponseDto {
  answer: string;
  answered: boolean;
  confidence?: number;
  sources?: SourceDto[];
}

/**
 * The backend sends its timestamps with a timezone designator, but not always,
 * so `new Date()` would read a bare value as local time. This appends the
 * designator only when one is missing.
 */
export function parseUtcTimestamp(value: string): string {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
}
