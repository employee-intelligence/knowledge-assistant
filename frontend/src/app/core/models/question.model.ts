/** Outcome of the most recent answer for a question. */
export type AnswerStatus = 'pending' | 'answered' | 'not-found' | 'failed';

/**
 * A question the user has asked, and the summary metadata both the sidebar
 * and the history view render.
 */
export interface Question {
  id: string;
  /** The question as asked; used as the conversation title. */
  title: string;
  /**
   * Short topic the assistant infers for the conversation, e.g.
   * `Annual leave entitlement`. Shown in the thread header.
   */
  topic: string;
  askedAt: string;
  updatedAt: string;
  answerStatus: AnswerStatus;
  /** Number of company documents the answer was grounded in. */
  documentCount: number;
  /** When the referenced documents were last refreshed. */
  documentsUpdatedAt: string;
}

/** A question shown in the sidebar and history lists. */
export interface HistoryEntry {
  question: Question;
  /** Short preview of the answer, shown in the history view only. */
  answerPreview: string;
}
