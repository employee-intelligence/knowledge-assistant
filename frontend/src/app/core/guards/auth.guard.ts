import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { AuthService } from '../services/auth.service';

type Decision = boolean | UrlTree;

async function hasSession(): Promise<boolean> {
  const auth = inject(AuthService);

  if (!auth.isBrowserOnly()) {
    return false;
  }

  await auth.maybeBootstrap();
  return auth.isAuthenticated();
}

async function decideForAppRoutes(): Promise<Decision> {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isBrowserOnly() || (await hasSession())) {
    return true;
  }

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: router.url } });
}

export const authGuard: CanActivateFn = () => decideForAppRoutes();

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isBrowserOnly()) {
    return true;
  }

  const allowed = await decideForAppRoutes();

  if (allowed !== true) {
    return allowed;
  }

  return auth.isAdmin() ? true : router.createUrlTree(['/']);
};

export const guestGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(AuthService);

  return (await hasSession()) ? router.createUrlTree([auth.landingPath()]) : true;
};