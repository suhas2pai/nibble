# Content guide

Everything the learner sees lives in `content/`. Run `npm run validate` after any change.

## Style rules that keep lessons quick

- One idea per card. A lesson is 5 to 6 cards and takes about 3 minutes.
- Start with a short concept or an interactive card, then test it immediately.
- Every question needs a `why`. It is shown after every answer, right or wrong, and it is where the learning happens.
- Keep questions under about 160 characters and options under about 90.
- Vary where the correct answer sits. The validator warns if most multiple-choice answers share a position.
- Write for someone smart who is new to AI. Plain words, no jargon without a one-line definition.
- Sentence case everywhere. Buttons say what they do.
- Formatting inside `say`, `q`, options and `why`: `**bold**` and `` `code` `` only.

## course.json

```json
{ "tracks": [ { "id": "foundations", "title": "Foundations", "units": [
  { "id": "ai-basics", "title": "AI basics", "blurb": "What AI is, and what it isn't",
    "color": "brand", "tier": "free", "lessons": ["what-is-ai", "ai-ml-llm"] }
] } ] }
```

- `tier`: `"free"` or `"pro"`. Pro units show as locked until the learner has Pro.
- `color`: `brand`, `mint`, `coral` or `sun`.
- Lessons unlock in order across the whole course. A lesson can appear in one unit only.
- With more than one track, track titles appear as headings on the home screen.

## A lesson file

`content/lessons/<id>.json`. The `id` must match the file name.

```json
{ "id": "what-is-ai", "title": "What is AI?", "xp": 15, "cards": [ ... ] }
```

`xp` is optional (defaults to `config.xp.lesson`). Every card needs a unique `id` within its lesson
(`c1`, `c2`, ...). Missed questions are tracked by lesson id + card id, so **don't rename a card id after launch**.

## Card types

### concept
Mascot says something. Optional bullet points.
```json
{ "id": "c1", "type": "concept", "say": "An **agent** can also act.", "points": ["Tool: does a job"], "mood": "happy" }
```
`mood`: `happy`, `cheer`, `sad`.

### mc (multiple choice)
2 to 5 options. `answer` is the index of the correct option, starting at 0.
```json
{ "id": "c2", "type": "mc", "q": "What does an LLM predict?",
  "options": ["The next token", "The truth"], "answer": 0, "why": "It predicts the next token, then repeats." }
```

### fill (fill in the blank)
The blank sits between `before` and `after` (`after` may be empty). 2 to 4 options.
```json
{ "id": "c3", "type": "fill", "before": "Examples in a prompt are called", "after": "prompting.",
  "options": ["few-shot", "fast-shot"], "answer": 0, "why": "Few-shot means showing examples." }
```

### spot (tap the wrong one)
3 to 5 sentences. `answer` is the index of the invented or wrong one.
```json
{ "id": "c4", "type": "spot", "q": "One sentence is invented. Tap it.",
  "sentences": ["True.", "True.", "Made up."], "answer": 2, "why": "It cites a study nobody can find." }
```

### order (put in order)
3 to 6 steps, written in the **correct** order. The app shuffles them, the same way every time.
```json
{ "id": "c5", "type": "order", "q": "Put the loop in order",
  "steps": ["Look", "Act", "Read", "Decide"], "why": "Look, act, read, decide." }
```

### match (match pairs)
3 to 5 pairs, written as correct pairs. The app shuffles the right column.
```json
{ "id": "c6", "type": "match", "q": "Match each tool to its job",
  "pairs": [["Calculator", "Does exact math"], ["Web search", "Finds fresh information"], ["Database", "Looks up records"]],
  "why": "Tools give the model abilities it lacks alone." }
```

### widget (interactive playground)
`"widget": "tokenizer"` needs `props.text` (starting text) and optional `props.note`.
`"widget": "temperature"` needs `props.prompt`, `props.options` (3 to 8 entries of `[label, probability]`) and optional `props.button`.
```json
{ "id": "c7", "type": "widget", "widget": "temperature", "say": "Slide it, then sample a few times.",
  "props": { "prompt": "The best pizza topping is", "button": "Pick a topping",
             "options": [["pepperoni", 0.5], ["mushroom", 0.2], ["basil", 0.12], ["pineapple", 0.1], ["anchovies", 0.08]] } }
```
Probabilities don't need to add up to 1; they are normalized.

## config.json

- `name`, `tagline`, `storageKey`: branding and the browser storage key (change the key to reset everyone's saved progress).
- `hearts.max`, `hearts.regenMinutes`: free-tier hearts.
- `xp.lesson`, `xp.replay`, `xp.practice`, `xp.perfectBonus`.
- `plans`: the cards on the Plans screen. `price` and `per` have `month` and `year` keys. `note` may be a string or `{month, year}`.
- `demo`: `true` shows the fake Pro toggle and reset button. Set to `false` for real users.

## Adding a new widget

1. Add an entry to `widgets` in `src/engine.js` with `init`, `html`, and optionally `input` and `act`.
2. Add its name to `WIDGETS` in `tools/validate.mjs`, and describe its `props` check there.
3. Use it from any lesson with `"type": "widget", "widget": "<name>"`.
