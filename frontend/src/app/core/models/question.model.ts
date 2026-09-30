/**
 * Outcome of a single question/answer turn.
 *
 * `failed` is a transport outcome rather than an answer outcome: the assistant
 * never got to answer. It is kept distinct from `not-found`, which is the
 * assistant reporting that the corpus genuinely has nothing, because the two
 * need different wording and different recovery.
 */
export type AnswerStatus = 'pending' | 'answered' | 'not-found' | 'failed';

/**
 * A question the user has asked, with the summary metadata the sidebar and the
 * history list render.
 */
export interface Question {
  /**
   * The turn's position in the session, as a string. The backend keys history by
   * session rather than by question, so there is no server-side question id to
   * hold. Positions are stable because a session's history only ever grows at the
   * end, which is what makes `/response/:id` survive a reload.
   */
  id: string;
  /** The question as asked, and the conversation title. */
  title: string;
  askedAt: string;
  answerStatus: AnswerStatus;
  /** Distinct documents cited by the answer, counted from the answer's sources. */
  documentCount: number;
}

/** A question shown in the sidebar and history lists. */
export interface HistoryEntry {
  question: Question;
  /** Short preview of the answer, shown in the history view only. */
  answerPreview: string;
}
