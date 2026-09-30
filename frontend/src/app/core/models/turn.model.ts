import { AnswerStatus } from './question.model';
import { SourceReference } from './message.model';

/**
 * One question and the answer it produced, which is the unit the backend's
 * history is actually made of.
 *
 * A turn exists for its whole life, including before an answer has come back and
 * after a request has failed, so `status` and `answer` are read together rather
 * than `answer` being treated as the signal that a turn is real.
 */
export interface Turn {
  /** The turn's position in the session, as a string. See `Question.id`. */
  id: string;
  question: string;
  /** Empty while pending; the failure message when failed; otherwise the answer. */
  answer: string;
  status: AnswerStatus;
  sources: SourceReference[];
  createdAt: string;
}
