import { Routes } from '@angular/router';

import { authGuard, adminGuard, guestGuard } from './core/guards/auth.guard';

/**
 * Each view is lazily loaded, so the initial bundle only carries the shell.
 *
 * `chat/:sessionId` addresses one session by its own id, which never changes,
 * so the link keeps working however long afterwards it is followed. The bare
 * `chat` route follows the session that was last active, which is where a
 * question sent from the dashboard lands.
 *
 * Signed-out screens declare `data: { plain: true }`, which is how the shell
 * knows to drop the sidebar there rather than cover it up.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Internal Knowledge Assistant',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./views/dashboard-view/dashboard-view.component').then(
        (module) => module.DashboardViewComponent,
      ),
  },
  {
    path: 'chat',
    pathMatch: 'full',
    title: 'New chat · Internal Knowledge Assistant',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./views/response-view/response-view.component').then(
        (module) => module.ResponseViewComponent,
      ),
  },
  {
    path: 'chat/:sessionId',
    title: 'Answer · Internal Knowledge Assistant',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./views/response-view/response-view.component').then(
        (module) => module.ResponseViewComponent,
      ),
  },
  {
    path: 'sessions',
    title: 'Sessions · Internal Knowledge Assistant',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./views/conversations-view/conversations-view.component').then(
        (module) => module.ConversationsViewComponent,
      ),
  },
  {
    path: 'admin',
    title: 'Admin · Internal Knowledge Assistant',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./views/admin-view/admin-view.component').then(
        (module) => module.AdminViewComponent,
      ),
  },
  {
    path: 'login',
    title: 'Sign in · Internal Knowledge Assistant',
    canActivate: [guestGuard],
    data: { plain: true },
    loadComponent: () =>
      import('./features/auth/views/login-view/login-view.component').then(
        (module) => module.LoginViewComponent,
      ),
  },
  {
    path: 'register',
    title: 'Register · Internal Knowledge Assistant',
    canActivate: [guestGuard],
    data: { plain: true },
    loadComponent: () =>
      import('./features/auth/views/register-view/register-view.component').then(
        (module) => module.RegisterViewComponent,
      ),
  },
  {
    path: 'health',
    title: 'Health Check · Internal Knowledge Assistant',
    data: { plain: true },
    loadComponent: () =>
      import('./views/health-view/health-view.component').then(
        (module) => module.HealthViewComponent,
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
