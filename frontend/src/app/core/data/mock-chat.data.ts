import { ChatSession } from '../models/chat-session.model';
import { AnswerResponse, Message } from '../models/message.model';
import { HistoryEntry, Question } from '../models/question.model';

/** Base date the mock corpus was "last indexed", used for the grounded-in hint. */
const CORPUS_UPDATED_AT = '2026-09-20T09:00:00.000Z';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MINUTE = 60_000;
const MINUTES_PER_DAY = 24 * 60;

/** ISO timestamp a number of minutes before now, so mock data never goes stale. */
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * MINUTE).toISOString();
}

/** ISO timestamp a number of days before now. */
function daysAgo(days: number, minutes = 0): string {
  return new Date(Date.now() - days * DAY - minutes * MINUTE).toISOString();
}

/** The signed-in employee, shown in the sidebar footer. */
/** Starter prompts offered on the dashboard, matching the design. */
export const MOCK_SUGGESTIONS: string[] = [
  'How many annual leave days do I have?',
  'How do I set up my company email?',
  'What do I need to complete during onboarding?',
];

interface MockTurn {
  text: string;
  status: Message['status'];
  sources: Message['sources'];
  documentCount: number;
  askedMinutesAgo: number;
}

/**
 * Canned answers keyed by a fragment of the question they answer.
 * Anything unmatched falls back to the "not found in company documents"
 * state, which is also a state the real assistant can legitimately return.
 */
const MOCK_ANSWERS: {
  matches: (question: string) => boolean;
  turn: Omit<MockTurn, 'askedMinutesAgo'>;
}[] = [
  {
    matches: (question) => /leave|annual|holiday/i.test(question),
    turn: {
      status: 'answered',
      text: 'You are entitled to 20 working days of annual leave per calendar year. Leave accrues monthly and must be approved by your line manager at least 5 working days in advance.',
      sources: [
        { document: 'Staff Handbook', section: 'Section 4.2', page: 12 },
        { document: 'Leave Policy', section: 'Section 2.1', page: 4 },
      ],
      documentCount: 4,
    },
  },
  {
    matches: (question) => /email|mailbox|outlook/i.test(question),
    turn: {
      status: 'answered',
      text: 'Your company mailbox is created automatically on your first day. Open the IT Self-Service Portal, choose "Request mailbox", and sign in with your single sign-on credentials. Access is provisioned within one working day.',
      sources: [
        { document: 'IT Setup Guide', section: 'Section 1.4', page: 3 },
        { document: 'Staff Handbook', section: 'Section 6.1', page: 28 },
      ],
      documentCount: 3,
    },
  },
  {
    matches: (question) => /onboarding|first day|new starter/i.test(question),
    turn: {
      status: 'answered',
      text: 'Onboarding requires a signed contract, proof of address, a completed tax declaration, and your bank details for payroll. Your manager submits the checklist on your behalf before day one.',
      sources: [
        { document: 'Onboarding Checklist', section: 'Section 1', page: 1 },
        { document: 'Staff Handbook', section: 'Section 2.3', page: 9 },
      ],
      documentCount: 5,
    },
  },
  {
    matches: (question) => /carry|roll ?over|save.*leave/i.test(question),
    turn: {
      status: 'answered',
      text: 'Up to 5 unused days may be carried into the following year and must be taken before 31 March. Any remaining balance is forfeited.',
      sources: [{ document: 'Leave Policy', section: 'Section 3.4', page: 7 }],
      documentCount: 2,
    },
  },
];

const NOT_FOUND_TURN: Omit<MockTurn, 'askedMinutesAgo'> = {
  status: 'not-found',
  text: "I couldn't find information about that in the available company documents.",
  sources: [],
  documentCount: 0,
};

/** The answer the assistant returns for a given question. */
export function mockAnswerFor(question: string): AnswerResponse {
  const match = MOCK_ANSWERS.find((candidate) => candidate.matches(question));

  if (match) {
    return {
      text: match.turn.text,
      status: match.turn.status,
      sources: match.turn.sources,
      documentCount: match.turn.documentCount,
    };
  }

  return {
    text: NOT_FOUND_TURN.text,
    status: NOT_FOUND_TURN.status,
    sources: NOT_FOUND_TURN.sources,
    documentCount: NOT_FOUND_TURN.documentCount,
  };
}

/**
 * Seeds the pre-existing history shown before the user asks anything. The
 * questions straddle the seven day line so both list headings are populated.
 */
