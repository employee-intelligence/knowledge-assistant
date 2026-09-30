import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../api.config';
import { ApiError, ApiService } from './api.service';

/** A citation exactly as the backend sends one. */
const SOURCE = {
  document: 'Leave Policy',
  section: 'Section 4.2',
  snippet: 'Annual leave accrues monthly at 1.67 days per month.',
  score: 0.82,
};

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('endpoint shapes', () => {
    it('opens a session with a POST and no parameters', () => {
      let received: { session_id: string; expires_at: string } | undefined;

      api.createSession().subscribe((session) => (received = session));

      const request = http.expectOne(`${API_BASE_URL}/sessions`);

      expect(request.request.method).toBe('POST');
      request.flush({ session_id: 'abc123', expires_at: '2026-09-30T09:00:00.000000' });
      expect(received?.session_id).toBe('abc123');
    });

    it('posts the session id and the question to /chat', () => {
      api.ask('sess-1234', 'How much leave do I have?').subscribe();

      const request = http.expectOne(`${API_BASE_URL}/chat`);

      expect(request.request.method).toBe('POST');
      // The backend's field names are snake_case and are not the frontend's to
      // change, so the body is asserted on the wire rather than on a renamed copy.
      expect(request.request.body).toEqual({
        session_id: 'sess-1234',
        question: 'How much leave do I have?',
      });
      request.flush({ answer: 'Twenty days.', answered: true, sources: [] });
    });

    it('reads history from /history/{session_id}', () => {
      let received: unknown;

      api.getHistory('sess-1234').subscribe((turns) => (received = turns));

      const request = http.expectOne(`${API_BASE_URL}/history/sess-1234`);

      expect(request.request.method).toBe('GET');
      request.flush([]);
      expect(received).toEqual([]);
    });

    it('escapes a session id rather than splicing it into the path', () => {
      api.getHistory('a/b?c').subscribe();

      http.expectOne(`${API_BASE_URL}/history/a%2Fb%3Fc`).flush([]);
    });
  });

  describe('answer mapping', () => {
    it('maps a grounded answer with every citation intact', () => {
      let answer: ReturnType<typeof toAnswerShape> | undefined;

      api.ask('sess-1234', 'Leave?').subscribe((value) => (answer = value));

      http.expectOne(`${API_BASE_URL}/chat`).flush({
        answer: 'You get twenty days.',
        answered: true,
        sources: [
          SOURCE,
          { ...SOURCE, section: 'Section 9' },
          { ...SOURCE, document: 'Staff Handbook' },
        ],
      });

      expect(answer?.text).toBe('You get twenty days.');
      expect(answer?.status).toBe('answered');
      // Passages, not documents: the count of distinct documents is derived from
      // this list where it is rendered, so it cannot fall out of step with it.
      expect(answer?.sources).toHaveLength(3);
    });

    it('carries the snippet through, which is what makes a citation checkable', () => {
      let answer: ReturnType<typeof toAnswerShape> | undefined;

      api.ask('sess-1234', 'Leave?').subscribe((value) => (answer = value));

      http.expectOne(`${API_BASE_URL}/chat`).flush({
        answer: 'Twenty days.',
        answered: true,
        sources: [SOURCE],
      });

      expect(answer?.sources[0]).toEqual({
        document: 'Leave Policy',
        section: 'Section 4.2',
        snippet: 'Annual leave accrues monthly at 1.67 days per month.',
        score: 0.82,
      });
    });

    it('treats answered: false as a genuine gap rather than a failure', () => {
      let answer: ReturnType<typeof toAnswerShape> | undefined;

      api.ask('sess-1234', 'Office plant policy?').subscribe((value) => (answer = value));

      http
        .expectOne(`${API_BASE_URL}/chat`)
        .flush({ answer: 'No mention of that.', answered: false, sources: [] });

      expect(answer?.status).toBe('not-found');
    });

    it('tolerates a response that omits sources rather than crashing on them', () => {
      let answer: ReturnType<typeof toAnswerShape> | undefined;

      api.ask('sess-1234', 'Leave?').subscribe((value) => (answer = value));

      http.expectOne(`${API_BASE_URL}/chat`).flush({ answer: 'Twenty days.', answered: true });

      expect(answer?.sources).toEqual([]);
    });
  });

  describe('history mapping', () => {
    it('numbers turns by position and reads timestamps as UTC', () => {
      let turns: ReturnType<typeof toTurnShape> = [];

      api.getHistory('sess-1234').subscribe((value) => (turns = value));

      // The backend sends no timezone designator, so an unadorned string has to
      // be read as UTC. Read as local time it would move a turn across a day
      // boundary and land it in the wrong history heading.
      //
      // Flushed newest first, which is the order the endpoint returns: a session
      // is listed with the most recent question at the top for the user to read.
      http.expectOne(`${API_BASE_URL}/history/sess-1234`).flush([
        {
          question: 'Second?',
          answer: 'No.',
          answered: false,
          sources: [],
          created_at: '2026-09-30T09:00:00Z',
        },
        {
          question: 'First?',
          answer: 'Yes.',
          answered: true,
          sources: [],
          created_at: '2026-09-30T08:00:00',
        },
      ]);

      // Reversed into conversation order, with id 0 still the oldest turn.
      expect(turns.map((turn) => turn.question)).toEqual(['First?', 'Second?']);
      expect(turns.map((turn) => turn.id)).toEqual(['0', '1']);
      expect(turns[0].status).toBe('answered');
      expect(turns[1].status).toBe('not-found');
      // The instant is what matters, not the formatting: an unadorned string read
      // as local time would shift the turn by the browser's offset.
      expect(turns[0].createdAt).toBe('2026-09-30T08:00:00Z');
      expect(new Date(turns[0].createdAt).getTime()).toBe(Date.parse('2026-09-30T08:00:00Z'));
    });
  });

  describe('failures', () => {
    it('marks a 5xx as transient so the thread can offer a retry', () => {
      let error: unknown;

      api.ask('sess-1234', 'Leave?').subscribe({ error: (value) => (error = value) });

      http
        .expectOne(`${API_BASE_URL}/chat`)
        .flush('Internal Server Error', { status: 500, statusText: 'Server Error' });

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).isTransient).toBe(true);
      expect((error as ApiError).status).toBe(500);
    });

    it('marks a 404 as permanent, since a lost session cannot be retried into being found', () => {
      let error: unknown;

      api.getHistory('gone').subscribe({ error: (value) => (error = value) });

      http
        .expectOne(`${API_BASE_URL}/history/gone`)
        .flush('Not Found', { status: 404, statusText: 'Not Found' });

      expect((error as ApiError).isTransient).toBe(false);
      expect((error as ApiError).status).toBe(404);
    });

    it("passes the backend's own wording through for a rejected question", () => {
      let error: unknown;

      // Two characters is below the API's minimum, which it answers with a 422.
      api.ask('sess-1234', 'Hi').subscribe({ error: (value) => (error = value) });

      http.expectOne(`${API_BASE_URL}/chat`).flush(
        {
          detail: [
            {
              loc: ['body', 'question'],
              msg: 'String should have at least 3 characters',
              type: 'string_too_short',
            },
          ],
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      expect((error as ApiError).message).toBe('String should have at least 3 characters');
      expect((error as ApiError).isTransient).toBe(false);
    });

    it('reports a network failure as transient and without a status', () => {
      let error: unknown;

      api.getHistory('sess-1234').subscribe({ error: (value) => (error = value) });

      http
        .expectOne(`${API_BASE_URL}/history/sess-1234`)
        .error(new ProgressEvent('error'), { status: 0 });

      expect((error as ApiError).status).toBe(0);
      expect((error as ApiError).isTransient).toBe(true);
      expect((error as ApiError).message).toContain('Could not get a response from the assistant');
    });
  });

  it('does not retry a chat request, because a retry would post the question twice', () => {
    let calls = 0;

    api.ask('sess-1234', 'Leave?').subscribe({ error: () => (calls += 1) });

    http
      .expectOne(`${API_BASE_URL}/chat`)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    expect(calls).toBe(1);
    http.expectNone(`${API_BASE_URL}/chat`);
  });
});

/** Shape of a mapped answer, for the assertions above. */
function toAnswerShape(): { text: string; status: string; sources: unknown[] } {
  return { text: '', status: '', sources: [] };
}

/** Shape of a mapped turn, for the assertions above. */
function toTurnShape(): { id: string; question: string; status: string; createdAt: string }[] {
  return [];
}
