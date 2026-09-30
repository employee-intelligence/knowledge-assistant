import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL, SESSION_STORAGE_KEY } from '../api.config';
import { AnswerResponse, SourceReference } from '../models/message.model';
import { HistoryService } from './history.service';

const SESSION_ID = 'sess-1234';
const MINUTE = 60_000;
const DAY = 86_400_000;

/** A turn as the backend's history returns one. */
const historyItem = (question: string, answer: string, createdAt: string, answered = true) => ({
  question,
  answer,
  answered,
  sources: [],
  created_at: createdAt,
});

/** A citation, for the answers that need to be grounded. */
const source = (document: string) => ({
  document,
  section: 'Section 1',
  snippet: 'A passage.',
  score: 0.5,
});

/** An answer as `ApiService` hands one to the service. */
const answer = (text: string, sources: SourceReference[] = []): AnswerResponse => ({
  text,
  status: 'answered',
  sources,
});

describe('HistoryService', () => {
  let history: HistoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    // The session id is deliberately kept in storage so a reload keeps the
    // conversation, which means it also survives between tests unless cleared.
    sessionStorage.clear();

    // Configured but deliberately not injected: the service loads on construction,
    // so a test chooses when that happens by choosing when to inject.
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    http?.verify();
    sessionStorage.clear();
  });

  /** Injects the service, which fetches the history of a session already stored. */
  const injectService = (): HttpTestingController => {
    history = TestBed.inject(HistoryService);
    http = TestBed.inject(HttpTestingController);

    return http;
  };

  /**
   * Puts a live session in storage, which is what a reload of a browser that has
   * already asked something finds. The service fetches history for a session that
   * is already there and opens none of its own.
   */
  const givenStoredSession = (): void => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ id: SESSION_ID, expiresAt: Date.now() + 3_600_000 }),
    );
  };

  /** Runs the constructor's load all the way through, landing the given history. */
  const givenHistory = (items: unknown[]): void => {
    givenStoredSession();
    injectService();
    http.expectOne(`${API_BASE_URL}/history/${SESSION_ID}`).flush(items);
  };

  it('asks for nothing on a browser that has never asked anything', () => {
    injectService();

    // No stored session means no conversation to restore, so the page load spends
    // no request at all. The session belongs to the first question.
    http.expectNone(`${API_BASE_URL}/sessions`);
    http.expectNone(`${API_BASE_URL}/history/${SESSION_ID}`);

    expect(history.turns()).toEqual([]);
    expect(history.isLoading()).toBe(false);
    // Loaded anyway, so a question asked here is not held back waiting for a fetch
    // that was never going to be made.
    expect(history.isLoaded()).toBe(true);
  });

  it('restores the conversation a reload left behind', () => {
    givenStoredSession();
    injectService();

    // One request, for the history that exists. No new session is opened over it.
    http.expectNone(`${API_BASE_URL}/sessions`);

    // Newest first, as the endpoint returns, so the reversal in the API service is
    // what puts the conversation in the order a thread is read in.
    http.expectOne(`${API_BASE_URL}/history/${SESSION_ID}`).flush([
      historyItem('And carryover?', 'Five days.', '2026-09-30T09:00:00Z'),
      historyItem('How much leave?', 'Twenty days.', '2026-09-30T08:00:00Z'),
    ]);

    expect(history.hasHistory()).toBe(true);
    expect(history.turns().map((turn) => turn.question)).toEqual([
      'How much leave?',
      'And carryover?',
    ]);
  });

  it('keys turns by position, so a link to one survives a reload', () => {
    givenHistory([
      historyItem('First?', 'Yes.', '2026-09-30T08:00:00Z'),
      historyItem('Second?', 'No.', '2026-09-30T09:00:00Z'),
    ]);

    expect(history.turns().map((turn) => turn.id)).toEqual(['0', '1']);
    expect(history.entries().map((entry) => entry.question.id)).toEqual(['0', '1']);
  });

  it('carries an unanswered history row through as a genuine gap', () => {
    givenHistory([historyItem('Plant policy?', 'No mention of that.', '2026-09-30T08:00:00Z', false)]);

    expect(history.turns()[0].status).toBe('not-found');
    expect(history.entries()[0].question.answerStatus).toBe('not-found');
  });

  it('reports being loaded until the fetch lands, then stops', () => {
    givenStoredSession();
    injectService();

    expect(history.isLoading()).toBe(true);
    expect(history.isLoaded()).toBe(false);

    http.expectOne(`${API_BASE_URL}/history/${SESSION_ID}`).flush([]);

    expect(history.isLoading()).toBe(false);
    expect(history.isLoaded()).toBe(true);
  });

  describe('a turn being asked', () => {
    beforeEach(() => givenHistory([]));

    it('records the question before any answer exists', () => {
      const turnId = history.appendPendingTurn('What is the carryover limit?');

      expect(turnId).toBe('0');
      expect(history.turnAt('0')?.status).toBe('pending');
      expect(history.turnAt('0')?.answer).toBe('');
      // The list the user reads grows on submit, not on response.
      expect(history.entries()).toHaveLength(1);
    });

    it('gives each new turn the next position', () => {
      expect(history.appendPendingTurn('First?')).toBe('0');
      expect(history.appendPendingTurn('Second?')).toBe('1');
      expect(history.appendPendingTurn('Third?')).toBe('2');
    });

    it('writes the answer onto the turn that asked for it', () => {
      const turnId = history.appendPendingTurn('What is the carryover limit?');

      history.resolveTurn(turnId, answer('Up to five days.', [source('Leave Policy')]));

      expect(history.turnAt(turnId)?.status).toBe('answered');
      expect(history.turnAt(turnId)?.answer).toBe('Up to five days.');
      expect(history.entries()[0].answerPreview).toBe('Up to five days.');
    });

    it('counts the distinct documents an answer cites, not the passages', () => {
      const turnId = history.appendPendingTurn('What is the carryover limit?');

      // Three citations, two of them from the same document.
      history.resolveTurn(
        turnId,
        answer('Up to five days.', [source('Leave Policy'), source('Leave Policy'), source('Staff Handbook')]),
      );

      expect(history.entries()[0].question.documentCount).toBe(2);
    });

    it('stores a failure as the turn text, so there is one place to read it from', () => {
      const turnId = history.appendPendingTurn('What is the carryover limit?');

      history.failTurn(turnId, 'The assistant is temporarily unavailable.');

      expect(history.turnAt(turnId)?.status).toBe('failed');
      expect(history.turnAt(turnId)?.answer).toBe('The assistant is temporarily unavailable.');
      expect(history.turnAt(turnId)?.sources).toEqual([]);
    });

    it('puts a turn back to pending, so a retry shows the search state again', () => {
      const turnId = history.appendPendingTurn('Carryover?');

      history.failTurn(turnId, 'It broke.');
      history.markTurnPending(turnId);

      expect(history.turnAt(turnId)?.status).toBe('pending');
      expect(history.turnAt(turnId)?.answer).toBe('');
    });

    it('ignores an answer for a turn that is no longer there', () => {
      history.appendPendingTurn('First?');

      expect(() => history.resolveTurn('99', answer('Too late'))).not.toThrow();
      expect(history.turnAt('0')?.status).toBe('pending');
    });
  });

  describe('search and grouping', () => {
    beforeEach(() =>
      givenHistory([
        historyItem('Annual leave policy', 'Twenty-five days per year', '2026-09-30T08:00:00Z'),
        historyItem('Password reset', 'Use the self-service portal', '2026-09-30T09:00:00Z'),
      ]),
    );

    it('matches the term against both the question and the answer', () => {
      history.setSearchTerm('annual');
      expect(history.filteredEntries().map((entry) => entry.question.title)).toEqual([
        'Annual leave policy',
      ]);

      history.setSearchTerm('self-service');
      expect(history.filteredEntries().map((entry) => entry.question.title)).toEqual([
        'Password reset',
      ]);

      history.setSearchTerm('  ANNUAL  ');
      expect(history.filteredEntries()).toHaveLength(1);
    });

    it('flags a search that matched nothing, but not an empty history', () => {
      expect(history.hasNoResults()).toBe(false);

      history.setSearchTerm('nothing matches this');
      expect(history.hasNoResults()).toBe(true);

      history.clearSearch();
      expect(history.hasNoResults()).toBe(false);
    });
  });

  it('groups by date with Recent first', () => {
    givenHistory([
      historyItem('Recent question', 'Yes', new Date().toISOString()),
      historyItem('Old question', 'No', new Date(Date.now() - 30 * DAY).toISOString()),
      historyItem('Also recent', 'Yes', new Date(Date.now() - 2 * MINUTE).toISOString()),
    ]);

    expect(history.groups().map((group) => group.bucket)).toEqual(['Recent', 'Old']);
    expect(history.groups().map((group) => group.entries.length)).toEqual([2, 1]);
  });

  it('keeps Recent first even when a search only matches an old question', () => {
    givenHistory([
      historyItem('Recent question', 'Yes', new Date().toISOString()),
      historyItem('Old question', 'No', new Date(Date.now() - 30 * DAY).toISOString()),
    ]);

    history.setSearchTerm('old');

    expect(history.groups().map((group) => group.bucket)).toEqual(['Old']);
  });

  it('settles ready() once the first load lands, so asks cannot race it', () => {
    let ready = false;

    givenStoredSession();
    injectService();
    history.ready().subscribe(() => (ready = true));

    expect(ready).toBe(false);

    http.expectOne(`${API_BASE_URL}/history/${SESSION_ID}`).flush([]);
    expect(ready).toBe(true);

    // A later subscriber is not left waiting on a load that already happened.
    let readyAgain = false;
    history.ready().subscribe(() => (readyAgain = true));
    expect(readyAgain).toBe(true);
  });

  it('settles ready() even when the load fails, so a dead backend cannot wedge asks', () => {
    let ready = false;

    givenStoredSession();
    injectService();
    history.ready().subscribe(() => (ready = true));

    http
      .expectOne(`${API_BASE_URL}/history/${SESSION_ID}`)
      .flush('boom', { status: 500, statusText: 'Error' });

    expect(ready).toBe(true);
    expect(history.isLoaded()).toBe(true);
    expect(history.turns()).toEqual([]);
  });

  it('drops turns that belonged to a session the backend has since forgotten', () => {
    givenHistory([historyItem('First?', 'Yes', '2026-09-30T08:00:00Z')]);

    expect(history.hasHistory()).toBe(true);

    // A reload after the session expired. The session is gone for good, so the
    // turns that belonged to it go too rather than being shown against a session
    // the backend knows nothing about.
    history.load();

    http
      .expectOne(`${API_BASE_URL}/history/${SESSION_ID}`)
      .flush('Not Found', { status: 404, statusText: 'Not Found' });

    expect(history.hasHistory()).toBe(false);
  });
});
