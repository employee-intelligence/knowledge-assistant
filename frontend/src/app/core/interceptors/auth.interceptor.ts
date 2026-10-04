import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

/**
 * Requests that never carry a token, because the caller has none yet.
 *
 * Signing in and registering are already past the session wall — both need to
 * work with no token at all — and retrying either on a 401 would just repeat a
 * request whose credentials were already refused.
 */
const EXEMPT_PATHS = ['/auth/login', '/auth/register'];

/**
 * Attaches the Bearer token, and ends the session when it stops working.
 *
 * There is no refresh endpoint on this backend, so a 401 is always the end of
 * the session rather than the start of a renewal: the token is forgotten and the
 * person is sent to sign in again. Whatever was on screen belonged to that
 * session and is no longer visible.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.getToken();
  const isExempt = EXEMPT_PATHS.some((path) => request.url.includes(path));
  const withAuth =
    token && !isExempt
      ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : request;

  return next(withAuth).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      // Already signed out, or on a screen that never had a session. There is
      // nothing to end and nowhere better to go than the error itself.
      if (isExempt || !auth.isAuthenticated()) {
        return throwError(() => error);
      }

      auth.clear();
      void router.navigate(['/login']);

      return throwError(() => error);
    }),
  );
};
