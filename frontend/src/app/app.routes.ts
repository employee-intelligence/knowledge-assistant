import { Routes } from '@angular/router';

/**
 * Each view is lazily loaded, so the initial bundle only carries the shell.
 * The response view still reads `:id` itself rather than taking a bound input,
 * so it stays in charge of what an unknown id means.
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
