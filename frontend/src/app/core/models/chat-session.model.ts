import { Message } from './message.model';
import { Question } from './question.model';

/**
 * A conversation: the question that opened it plus every turn that followed.
 * The session id is the `:id` segment of the response route.
 */
export interface ChatSession {
  question: Question;
  messages: Message[];
}
