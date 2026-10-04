import { Routes } from '@angular/router';

import { authGuard, adminGuard, guestGuard } from './core/guards/auth.guard';

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
    path: 'chat/:sessionId',
    title: 'Chat · Internal Knowledge Assistant',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./views/chat-view/chat-view.component').then(
        (module) => module.ChatViewComponent,
      ),
  },
  {
    path: 'chat',
    pathMatch: 'full',
    title: 'New Chat · Internal Knowledge Assistant',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./views/chat-view/chat-view.component').then(
        (module) => module.ChatViewComponent,
      ),
  },
  {
    path: 'sessions',
    title: 'Sessions · Internal Knowledge Assistant',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./views/sessions-view/sessions-view.component').then(
        (module) => module.SessionsViewComponent,
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
    loadComponent: () =>
      import('./features/auth/views/login-view/login-view.component').then(
        (module) => module.LoginViewComponent,
      ),
  },
  {
    path: 'register',
    title: 'Register · Internal Knowledge Assistant',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/views/register-view/register-view.component').then(
        (module) => module.RegisterViewComponent,
      ),
  },
  {
    path: 'health',
    title: 'Health Check · Internal Knowledge Assistant',
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