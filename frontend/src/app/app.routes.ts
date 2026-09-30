import { Routes } from '@angular/router';

/**
 * Each view is lazily loaded, so the initial bundle only carries the shell.
 * The response view still reads `:id` itself rather than taking a bound input,
 * so it stays in charge of what an unknown id means.
 *
 * `response/:id` addresses one turn by its position in the session, and the bare
 * `response` route follows the newest turn. Both exist because a question sent
 * from the dashboard has no position to put in a URL until the turn exists, and
 * making the id optional avoids inventing one just to navigate.
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
    path: 'history',
    title: 'Question history · Internal Knowledge Assistant',
    loadComponent: () =>
      import('./views/history-view/history-view.component').then(
        (module) => module.HistoryViewComponent,
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
