# Frontend Architecture and Coding Conventions
### Internal Knowledge Assistant — Angular v22

**Phase 1 scope note:** Authentication and the Admin panel are **not** part of this phase. They are documented at the end of this file under Phase 2, where the screens are built but deliberately unwired. Nothing in Phase 1 depends on them. Phase 1 covers three views only: the Dashboard (ask a question), the Response view (see the answer), and the History view (past questions).

---

## 1. Technology Stack

- **Framework:** Angular v22, standalone components as the default (no NgModules)
- **Language:** TypeScript, strict mode enabled
- **Reactivity and state:** Signals as the primary reactive model, in line with Angular v22's signal-first architecture
- **Change detection:** OnPush by default across all components (the Angular v22 default)
- **Routing:** Angular Router, lazy-loaded route configuration
- **Styling:** Tailwind CSS (already added to the project), using AmaliTech brand colours defined as design tokens
- **HTTP layer:** Angular HttpClient, wrapped in dedicated services — never called directly from components

## 2. Brand Colours

Pull colours directly from AmaliTech's official brand assets. The values below are placeholders and must be replaced with the verified brand hex codes before building real screens.

- Primary: `[Insert verified AmaliTech primary colour hex — placeholder #0B5FA5]`
- Secondary / accent: `[Insert verified AmaliTech secondary colours]`
- Neutral palette: standard greys and white for backgrounds, text, and borders

Define these once as Tailwind theme tokens in `tailwind.config` rather than typing raw hex values across the codebase, so a brand colour change later means editing one file, not searching the whole project.

## 3. Architectural Approach: Signals and Standalone Components

- Every component is standalone. NgModules are not used anywhere in this project.
- Component state uses `signal()` for local reactive values and `computed()` for derived values. OnPush is left at its default, so templates update only when a signal they depend on actually changes.
- Shared, cross-cutting state (the current chat session, the list of past questions) lives in singleton services that expose signals, rather than being passed manually through many layers of components.
- No dedicated state management library is needed at this scale. Signals inside singleton services are sufficient and are the current recommended approach for small to medium Angular applications.

## 4. Project Structure (Phase 1)

```
src/
  app/
    app.config.ts
    app.routes.ts

    core/
      services/
        chat.service.ts
        history.service.ts
        api.service.ts
      models/
        message.model.ts
        question.model.ts

    shared/
      components/
        button/
          button.component.ts
        input/
          input.component.ts
        loading-indicator/
          loading-indicator.component.ts
      pipes/
      utils/
        format-date.util.ts
        constants.ts

    features/
      ask/
        components/
          question-input/
            question-input.component.ts
      response/
        components/
          answer-card/
            answer-card.component.ts
          source-tag/
            source-tag.component.ts
      history/
        components/
          history-list/
            history-list.component.ts
          history-item/
            history-item.component.ts

    views/
      dashboard-view/
        dashboard-view.component.ts
      response-view/
        response-view.component.ts
      history-view/
        history-view.component.ts
      app.routes.ts

  styles/
    main.css
  main.ts
```

## 5. Views and Routes (Phase 1)

| View | Route | Purpose |
|---|---|---|
| Dashboard View | `/` or `/ask` | Landing page. Shows the question input field. Submitting a question navigates to the Response view. |
| Response View | `/response/:id` | Shows the answer to the submitted question, with its cited source, and a loading state while the answer is being generated. |
| History View | `/history` | Lists past questions asked. Clicking a past entry opens its Response view. |

- Routes are declared in `app.routes.ts`, lazily loaded with `loadComponent` so each view's code is only downloaded when visited.
- Navigation flow: Dashboard → (submit question) → Response → (view past) → History → (click entry) → Response.

## 6. The Views Folder Rule

A view exists only to assemble the components its route needs and connect them to services. A view does not contain business logic, direct HTTP calls, or complex template markup of its own.

- A view imports the standalone components it needs from `features/` and `shared/`, and reads data through injected services.
- If a view file starts accumulating real logic, move that logic into a service or a feature component, and have the view simply call it.

## 7. Component Rules

- Every component is standalone and explicitly imports only what it uses.
- Shared, generic components with no business knowledge live under `shared/components` (button, input, loading indicator), and only receive data through inputs and communicate through outputs.
- Feature-specific components live under `features/<feature-name>/components`, grouped by the part of the application they belong to (ask, response, history).
- A component should have one clear responsibility. If a component's template grows past roughly 150 lines, or it handles more than one concern, split it.
- Components use `input()` and `output()` signal-based APIs rather than the older `@Input`/`@Output` decorators.

## 8. Naming Conventions

- **Component selectors:** kebab-case with a consistent prefix, e.g. `app-answer-card`
- **Component class names:** PascalCase with a `Component` suffix, e.g. `AnswerCardComponent`
- **Component file names:** kebab-case matching the class, e.g. `answer-card.component.ts`
- **Services:** PascalCase with a `Service` suffix in the class, kebab-case with `.service.ts` in the file, e.g. `ChatService` in `chat.service.ts`
- **Signals:** camelCase, named for the value they hold, not prefixed with the word "signal", e.g. `currentQuestion`, `isLoading`, `historyList`
- **Computed signals:** camelCase, named for what they represent, e.g. `hasHistory`, `formattedAnswer`
- **Booleans:** prefixed with `is`, `has`, or `can`, e.g. `isLoading`, `hasError`, `canSubmit`
- **Constants:** UPPER_SNAKE_CASE, e.g. `MAX_QUESTION_LENGTH`, `API_BASE_URL`
- **Route paths:** lowercase, kebab-case, e.g. `/history`, `/response`
- **Folders:** lowercase, grouped by feature rather than file type
- **Interfaces and models:** PascalCase, named for the entity without an `I` prefix, e.g. `Question`, `AnswerResponse`, `HistoryEntry`

