/** Product-level limits shared by the question input and the services. */
export const MAX_QUESTION_LENGTH = 500;

/** Placeholder shown in the composer when it is empty. */
export const QUESTION_PLACEHOLDER = 'Ask a question about company policies...';

/** Disclaimer rendered under the composer. */
export const GROUNDING_DISCLAIMER =
  'Answers are grounded in verified company documents and always include sources.';

/** Contact shown when an answer finds nothing. */
export const HR_CONTACT_EMAIL = 'hr@company.com';

/** Key used to remember the desktop sidebar preference. */
export const SIDEBAR_PREFERENCE_KEY = 'ika.sidebar.collapsed';

/** Viewport width, in px, at which the sidebar becomes a persistent column. */
export const DESKTOP_BREAKPOINT = 1024;

/** Milliseconds the copied answer stays labelled as copied. */
export const COPY_FEEDBACK_MS = 1600;
