/**
 * Wire types, transcribed field for field from the backend's OpenAPI schema
 * (`GET /openapi.json`). These describe what travels over HTTP and nothing else.
 *
 * They are kept apart from the domain models on purpose. The backend is free to
 * rename or drop a field, and when it does, the change belongs in the mapping
 * inside `ApiService` rather than rippling through every component.
 */

/** `POST /sessions`. */
export interface SessionCreateResponse {
  session_id: string;
  /** ISO timestamp. The backend sends no timezone designator, so it is parsed as UTC. */
  expires_at: string;
}

/** One citation returned with an answer or a history row. */
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
export interface ChatRequest {
  /** The backend rejects ids shorter than 8 or longer than 64 characters. */
  session_id: string;
  /** The backend rejects questions shorter than 3 or longer than 500 characters. */
  question: string;
}

/** `POST /chat` response. */
export interface ChatResponse {
  answer: string;
  /** False means the corpus genuinely holds no answer, not that the call failed. */
  answered: boolean;
  sources: SourceDto[];
}

/** One answered turn as `GET /history/{session_id}` returns it. */
export interface HistoryItemDto {
  question: string;
  answer: string;
  answered: boolean;
  sources: SourceDto[];
  created_at: string;
}

/** One entry of the `detail` array in a FastAPI 422 body. */
export interface ValidationErrorDto {
  loc: (string | number)[];
  msg: string;
  type: string;
}

/** FastAPI's 422 body, which is what a rejected question comes back as. */
export interface HttpValidationError {
  detail: ValidationErrorDto[];
}

/**
 * The backend sends `expires_at` without a timezone designator, so `new Date()`
 * would read it as local time and expire sessions hours early or late depending
 * on where the browser is. The value is UTC, and this appends the designator.
 */
export function parseUtcTimestamp(value: string): string {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
}
