# Nibble

AI concepts in bite-size lessons: a Duolingo-style learning app where **all content is plain JSON**.
Working name only. Change it in one place: `content/config.json` → `name`.

## Quick start

Needs Node 18+. No installs, no dependencies.

```bash
npm run dev        # http://localhost:5173  (edit a JSON file, refresh the page)
npm run validate   # checks every lesson and tells you exactly what's wrong
npm run build      # validates, then writes dist/index.html (one file, works offline)
```

`dist/index.html` is the whole app in a single file. Double-click it, or upload it to any static host
(Netlify, Vercel, GitHub Pages, S3).

## Add a lesson (3 steps)

1. Create `content/lessons/my-lesson.json` (copy an existing one; see `docs/CONTENT-GUIDE.md`).
2. Add `"my-lesson"` to a unit's `lessons` list in `content/course.json`.
3. Run `npm run validate`, then refresh the dev server.

New units, tracks, plans, prices, XP rules and heart rules are all edited the same way, in `content/`.

## What's where

```
content/
  config.json        name, hearts, XP, plans and prices
  course.json        tracks → units → lessons (order, free vs pro)
  lessons/*.json     one file per lesson (5 to 6 cards each)
src/
  index.html         page shell
  app.css            all styles (light and dark mode)
  engine.js          the app: cards, progress, hearts, streaks, practice, plans
tools/
  validate.mjs       content checker
  build.mjs          bundles everything into dist/index.html
  serve.mjs          tiny dev server
docs/CONTENT-GUIDE.md  the lesson format, card by card
```

## What works today

- Skill-tree home with sequential unlock, collapsing finished units
- 7 card types: concept, widget (tokenizer, temperature), multiple choice, fill in the blank, spot the error, put in order, match pairs
- XP, streaks (by calendar day), hearts that refill over time, perfect-lesson bonus
- Practice mode: questions you miss come back until you get them right
- Free and Pro tiers: Pro units are locked, Pro means unlimited hearts. Plans screen reads from `config.json`
- Progress saved in the browser (`localStorage`), light and dark mode, keyboard focus states and ARIA labels

## Demo-only pieces

`"demo": true` in `config.json` turns on the "Try Pro" toggle (no payment), "Refill hearts", and "Reset demo progress".
Set it to `false` before showing real users. Checkout is not connected.

## What's needed for a real launch

Progress lives on one device today. To go live you need, in roughly this order:

1. **Accounts and server-side progress** (Supabase or Firebase auth + a progress table), so streaks and XP follow the learner
2. **Payments** (Stripe Checkout and a webhook that flips the learner's plan)
3. **Server-checked entitlements**, so Pro units are gated by the server, not just the page
4. **Leagues** (needs the database from step 1) and an **AI tutor** (an API route that calls the Claude API, Pro only)
5. Analytics on lesson completion and card-level drop-off, to see where people quit

The engine reads everything through `load()` in `src/engine.js`, so moving content to a CMS or database later
only changes that one function.
