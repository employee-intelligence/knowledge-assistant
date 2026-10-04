# Working in this repository

## Verifying a change

Run the full check before calling anything done:

```bash
cd frontend && npm run verify   # typecheck, then tests, then production build
cd backend && .venv/bin/python -m unittest discover -s tests -q
```

## Use `npm run typecheck`, not bare `tsc`

`npm run typecheck` runs `ngc`, the Angular compiler. Plain
`npx tsc -p tsconfig.app.json --noEmit` **passes on a broken template** — it does not
read templates at all, so a component whose template calls a member that does not
exist, or uses an element whose directive was never imported into `imports`, reports
nothing. Those are real errors and they reach production as
`NG0304`/`NG8001` at runtime instead.

`strictTemplates` is already on in `tsconfig.json`, so the Angular compiler does catch
all of this — it just has to be the compiler doing the checking.

For a quick inner loop while editing, `npm run typecheck` takes about 6 seconds against
roughly 15 for a full `npm run build`.

## What no compiler catches

Malformed structure — a `<button>` nested inside another `<button>`, an element closed
in the wrong place, a block of a class deleted by a bad edit — is invisible to both
`tsc` and `ngc`. Only the test suite catches that, which is why a passing
`npm run verify` includes the tests and why structural template edits should come with
a test that exercises the thing that was restructured.

## Local addresses

The two origins have to match, or the browser refuses the session cookie:

- frontend `http://127.0.0.1:4200`
- backend `http://127.0.0.1:8099`

## Running the backend

Start it detached, or it dies with the shell that launched it:

```bash
setsid --fork /tmp/opencode/run-backend.sh   # see the repo's run notes
```

`init_db` runs at startup and adds missing columns, so a backend restarted onto an
older local database picks up schema changes. A backend process left running from
before a route was added will 404 that route while the source clearly defines it —
restart it before concluding a route is broken.