## 9. Coding Conventions

- TypeScript strict mode is enabled project-wide. `any` is not used; `unknown` is used where a type genuinely isn't known ahead of time.
- All HTTP requests go through dedicated services in `core/services`. Components never inject `HttpClient` directly.
- A single shared base URL constant is defined once in `core`, never hardcoded per call.
- Errors from HTTP calls are handled centrally where possible (a shared error-handling utility or interceptor), and handled locally only where a specific, user-facing message is needed.
- Reactive forms are used for the question input, for validation control and testability.
- Every non-trivial function, service method, or signal that isn't self-explanatory carries a short comment.
- Templates avoid complex logic — conditional or transformation logic belongs in the component class as a computed signal or method.

## 10. Tailwind Styling Rules

- Utility classes only. No separate CSS files beyond the single `main.css` used to import Tailwind, and no scoped style blocks inside components.
- Repeated visual patterns (button styles, card styles) are pulled into a `shared/components` component rather than repeating long utility-class strings across the codebase.
- Responsive behaviour uses Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`) consistently, not custom media queries.
- Brand colours are referenced through the Tailwind theme tokens defined in Section 2, never as raw hex values in component templates.

## 11. General Principles

- **Separation of concerns:** views assemble, feature components present and handle local interaction, services hold logic and shared state, utils hold small pure helper functions.
- **Single source of truth:** shared state (chat history, current question/answer) lives in exactly one service. Components read from that service's signals rather than keeping a duplicate local copy.
- **Lazy loading** is used for each view's route so the initial bundle only contains what's needed for the first screen.
- Every new component, service, or view follows the naming and folder rules above from the first commit.

---

## Phase 2: Authentication and Admin (screens built, not wired)

The screens exist and are reviewable. What is deliberately missing is the part that needs a decision about accounts, a session and a server that enforces anything.

**Built, as UI only:**

- **Auth:** `login-view`, `register-view` and `accept-invite-view` under `features/auth/views/`, sharing `auth-layout` in `features/auth/components/`. None of them authenticates: they collect input and then state that accounts are not connected, so nobody types a real password into a drawing. Login's "Remember me" keeps the work email in `localStorage` and nothing else — there is no session to keep alive yet, and storing a password to save a few keystrokes is the wrong trade even once there is one. The registration screen is built as drawn, which puts a self-service form next to a footer reading "SSO enabled"; if the workspace does enforce single sign-on, that form is not how anybody joins and the two panels contradict each other. Worth settling before the auth service is written.
- **Admin:** `admin-dashboard-view`, `admin-documents-view` and `admin-question-logs-view` under `views/`, with components under `features/admin/components/`. The three are now reached through one tab bar rather than two competing sets of link cards. The dashboard reports how recent questions ended and separates documents still indexing from ones that failed. Deleting and renaming act on a placeholder list in `core/data/mock-admin.data.ts` and say they did.
- **Uploads:** `document-dropzone` is a real drop target that also browses. It reads the file's own name and size and refuses an extension the design does not accept, all in the browser, so none of that needs a server. The progress bar is the exception and is marked as theatre in the code: nothing is transmitted, so it advances on a timer and the parent owns the message. A picked file enters the list as `processing`, since that is the state an upload passes through, and `PolicyDocument` keeps `uploadedAt` separately from `updatedAt` because when a file arrived and when it was last touched are different questions.
- **Question log review:** rows open `question-log-detail`, a right-hand drawer carrying the whole question, the answer as it was given, and the passages retrieval considered. `QuestionLog` therefore keeps `answer` and `sources` rather than a source count, because a log is only reviewable with them: a `not-found` entry holds the near-misses that missed the threshold, and a `failed` entry has no answer at all. Citations reuse `features/response/components/source-tag`, so a log and an answer show evidence identically. Marking a log reviewed and re-asking a question are stated as unconnected rather than offered as buttons that do nothing.
- **Roles:** `ViewerService` holds the viewer. The role is a signal, not a guard, and the sidebar switch previews both. An employee reaching an admin URL gets `admin-access-required` rather than an empty screen.
- **Reusable pieces added for this work:** `app-badge`, `app-form-field`, `app-empty-state` and `app-confirm-dialog` under `shared/components/`. The dialog is a native `<dialog>`, so its focus trap and Escape handling come from the browser. `shared/utils/file-size.util.ts` formats a file size once for both the upload panel and the inventory row.

**Mock identity:** `MOCK_VIEWER` is Ama Konadu, matching the designs, and the administrator role is labelled "HR Administrator". Initials are stored per log entry rather than derived from the name, which is how a rename once left stale initials in place.

**Still to build when accounts are decided:**

- `auth.service.ts` and `auth.guard.ts` under `core/`, and an `auth.interceptor.ts` for attaching session state to requests.
- `document.service.ts` and a `question-log.service.ts`, replacing `mock-admin.data.ts`.
- `admin.guard.ts`, replacing the `viewer.isAdministrator()` branches. The role checks are already in the two places a guard would need to cover: the sidebar link and the three admin views.
- The shell's plain-layout list in `app.component.ts` should become route data, once there are enough signed-out routes to justify it.

