/**
 * Local-development proxy: forwards API calls to the backend while leaving
 * Angular's own routes alone.
 *
 * Several paths exist on both sides (`/chat`, `/sessions`, `/admin`,
 * `/health`), so path matching alone cannot tell a page load from an API
 * call. Browser navigations ask for `text/html` and API calls ask for JSON,
 * so the bypass sends page loads to the app and only proxies the rest. That
 * is also what makes refreshing on `/chat/:id` work instead of landing on a
 * backend 404.
 *
 * NOTE: `context` must be an array of strings — Angular's proxy loader
 * silently skips entries with a plain-string context.
 *
 * Production needs none of this: the deployed frontend calls the backend's
 * own URL (see `public/config.json`) and the backend allows that origin.
 */
const BACKEND = 'http://127.0.0.1:8099';

/**
 * Page loads (the SPA shell) are never proxied; API calls always are.
 *
 * Returning the URL unchanged hands the request back to the dev server, which
 * serves the app. (Returning `false` would answer 404 instead — that is what
 * this Vite version does with it.)
 */
function bypass(req) {
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    return req.url;
  }
  return null;
}

function entry(path) {
  return {
    context: [path],
    target: BACKEND,
    secure: false,
    changeOrigin: true,
    logLevel: 'warn',
    bypass,
  };
}

module.exports = [
  entry('/auth'),
  entry('/sessions'),
  entry('/chat'),
  entry('/history'),
  entry('/admin'),
  entry('/health'),
  entry('/documents'),
];
