/** Product-level limits shared by the question input and the services. */
export const MAX_QUESTION_LENGTH = 500;

/** Placeholder shown in the composer when it is empty. */
export const QUESTION_PLACEHOLDER = 'Ask a question about company policies...';

/** Contact shown when an answer finds nothing. */
export const HR_CONTACT_EMAIL = 'hr@company.com';

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
