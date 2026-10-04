/**
 * A single citation backing an answer.
 */
export interface SourceReference {
  document: string;
  section: string;
  snippet: string;
  score: number;
}

/**
 * Outcome of a single message.
 */
export type AnswerStatus = 'pending' | 'answered' | 'failed';

/** Who produced a message. */
export type MessageRole = 'user' | 'assistant';

/** One message in a session thread. */
export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  createdAt: string;
  status: AnswerStatus;
  sources: SourceReference[];
  documentCount: number;
}

/**
 * A session as this browser's own list of them holds it.
 *
 * One of these is one row in the sidebar, however many questions have been asked
 * in it.
 */
export interface Session {
  id: string;
  title: string | null;
  updatedAt: string;
}

/** Shown in the sidebar for a session with no name. */
export const UNTITLED_SESSION = 'New session';

/**
 * One session with its thread loaded.
 */
export interface SessionThread {
  id: string;
  title: string | null;
  messages: Message[];
}