import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, throwError } from 'rxjs';

import { AuthService, CSRF_HEADER } from '../services/auth.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const EXEMPT_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/me',
  '/auth/csrf',
];

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isExempt = EXEMPT_PATHS.some((path) => request.url.includes(path));
  const withHeader =
    SAFE_METHODS.has(request.method) || isExempt
      ? request
      : request.clone({ setHeaders: { [CSRF_HEADER]: auth.readCsrfToken() ?? '' } });

  return next(withHeader).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      if (isExempt || !auth.isAuthenticated()) {
        return throwError(() => error);
      }

      // No refresh endpoint in this backend - just clear and redirect
      auth.clear();
      void router.navigate(['/login']);
      return throwError(() => error);
    }),
  );
};