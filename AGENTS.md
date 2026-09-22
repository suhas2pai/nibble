# Nibble agent guide

## Project shape

- This is a dependency-free Node.js app; use Node 18 or newer.
- Learner-facing content lives in `content/` as plain JSON.
- `src/engine.js` owns runtime behavior; `src/app.css` owns all styling; `src/index.html` is the source shell.
- Account sign-up/sign-in and progress profiles are currently browser-local in `src/engine.js`; there is no server authentication or cross-device sync.
- Password recovery is a local prototype reset, not verified email recovery. Production recovery and password changes need server-side identity checks, sessions, and audit controls.
- Learner settings, bookmarks, review dates, feedback, reminders, and accessibility preferences are also browser-local progress data.
- Community growth features currently use browser-local demo data: daily challenges, invite codes, leagues, certificates, custom challenge drafts, team previews, and analytics counters are not yet shared or server-verified.
- The development app fetches JSON from `content/`. `npm run build` embeds the source, content, CSS, and JavaScript into `dist/index.html`.
- Read [README.md](README.md) for workflow and architecture, and [docs/CONTENT-GUIDE.md](docs/CONTENT-GUIDE.md) for lesson schemas and writing rules.

## Commands

- `npm run dev`: start the local server at `http://localhost:5173` (use this instead of opening `src/index.html` directly).
- `npm run validate`: validate all content; run after every content change.
- `npm run build`: validate and regenerate `dist/index.html`.
- There is no automated test suite or test script currently.

## Content rules

- Course hierarchy is `tracks -> units -> lessons` in `content/course.json`.
- Each lesson ID must match its filename and appear exactly once in the course.
- Card IDs must be unique within a lesson. Do not rename released lesson or card IDs because progress and missed-question tracking use them.
- Every question card needs a `why` explanation. Preserve the existing card schemas and supported types: `concept`, `widget`, `mc`, `fill`, `spot`, `order`, and `match`.
- Author `order.steps` and `match.pairs` in the correct order; the app shuffles them for learners.
- Keep learner-facing formatting to the supported `**bold**` and `` `code` `` syntax. Follow the content guide for short, plain-language lessons and varied answer positions.
- New widgets require updates in both `src/engine.js` and `tools/validate.mjs`.

## Generated files and changes

- Do not hand-edit `dist/index.html`; regenerate it with `npm run build` after source or content changes.
- `npm run build` also copies `src/sw.js` to `dist/sw.js`; keep the service worker in sync when changing offline behavior.
- Preserve the replacement markers in `src/index.html`: `<!--CSS-->`, `<!--/CSS-->`, `<!--JS-->`, and `<!--/JS-->`.
- Keep changes focused and inspect `git diff` before committing. Validate content and rebuild generated output when relevant.
- `content/config.json` has `demo: true` controls for fake Pro, heart refill, and reset behavior; do not treat those as production billing or entitlement logic.
- Local account passwords are stored as browser-side hashes for this prototype only. A production account system needs server-side password handling, sessions, recovery, and a database.
