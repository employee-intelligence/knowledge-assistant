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
 */
export const routes: Routes = [
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
    path: '**',
    redirectTo: '',
  },
];
