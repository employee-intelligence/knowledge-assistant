import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { API_BASE_URL } from '../api.config';
import { ApiError, ApiService } from './api.service';

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

  afterEach(() => {
    http.verify();
  });

  it('passes the backend wording through on a 4xx', async () => {
    const failed = api.getHealth().toPromise().catch((error: unknown) => error);

    http.expectOne(`${API_BASE_URL}/health`).flush(
      { detail: 'Invalid email or password' },
      { status: 401, statusText: 'Unauthorized' },
    );

    const error = await failed;
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('Invalid email or password');
  });

  it('sends a chat question under the backend field name', async () => {
    const answered = api.chat('session-1', 'How much leave?').toPromise();

    const request = http.expectOne(`${API_BASE_URL}/chat`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ session_id: 'session-1', question: 'How much leave?' });
    request.flush({ answer: 'Twenty days.', answered: true, confidence: 0.9, sources: [] });

    const response = await answered;
    expect(response?.answer).toBe('Twenty days.');
  });

  it('maps history pairs into a thread with a not-found answer kept distinct', () => {
    const thread = api.toSessionThread('session-1', [
      {
        question: 'How much leave?',
        answer: 'Twenty days.',
        answered: true,
        confidence: 0.9,
        sources: [],
        created_at: '2026-10-01T09:00:00',
      },
      {
        question: 'What is my balance?',
        answer: 'I could not find that.',
        answered: false,
        confidence: 0.0,
        sources: [],
        created_at: '2026-10-01T09:05:00',
      },
    ]);

    expect(thread.messages).toHaveLength(4);
    expect(thread.messages[1].status).toBe('answered');
    expect(thread.messages[3].status).toBe('not-found');
    expect(thread.title).toBe('How much leave?');
  });
});
