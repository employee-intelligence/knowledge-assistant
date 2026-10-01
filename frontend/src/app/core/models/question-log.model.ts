/** How the assistant resolved an asked question. */
export type QuestionOutcome = 'answered' | 'not-found' | 'failed';

/** One question asked against the knowledge base, kept for review. */
export interface QuestionLog {
  id: string;
  question: string;
  askedBy: string;
  askedByInitials: string;
  createdAt: string;
  outcome: QuestionOutcome;
  sourceCount: number;
  durationMs: number;
}

/** Human-readable labels for each outcome. */
export const QUESTION_OUTCOME_LABELS: Record<QuestionOutcome, string> = {
  answered: 'Answered',
  'not-found': 'Not found',
  failed: 'Failed',
};
