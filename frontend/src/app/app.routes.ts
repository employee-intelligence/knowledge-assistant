import { Routes } from '@angular/router';

/**
 * Each view is lazily loaded, so the initial bundle only carries the shell.
 * The response view still reads `:id` itself rather than taking a bound input,
 * so it stays in charge of what an unknown id means.
 *
 * `response/:id` addresses one conversation by its own id, which never changes,
 * so the link keeps working however long afterwards it is followed. The bare
 * `response` route follows the conversation that was last active, which is where
 * a question sent from the dashboard lands.
 *
 * The signed-out screens are listed first: they are the only routes that render
 * without the sidebar, which the shell decides from the path.
 */
export const routes: Routes = [
  {
    path: 'login',
    pathMatch: 'full',
    title: 'Sign in · Internal Knowledge Assistant',
    loadComponent: () =>
      import('./features/auth/views/login-view/login-view.component').then(
        (module) => module.LoginViewComponent,
      ),
  },
  {
    path: 'register',
    pathMatch: 'full',
    title: 'Create your account · Internal Knowledge Assistant',
    loadComponent: () =>
      import('./features/auth/views/register-view/register-view.component').then(
        (module) => module.RegisterViewComponent,
      ),
  },
  {
    path: 'accept-invite',
    pathMatch: 'full',
    title: 'Set your password · Internal Knowledge Assistant',
    loadComponent: () =>
      import('./features/auth/views/accept-invite-view/accept-invite-view.component').then(
        (module) => module.AcceptInviteViewComponent,
      ),
  },
  {
    path: '',
    pathMatch: 'full',
    title: 'Internal Knowledge Assistant',
    loadComponent: () =>
      import('./views/dashboard-view/dashboard-view.component').then(
        (module) => module.DashboardViewComponent,
      ),
  },
  {
    path: 'ask',
    pathMatch: 'full',
    title: 'Ask a question · Internal Knowledge Assistant',
    redirectTo: '',
  },
  {
    path: 'response',
    title: 'Answer · Internal Knowledge Assistant',
    loadComponent: () =>
      import('./views/response-view/response-view.component').then(
        (module) => module.ResponseViewComponent,
      ),
  },
  {
    path: 'response/:id',
    title: 'Answer · Internal Knowledge Assistant',
    loadComponent: () =>
      import('./views/response-view/response-view.component').then(
        (module) => module.ResponseViewComponent,
      ),
  },
  {
    path: 'conversations',
    title: 'Conversations · Internal Knowledge Assistant',
    loadComponent: () =>
      import('./views/conversations-view/conversations-view.component').then(
        (module) => module.ConversationsViewComponent,
      ),
  },
  {
    path: 'admin',
    pathMatch: 'full',
    title: 'Administration · Internal Knowledge Assistant',
    loadComponent: () =>
      import('./views/admin-dashboard-view/admin-dashboard-view.component').then(
        (module) => module.AdminDashboardViewComponent,
      ),
  },
  {
    path: 'admin/documents',
    title: 'Documents · Internal Knowledge Assistant',
    loadComponent: () =>
      import('./views/admin-documents-view/admin-documents-view.component').then(
        (module) => module.AdminDocumentsViewComponent,
      ),
  },
  {
    path: 'admin/questions',
    title: 'Question logs · Internal Knowledge Assistant',
    loadComponent: () =>
      import('./views/admin-question-logs-view/admin-question-logs-view.component').then(
        (module) => module.AdminQuestionLogsViewComponent,
      ),
  },
  {
    path: 'not-found',
    title: 'Page not found · Internal Knowledge Assistant',
    loadComponent: () =>
      import('./views/not-found-view/not-found-view.component').then(
        (module) => module.NotFoundViewComponent,
      ),
  },
  {
    path: '**',
    redirectTo: 'not-found',
  },
];
