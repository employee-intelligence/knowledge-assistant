import { AnswerStatus } from './question.model';

/**
 * A single citation backing an answer. Answers are grounded in documents, so the
 * sources travel with the message rather than being looked up separately.
 */
export interface SourceReference {
  /** Human readable document title, e.g. `Leave Policy`. */
  document: string;
  /** Section reference inside the document, e.g. `Section 4.2`. */
  section: string;
  /** The passage the answer was drawn from. */
  snippet: string;
  /**
   * Retrieval relevance, carried through from the backend. Never rendered as a
   * number: the API states no range or unit for it, so a percentage would be a
   * guess about a value nobody has defined.
   */
  score: number;
}

/**
 * Lifecycle of a single turn. Shared with `AnswerStatus` so a message and the
 * history row describing it can never disagree about what happened.
 */
export type MessageStatus = AnswerStatus;

/** Who produced a message. */
export type MessageRole = 'user' | 'assistant';

/**
 * Payload returned by the assistant for a single question.
 *
 * The citation count is not carried here. It is derived from `sources` wherever
 * it is needed, so there is one derivation of it rather than a number that can
 * disagree with the list it was counted from.
 */
export interface AnswerResponse {
  text: string;
  status: MessageStatus;
  sources: SourceReference[];
}

/** One turn in a conversation thread. */
export interface Message {
  id: string;
  role: MessageRole;
  /**
   * Markdown from the backend, rendered as HTML by the answer card.
   *
   * Conversion escapes the text before emitting any tag, so an answer can carry
   * formatting without being able to carry markup of its own.
   */
  text: string;
  createdAt: string;
  status: MessageStatus;
  /** Populated for answered turns; empty for pending, not-found and failed turns. */
  sources: SourceReference[];
  /** Set when the turn is grounded, used for the "Grounded in N documents" hint. */
  documentCount: number;}
