import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../api.config';
import { ChatService } from './chat.service';
import { HistoryService } from './history.service';

/** A citation as the backend sends one. */
const SOURCE = {
  document: 'Leave Policy',
  section: 'Section 4.2',
  snippet: 'Annual leave accrues monthly at 1.67 days per month.',
  score: 0.82,
};

describe('ChatService', () => {
  let chat: ChatService;
  let history: HistoryService;
  let http: HttpTestingController;

  /**
   * Injects the service with a session already open and its history landed, which
   * is the settled state an ask normally starts from.
   */
  const givenSettledSession = (): void => {
    injectService();
    openSession();
    http.expectOne(`${API_BASE_URL}/history/sess-1234`).flush([]);
  };

  /** Injects the service, which starts a session and fetches its history. */
  const injectService = (): HttpTestingController => {
    chat = TestBed.inject(ChatService);
    history = TestBed.inject(HistoryService);
    http = TestBed.inject(HttpTestingController);

    return http;
  };

  /** Answers the session creation the service makes on construction. */
  const openSession = (): void => {
    http.expectOne(`${API_BASE_URL}/sessions`).flush({
      session_id: 'sess-1234',
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
  };

  /** The response a question gets back. */
  const answerTheQuestion = (body: Record<string, unknown>): void => {
    http.expectOne(`${API_BASE_URL}/chat`).flush(body);
  };

  beforeEach(() => {
    sessionStorage.clear();

    // Configured but deliberately not injected: the services load on
    // construction, so each test chooses when that happens.
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    http?.verify();
    sessionStorage.clear();
  });

  describe('asking', () => {
    beforeEach(givenSettledSession);

    it('posts the question under the session id the backend issued', () => {
      chat.ask('How much annual leave do I have?');

      const request = http.expectOne(`${API_BASE_URL}/chat`);

      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        session_id: 'sess-1234',
        question: 'How much annual leave do I have?',
      });

      request.flush({ answer: 'Twenty days.', answered: true, sources: [] });
    });

    it('shows the question and a pending answer before the request is sent', () => {
      chat.ask('How much leave?');

      // Feedback lands on submit, not after the round trip.
      expect(chat.hasMessages()).toBe(true);
      expect(chat.messages().map((message) => [message.role, message.status])).toEqual([
        ['user', 'pending'],
        ['assistant', 'pending'],
      ]);
      expect(chat.isLoading()).toBe(true);

      answerTheQuestion({ answer: 'Twenty days.', answered: true, sources: [] });
    });

    it('renders the answer and its citations once they arrive', () => {
      chat.ask('How much leave?');
      answerTheQuestion({
        answer: 'Twenty days per year.',
        answered: true,
        sources: [SOURCE, { ...SOURCE, document: 'Staff Handbook' }],
      });

      const [question, answer] = chat.messages();

      expect(question.text).toBe('How much leave?');
      expect(question.sources).toEqual([]);
      expect(answer.text).toBe('Twenty days per year.');
      expect(answer.status).toBe('answered');
      expect(answer.sources).toHaveLength(2);
      // Distinct documents, so one heavily quoted policy is not counted twice.
      expect(answer.documentCount).toBe(2);
      expect(chat.isLoading()).toBe(false);
    });

    it('renders an unanswered response as a gap, not as a failure', () => {
      chat.ask('What is the office plant policy?');
      answerTheQuestion({ answer: 'No mention of that.', answered: false, sources: [] });

      expect(chat.messages()[1].status).toBe('not-found');
    });

    it('refuses a blank question without spending a request', () => {
      chat.ask('   ');

      expect(chat.hasMessages()).toBe(false);
      http.expectNone(`${API_BASE_URL}/chat`);
    });

    it('keeps the composer usable when a request fails', () => {
      chat.ask('How much leave?');
      http
        .expectOne(`${API_BASE_URL}/chat`)
        .flush('Internal Server Error', { status: 500, statusText: 'Server Error' });

      // A stuck busy state would disable the composer for the rest of the session.
      expect(chat.isLoading()).toBe(false);
      expect(chat.messages()[1].status).toBe('failed');
      expect(chat.messages()[1].text).toContain('temporarily unavailable');
    });

    it('nudges toward rephrasing when the backend rejected the question itself', () => {
      chat.ask('Hi');
      http.expectOne(`${API_BASE_URL}/chat`).flush(
        { detail: [{ loc: ['body', 'question'], msg: 'too short', type: 'string_too_short' }] },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      expect(chat.messages()[1].status).toBe('failed');
      expect(chat.messages()[1].text).toContain('Try rephrasing your question');
    });
  });

  describe('a conversation of several turns', () => {
    beforeEach(() => {
      givenSettledSession();

      chat.ask('First?');
      answerTheQuestion({ answer: 'First answer.', answered: true, sources: [] });
      chat.ask('Second?');
      answerTheQuestion({ answer: 'Second answer.', answered: true, sources: [] });
    });

    it('follows the newest turn when no id is asked for', () => {
      chat.openTurn(null);

      expect(chat.activeTurnId()).toBe('1');
      expect(chat.threadTitle()).toBe('Second?');
    });

    it('shows the conversation that led to an older turn, not a bare answer', () => {
      chat.openTurn('0');

      expect(chat.threadTitle()).toBe('First?');
      expect(chat.messages().map((message) => message.text)).toEqual([
        'First?',
        'First answer.',
      ]);
    });

    it('has nothing to show for an id that is not one of this session turns', () => {
      chat.openTurn('99');

      expect(chat.hasMessages()).toBe(false);
      expect(chat.activeTurnId()).toBeNull();
    });

    it('returns to following the newest turn', () => {
      chat.openTurn('0');
      chat.startNewConversation();

      expect(chat.activeTurnId()).toBe('1');
    });
  });

  describe('retrying a failed turn', () => {
    beforeEach(() => {
      givenSettledSession();

      chat.ask('How much leave?');
      http
        .expectOne(`${API_BASE_URL}/chat`)
        .flush('Internal Server Error', { status: 500, statusText: 'Server Error' });
    });

    it('asks the same question again under the same session', () => {
      chat.retry('0');

      const request = http.expectOne(`${API_BASE_URL}/chat`);

      expect(request.request.body).toEqual({ session_id: 'sess-1234', question: 'How much leave?' });
      request.flush({ answer: 'Twenty days.', answered: true, sources: [] });
    });

    it('reuses the turn rather than duplicating it, so its link and row survive', () => {
      chat.retry('0');
      answerTheQuestion({ answer: 'Twenty days.', answered: true, sources: [] });

      expect(chat.messages()).toHaveLength(2);
      expect(chat.activeTurnId()).toBe('0');
      expect(chat.messages()[1].status).toBe('answered');
    });

    it('shows the question as pending again while the retry is in flight', () => {
      chat.retry('0');

      expect(chat.messages()[1].status).toBe('pending');
      expect(chat.isLoading()).toBe(true);

      answerTheQuestion({ answer: 'Twenty days.', answered: true, sources: [] });
      expect(chat.isLoading()).toBe(false);
    });

    it('ignores a retry for a turn that is not there', () => {
      chat.retry('99');

      http.expectNone(`${API_BASE_URL}/chat`);
    });
  });

  it('waits for the session history to land before numbering a new turn', () => {
    injectService();

    // The session is slow to open, so the ask is queued behind it rather than
    // numbering a turn against a list that is about to arrive.
    chat.ask('First?');
    expect(chat.hasMessages()).toBe(false);

    http.expectOne(`${API_BASE_URL}/sessions`).flush({
      session_id: 'sess-1234',
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    http
      .expectOne(`${API_BASE_URL}/history/sess-1234`)
      .flush([
        {
          question: 'Older question',
          answer: 'Older answer.',
          answered: true,
          sources: [],
          created_at: '2026-09-30T08:00:00Z',
        },
      ]);

    http.expectOne(`${API_BASE_URL}/chat`).flush({ answer: 'Yes.', answered: true, sources: [] });

    // Position 1, not 0: the server's turn kept the position it has on reload.
    expect(chat.activeTurnId()).toBe('1');
    expect(history.turns().map((turn) => turn.question)).toEqual(['Older question', 'First?']);
  });
});
