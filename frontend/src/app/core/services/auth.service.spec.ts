import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { API_BASE_URL } from '../api.config';
import { AuthService } from './auth.service';

const TOKEN = 'test-access-token';
const ME = {
  id: 'u1',
  email: 'ama@example.com',
  role: 'staff',
  is_active: true,
  created_at: '2026-10-01T09:00:00',
};

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
    http.verify();
  });

  it('does not call /auth/me when there is no token', async () => {
    const user = await auth.maybeBootstrap();

    expect(user).toBeNull();
    http.expectNone(`${API_BASE_URL}/auth/me`);
  });

  it('stores the token from login and then fetches the user', async () => {
    const done = new Promise<void>((resolve) => {
      auth.login('ama@example.com', 'password123').subscribe((user) => {
        expect(user.email).toBe('ama@example.com');
        resolve();
      });
    });

    http
      .expectOne(`${API_BASE_URL}/auth/login`)
      .flush({ access_token: TOKEN, token_type: 'bearer', expires_in: 86400 });
    http.expectOne(`${API_BASE_URL}/auth/me`).flush(ME);
    await done;

    expect(auth.getToken()).toBe(TOKEN);
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('forgets a dead token instead of keeping it', async () => {
    localStorage.setItem('ika.access_token', 'expired-token');

    const pending = auth.maybeBootstrap();
    http.expectOne(`${API_BASE_URL}/auth/me`).flush(' gone ', {
      status: 401,
      statusText: 'Unauthorized',
    });
    const user = await pending;

    expect(user).toBeNull();
    expect(auth.getToken()).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('signs out locally without calling the backend', () => {
    localStorage.setItem('ika.access_token', TOKEN);

    auth.logout().subscribe();

    http.expectNone(`${API_BASE_URL}/auth/logout`);
    expect(auth.getToken()).toBeNull();
  });
});
