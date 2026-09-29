import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Rendered on demand rather than prerendered: the response route is parameterised
 * (`/response/:id`) and every screen is currently backed by mock data, so a
 * prerender pass would have nothing real to cache.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
