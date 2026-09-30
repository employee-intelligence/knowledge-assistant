/**
 * Limits the composer enforces, matching the backend's own bounds on
 * `ChatRequest.question`. Agreeing with the server here is what keeps a
 * rejected question from ever leaving the browser: the API answers anything
 * shorter than three or longer than 500 characters with a 422.
 */
export const MIN_QUESTION_LENGTH = 3;
export const MAX_QUESTION_LENGTH = 500;

/** Placeholder shown in the composer when it is empty. */
export const QUESTION_PLACEHOLDER = 'Ask a question about company policies...';

/**
 * Starter prompts on the dashboard. Product copy rather than data: the backend
 * has no endpoint for them, and inventing one would mean guessing at a contract
 * it does not have.
 */
export const STARTER_QUESTIONS: readonly string[] = [
  'How many annual leave days do I have?',
  'How do I set up my company email?',
  'What do I need to complete during onboarding?',
];

/** Key used to remember the desktop sidebar preference. */
export const SIDEBAR_PREFERENCE_KEY = 'ika.sidebar.collapsed';

/** Viewport width, in px, at which the sidebar becomes a persistent column. */
export const DESKTOP_BREAKPOINT = 1024;

/**
 * Viewport the shell assumes when there is no window to measure, which is every
 * server render and the first paint before hydration.
 *
 * Compact is the deliberate guess: the `lg` media query promotes the drawer
 * shell to the column layout on a wide screen anyway, so guessing compact
 * paints a phone correctly and costs a desktop nothing. Guessing desktop left
 * phones opening with the sidebar dropped on top of the page.
 */
export const INITIAL_VIEWPORT_WIDTH = 0;

/** Milliseconds the copied answer stays labelled as copied. */
export const COPY_FEEDBACK_MS = 1600;
