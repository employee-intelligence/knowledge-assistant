import { Message, SourceReference } from './message.model';

export type { Message, SourceReference };
export type { MessageRole, AnswerStatus } from './message.model';

/**
 * A session as this browser's own list of them holds it.
 *
 * One of these is one row in the sidebar, however many questions have been asked
 * in it. That is the whole point of the model: follow-ups extend the session
 * they belong to rather than each adding an entry, so a user reading back through
 * their own work sees whole threads.
 */
export interface Session {
  id: string;
  /**
   * The session's name, or null while it has none.
   *
   * Null is a real state, not a gap in the data: a session starts unnamed and is
   * named once its first exchange has been answered.
   */
  title: string | null;
  /**
   * When the session was last active, and what the list is ordered by.
   */
  updatedAt: string;
}

/** Shown in the sidebar and the sessions list for a session with no name. */
export const UNTITLED_SESSION = 'New session';

/**
 * One session with its thread loaded.
 *
 * Separate from `Session` because the list endpoint does not return messages
 * and the history endpoint does not return an activity timestamp.
 */
export interface SessionThread {
  id: string;
  title: string | null;
  /** Every message, oldest first, as the thread renders them. */
  messages: Message[];
}
