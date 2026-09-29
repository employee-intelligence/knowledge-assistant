/**
 * A single citation backing an answer. Answers are always grounded in
 * documents, so the sources travel with the message rather than being
 * looked up separately.
 */
export interface SourceReference {
  /** Human readable document title, e.g. `Staff Handbook`. */
  document: string;
  /** Section reference inside the document, e.g. `Section 4.2`. */
  section: string;
  /** Page the statement was taken from. */
  page: number;
}

/** Who produced a message. */
export type MessageRole = 'user' | 'assistant';

/**
 * Lifecycle of a single turn. `pending` drives the search indicator,
 * `not-found` drives the "no results" answer card.
 */
export type MessageStatus = 'pending' | 'answered' | 'not-found';

/** Payload returned by the assistant for a single question. */
export interface AnswerResponse {
  text: string;
  status: MessageStatus;
  sources: SourceReference[];
  documentCount: number;
}

/** One turn in a conversation thread. */
export interface Message {
  id: string;
  role: MessageRole;
  /** Rendered as plain text, so answers never contain untrusted markup. */
  text: string;
  createdAt: string;
  status: MessageStatus;
  /** Populated for answered turns; empty for pending and not-found turns. */
  sources: SourceReference[];
  /** Set when the turn is grounded, used for the "Grounded in N documents" hint. */
  documentCount: number;
}
