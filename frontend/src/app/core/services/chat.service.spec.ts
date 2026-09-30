import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL, SESSION_STORAGE_KEY } from '../api.config';
import { ChatService } from './chat.service';
import { HistoryService } from './history.service';
import { SessionService } from './session.service';

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
  let session: SessionService;
  let http: HttpTestingController;

/**
   * Injects the service with a stored session whose history has landed, which is
   * the settled state an ask normally starts from.
   */
  const givenSettledSession = (): void => {
    injectService();
    http.expectOne(`${API_BASE_URL}/history/sess-1234`).flush([]);
  };

  /** Injects the service, which restores the history of a session already stored. */
  const injectService = (): HttpTestingController => {
    chat = TestBed.inject(ChatService);
    history = TestBed.inject(HistoryService);
    session = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);

    return http;
  };

  /** Puts a live session in storage, as a reload of an active browser finds one. */
  const givenStoredSession = (): void => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ id: 'sess-1234', expiresAt: Date.now() + 3_600_000 }),
    );
  };

  /** Answers the session creation the first question triggers. */
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

    // A browser that has asked something before, which is the state most of these
    // start from. Tests that care about the very first visit set their own.
    givenStoredSession();

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
      http
        .expectOne(`${API_BASE_URL}/chat`)
        .flush(
          { detail: [{ loc: ['body', 'question'], msg: 'too short', type: 'string_too_short' }] },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      expect(chat.messages()[1].status).toBe('failed');
      expect(chat.messages()[1].text).toContain('Try rephrasing your question');
    });
  });

  describe('a session that has expired', () => {
    beforeEach(givenSettledSession);

    /**
     * The backend answers a question it will not accept with a 200 rather than a
     * status the client can branch on, so this is the only signal it gets.
     */
    const SESSION_GONE = {
      answer: 'Session expired or invalid. Please create a new session.',
      answered: false,
      sources: [],
    };

    it('reports the expiry instead of showing the question as unanswerable', () => {
      chat.ask('How much leave?');
      answerTheQuestion(SESSION_GONE);

      // Told the session is gone, which is what happened. Reading this as a gap in
      // the documents would have claimed the question was never answerable.
      expect(chat.sessionExpired()).toBe(true);
      expect(chat.isEmpty()).toBe(true);
    });

    it('does not file the unasked question as a failed turn', () => {
      chat.ask('How much leave?');
      answerTheQuestion(SESSION_GONE);

      // Every turn in the thread was filed under the dead id, so the view shows
      // the expiry rather than a card the user could only retry into the same
      // closed session.
      expect(chat.messages()).toEqual([]);
      expect(chat.isLoading()).toBe(false);
    });

    it('retires the dead id so a new conversation opens a fresh session', () => {
      chat.ask('How much leave?');
      answerTheQuestion(SESSION_GONE);

      expect(session.sessionId()).toBeNull();
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

      chat.startNewConversation();
      chat.ask('A new question?');

      http.expectOne(`${API_BASE_URL}/sessions`).flush({
        session_id: 'sess-5678',
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      });

      const asked = http.expectOne(`${API_BASE_URL}/chat`);

      expect(asked.request.body).toEqual({ session_id: 'sess-5678', question: 'A new question?' });
      asked.flush({ answer: 'A new answer.', answered: true, sources: [] });
    });

    it('reports the expiry when the backend rejects the session with a status', () => {
      chat.ask('How much leave?');
      http
        .expectOne(`${API_BASE_URL}/chat`)
        .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(chat.sessionExpired()).toBe(true);
      expect(chat.messages()).toEqual([]);
    });

    it('keeps a genuine gap in the documents out of the expiry path', () => {
      chat.ask('What is the office plant policy?');
      answerTheQuestion({ answer: 'No mention of that.', answered: false, sources: [] });

      // The same `answered: false` the backend uses for a dead session, but a real
      // answer about the corpus. Retiring the session here would discard a
      // conversation the user is still in the middle of.
      expect(chat.sessionExpired()).toBe(false);
      expect(chat.messages()[1].status).toBe('not-found');
      expect(session.sessionId()).toBe('sess-1234');
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

    it('asks every question in the conversation under one session', () => {
      // The whole conversation shares a session. A fresh one per question would
      // file each turn under its own id, so `/history` would only ever hold the
      // last question asked and the sidebar would empty itself after every ask.
      http.expectNone(`${API_BASE_URL}/sessions`);

      chat.ask('Third?');
      const request = http.expectOne(`${API_BASE_URL}/chat`);

      expect(request.request.body).toEqual({ session_id: 'sess-1234', question: 'Third?' });
      request.flush({ answer: 'Third answer.', answered: true, sources: [] });
      http.expectNone(`${API_BASE_URL}/sessions`);

      expect(session.sessionId()).toBe('sess-1234');
    });

    it('shows the conversation that led to an older turn, not a bare answer', () => {
      chat.openTurn('0');

      expect(chat.threadTitle()).toBe('First?');
      expect(chat.messages().map((message) => message.text)).toEqual(['First?', 'First answer.']);
    });

    it('has nothing to show for an id that is not one of this session turns', () => {
      chat.openTurn('99');

      expect(chat.hasMessages()).toBe(false);
      expect(chat.activeTurnId()).toBeNull();
    });

    it('returns to following the newest turn', () => {
      chat.openTurn('0');
      chat.stopFollowing();

      expect(chat.activeTurnId()).toBe('1');
    });

    it('starts an empty conversation, retiring the session with the turns', () => {
      // A new conversation is not the same session pointed back at its first
      // turn. The backend scopes history by session, so keeping it would list the
      // old conversation's questions in a thread meant to be empty.
      expect(session.sessionExpired()).toBe(false);

      chat.startNewConversation();

      expect(chat.messages()).toEqual([]);
      expect(chat.hasMessages()).toBe(false);
      expect(chat.isEmpty()).toBe(true);
      // The stored id is gone, so the next question opens a fresh session.
      expect(session.sessionId()).toBeNull();
    });

    it('opens a new session for the first question after a new conversation', () => {
      // The whole point of retiring the session: the next question must not be
      // filed beside the conversation the user just walked away from.
      chat.startNewConversation();
      chat.ask('A new question?');

      const created = http.expectOne(`${API_BASE_URL}/sessions`);

      created.flush({
        session_id: 'sess-5678',
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      });

      const asked = http.expectOne(`${API_BASE_URL}/chat`);

      expect(asked.request.body).toEqual({ session_id: 'sess-5678', question: 'A new question?' });
      asked.flush({ answer: 'A new answer.', answered: true, sources: [] });

      expect(chat.messages().map((message) => message.text)).toEqual([
        'A new question?',
        'A new answer.',
      ]);
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

      expect(request.request.body).toEqual({
        session_id: 'sess-1234',
        question: 'How much leave?',
      });
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

    // The history is slow to arrive, so the ask is queued behind it rather than
    // numbering a turn against a list that is about to land.
    chat.ask('First?');
    expect(chat.hasMessages()).toBe(false);

    http.expectOne(`${API_BASE_URL}/history/sess-1234`).flush([
      {
        question: 'Older question',
        answer: 'Older answer.',
        answered: true,
        sources: [],
        created_at: '2026-09-30T08:00:00Z',
      },
    ]);

    // A turn needs a session to be posted under, so this is where one opens if
    // there was not already one, which there was here.
    http.expectOne(`${API_BASE_URL}/chat`).flush({ answer: 'Yes.', answered: true, sources: [] });

    // Position 1, not 0: the server's turn kept the position it has on reload.
    expect(chat.activeTurnId()).toBe('1');
    expect(history.turns().map((turn) => turn.question)).toEqual(['Older question', 'First?']);
  });

  describe('a browser that has never asked anything', () => {
    beforeEach(() => sessionStorage.clear());

    it('spends no request at all before the first question', () => {
      injectService();

      // Nothing stored means no conversation to restore, so the page load opens no
      // session and fetches no history.
      http.expectNone(`${API_BASE_URL}/sessions`);
      http.expectNone(`${API_BASE_URL}/history/sess-1234`);
    });

    it('opens one session for the first question and keeps it for the rest', () => {
      injectService();
      chat.ask('How much leave?');

      const created = http.expectOne(`${API_BASE_URL}/sessions`);

      created.flush({
        session_id: 'sess-1234',
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      });

      const first = http.expectOne(`${API_BASE_URL}/chat`);

      expect(first.request.body).toEqual({ session_id: 'sess-1234', question: 'How much leave?' });
      first.flush({ answer: 'Twenty days.', answered: true, sources: [] });

      chat.ask('And carryover?');

      // One session covers the whole conversation, not one per question.
      http.expectNone(`${API_BASE_URL}/sessions`);
      const second = http.expectOne(`${API_BASE_URL}/chat`);

      expect(second.request.body).toEqual({ session_id: 'sess-1234', question: 'And carryover?' });
      second.flush({ answer: 'Five days.', answered: true, sources: [] });

      expect(chat.messages().map((message) => message.text)).toEqual([
        'How much leave?',
        'Twenty days.',
        'And carryover?',
        'Five days.',
      ]);
    });
  });
});
