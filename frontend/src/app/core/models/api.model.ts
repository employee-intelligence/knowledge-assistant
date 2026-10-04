/**
 * Wire types, transcribed field for field from the backend's OpenAPI schema
 * (`GET /openapi.json`). These describe what travels over HTTP and nothing else.
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
  message?: string;
}

/** One message in a session history. */
export interface HistoryMessageDto {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

/** `GET /history/{session_id}` response. */
export interface HistoryDto {
  session_id: string;
  messages: HistoryMessageDto[];
}

/** `POST /chat` request body. */
export interface ChatRequestDto {
  session_id: string;
  message: string;
}

/** `POST /chat` response. */
export interface ChatResponseDto {
  response: string;
  session_id: string;
}

/**
 * The backend sends its timestamps without a timezone designator, so `new Date()`
 * would read them as local time and put a conversation's activity hours early or
 * late depending on where the browser is. The values are UTC, and this appends the
 * designator.
 */
export function parseUtcTimestamp(value: string): string {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
}