const SEED_TURNS: { title: string; topic: string; turn: MockTurn; preview: string }[] = [
  {
    title: 'How many days of annual leave am I entitled to?',
    topic: 'Annual leave entitlement',
    turn: { ...MOCK_ANSWERS[0].turn, askedMinutesAgo: 38 },
    preview: 'You are entitled to 20 working days of annual leave per calendar year.',
  },
  {
    title: 'How do I set up my company email?',
    topic: 'Company email setup',
    turn: { ...MOCK_ANSWERS[1].turn, askedMinutesAgo: 201 },
    preview: 'Your company mailbox is created automatically on your first day.',
  },
  {
    title: 'What documents do I need for onboarding?',
    topic: 'Onboarding paperwork',
    turn: { ...MOCK_ANSWERS[2].turn, askedMinutesAgo: 2 * MINUTES_PER_DAY },
    preview: 'Onboarding requires a signed contract, proof of address, and a tax declaration.',
  },
  {
    title: 'Can I carry unused leave into next year?',
    topic: 'Carrying over leave',
    turn: { ...MOCK_ANSWERS[3].turn, askedMinutesAgo: 5 * MINUTES_PER_DAY },
    preview: 'Up to 5 unused days may be carried into the following year.',
  },
  {
    title: 'What documents do I need for onboarding?',
    topic: 'Onboarding paperwork',
    turn: { ...MOCK_ANSWERS[2].turn, askedMinutesAgo: 12 * MINUTES_PER_DAY },
    preview: 'Onboarding requires a signed contract, proof of address, and a tax declaration.',
  },
  {
    title: 'How do I set up my company email?',
    topic: 'Company email setup',
    turn: { ...MOCK_ANSWERS[1].turn, askedMinutesAgo: 31 * MINUTES_PER_DAY },
    preview: 'Your company mailbox is created automatically on your first day.',
  },
];

/** Turns belonging to a seeded thread, oldest first. */
const SEED_FOLLOW_UPS: Record<string, { text: string; turn: Omit<MockTurn, 'askedMinutesAgo'> }[]> =
  {
    'How many days of annual leave am I entitled to?': [
      {
        text: 'What is the deadline to request time off?',
        turn: {
          status: 'answered',
          text: 'Requests must be submitted at least 5 working days before the first day of leave. Requests inside that window need written approval from your head of department.',
          sources: [{ document: 'Leave Policy', section: 'Section 4.2', page: 9 }],
          documentCount: 2,
        },
      },
      {
        text: "What is the company's policy for international relocation?",
        turn: NOT_FOUND_TURN,
      },
    ],
  };

/** Every seeded question, newest first, as shown in the sidebar and history. */
export function buildMockHistory(): HistoryEntry[] {
  return SEED_TURNS.map((seed, index) => {
    const question: Question = {
      id: `q-${index + 1}`,
      title: seed.title,
      topic: seed.topic,
      askedAt: minutesAgo(seed.turn.askedMinutesAgo),
      updatedAt: minutesAgo(seed.turn.askedMinutesAgo),
      answerStatus: seed.turn.status,
      documentCount: seed.turn.documentCount,
      documentsUpdatedAt: CORPUS_UPDATED_AT,
    };

    return { question, answerPreview: seed.preview };
  });
}

/** The full thread for a seeded question, oldest turn first. */
export function buildMockSession(questionId: string): ChatSession | null {
  const seed = SEED_TURNS[Number(questionId.replace('q-', '')) - 1];

  if (!seed) {
    return null;
  }

  const question: Question = {
    id: questionId,
    title: seed.title,
    topic: seed.topic,
    askedAt: minutesAgo(seed.turn.askedMinutesAgo),
    updatedAt: minutesAgo(seed.turn.askedMinutesAgo),
    answerStatus: seed.turn.status,
    documentCount: seed.turn.documentCount,
    documentsUpdatedAt: CORPUS_UPDATED_AT,
  };

  const messages: Message[] = [
    {
      id: `${questionId}-user-0`,
      role: 'user',
      text: seed.title,
      createdAt: question.askedAt,
      status: seed.turn.status,
      sources: [],
      documentCount: seed.turn.documentCount,
    },
    {
      id: `${questionId}-assistant-0`,
      role: 'assistant',
      text: seed.turn.text,
      createdAt: new Date(new Date(question.askedAt).getTime() + MINUTE).toISOString(),
      status: seed.turn.status,
      sources: seed.turn.sources,
      documentCount: seed.turn.documentCount,
    },
  ];

  const followUps = SEED_FOLLOW_UPS[seed.title] ?? [];
  let offset = 2;

  for (const followUp of followUps) {
    const askedAt = new Date(
      new Date(question.askedAt).getTime() + offset * 4 * MINUTE,
    ).toISOString();

    messages.push({
      id: `${questionId}-user-${offset}`,
      role: 'user',
      text: followUp.text,
      createdAt: askedAt,
      status: followUp.turn.status,
      sources: [],
      documentCount: followUp.turn.documentCount,
    });
    messages.push({
      id: `${questionId}-assistant-${offset}`,
      role: 'assistant',
      text: followUp.turn.text,
      createdAt: new Date(new Date(askedAt).getTime() + MINUTE).toISOString(),
      status: followUp.turn.status,
      sources: followUp.turn.sources,
      documentCount: followUp.turn.documentCount,
    });

    offset += 2;
  }

  return { question, messages };
}
