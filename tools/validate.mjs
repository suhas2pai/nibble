// Validates everything in /content. Zero dependencies.
//   node tools/validate.mjs        (or: npm run validate)
// Exit code 1 if there are errors. Warnings never fail the run.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CARD_TYPES = ['concept', 'widget', 'mc', 'fill', 'spot', 'order', 'match'];
export const WIDGETS = ['tokenizer', 'temperature'];
const COLORS = ['brand', 'mint', 'coral', 'sun'];
const MOODS = ['happy', 'cheer', 'sad'];

const isStr = (x) => typeof x === 'string' && x.trim().length > 0;
const isInt = (x) => Number.isInteger(x);

export function loadContent(root) {
  const errors = [];
  const rel = (p) => relative(root, p);
  const read = (p) => {
    try { return JSON.parse(readFileSync(p, 'utf8')); }
    catch (e) { errors.push(`${rel(p)}: ${e.message}`); return null; }
  };
  const config = read(join(root, 'content/config.json'));
  const course = read(join(root, 'content/course.json'));
  const lessons = {};
  const ids = new Set();
  if (course && Array.isArray(course.tracks)) {
    for (const t of course.tracks)
      for (const u of t.units || [])
        for (const id of u.lessons || []) ids.add(id);
  }
  for (const id of ids) {
    const p = join(root, 'content/lessons', `${id}.json`);
    if (!existsSync(p)) { errors.push(`course.json: lesson "${id}" is listed but content/lessons/${id}.json does not exist`); continue; }
    const l = read(p);
    if (l) lessons[id] = l;
  }
  const dir = join(root, 'content/lessons');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')) : [];
  return { config, course, lessons, files, errors };
}

export function validate({ config, course, lessons, files = [], errors: pre = [] }) {
  const E = [...pre];
  const W = [];
  const err = (where, msg) => E.push(`${where}: ${msg}`);
  const warn = (where, msg) => W.push(`${where}: ${msg}`);

  // config.json
  if (config) {
    const w = 'config.json';
    if (!isStr(config.name)) err(w, '"name" is required');
    if (!config.hearts || !isInt(config.hearts.max) || config.hearts.max < 1) err(w, '"hearts.max" must be an integer >= 1');
    if (!config.hearts || !(config.hearts.regenMinutes > 0)) err(w, '"hearts.regenMinutes" must be > 0');
    if (!config.xp || !(config.xp.lesson > 0)) err(w, '"xp.lesson" must be > 0');
    if (!Array.isArray(config.plans) || !config.plans.length) err(w, '"plans" must be a non-empty array');
    else for (const p of config.plans) {
      if (!isStr(p.id) || !isStr(p.name)) err(w, 'every plan needs "id" and "name"');
      if (!p.price || p.price.month === undefined || p.price.year === undefined) err(w, `plan "${p.id}" needs price.month and price.year`);
      if (!Array.isArray(p.features) || !p.features.length) err(w, `plan "${p.id}" needs a features array`);
    }
  } else err('config.json', 'missing or unreadable');

  // course.json
  const used = new Set();
  const unitIds = new Set();
  if (course && Array.isArray(course.tracks) && course.tracks.length) {
    for (const t of course.tracks) {
      if (!isStr(t.id) || !isStr(t.title)) err('course.json', 'every track needs "id" and "title"');
      if (!Array.isArray(t.units) || !t.units.length) { err('course.json', `track "${t.id}" has no units`); continue; }
      for (const u of t.units) {
        const w = `unit "${u.id}"`;
        if (!isStr(u.id) || !isStr(u.title)) err('course.json', 'every unit needs "id" and "title"');
        if (unitIds.has(u.id)) err('course.json', `duplicate unit id "${u.id}"`);
        unitIds.add(u.id);
        if (!['free', 'pro'].includes(u.tier)) err(w, '"tier" must be "free" or "pro"');
        if (u.color && !COLORS.includes(u.color)) warn(w, `unknown color "${u.color}" (use ${COLORS.join(', ')})`);
        if (!Array.isArray(u.lessons) || !u.lessons.length) err(w, 'needs at least one lesson');
        for (const id of u.lessons || []) {
          if (used.has(id)) err(w, `lesson "${id}" is listed more than once`);
          used.add(id);
        }
      }
    }
  } else err('course.json', 'needs a non-empty "tracks" array');

  for (const f of files) if (!used.has(f)) warn(`content/lessons/${f}.json`, 'is not listed in course.json, so it will never appear');

  // lessons
  for (const [id, l] of Object.entries(lessons)) {
    const w = `lessons/${id}.json`;
    if (l.id !== id) err(w, `"id" is "${l.id}" but must match the file name "${id}"`);
    if (!isStr(l.title)) err(w, '"title" is required');
    if (!Array.isArray(l.cards) || l.cards.length < 3) { err(w, 'needs at least 3 cards'); continue; }
    if (l.cards.length < 4) warn(w, 'fewer than 4 cards feels thin');
    if (l.cards.length > 8) warn(w, 'more than 8 cards runs past a 3-minute lesson');
    const seen = new Set();
    const mcAnswers = [];
    let checks = 0;
    l.cards.forEach((c, i) => {
      const cw = `${w} card ${i + 1}${c && c.id ? ` (${c.id})` : ''}`;
      if (!c || typeof c !== 'object') { err(cw, 'must be an object'); return; }
      if (!isStr(c.id)) err(cw, '"id" is required (used to track missed questions)');
      else if (seen.has(c.id)) err(cw, `duplicate card id "${c.id}"`);
      else seen.add(c.id);
      if (!CARD_TYPES.includes(c.type)) { err(cw, `"type" must be one of ${CARD_TYPES.join(', ')}`); return; }
      if (c.mood && !MOODS.includes(c.mood)) warn(cw, `unknown mood "${c.mood}"`);
      if (c.q && c.q.length > 160) warn(cw, 'question is over 160 characters');
      if (c.say && c.say.length > 260) warn(cw, '"say" is over 260 characters, consider splitting the card');

      const need = (cond, msg) => { if (!cond) err(cw, msg); };
      switch (c.type) {
        case 'concept':
          need(isStr(c.say), '"say" is required');
          if (c.points !== undefined) need(Array.isArray(c.points) && c.points.every(isStr), '"points" must be an array of strings');
          break;
        case 'widget':
          need(WIDGETS.includes(c.widget), `"widget" must be one of ${WIDGETS.join(', ')}`);
          need(isStr(c.say), '"say" is required');
          if (c.widget === 'tokenizer') need(c.props && isStr(c.props.text), 'tokenizer needs props.text');
          if (c.widget === 'temperature') {
            const o = c.props && c.props.options;
            need(isStr(c.props && c.props.prompt), 'temperature needs props.prompt');
            need(Array.isArray(o) && o.length >= 3 && o.length <= 8 && o.every((x) => Array.isArray(x) && isStr(x[0]) && typeof x[1] === 'number' && x[1] > 0),
              'temperature needs props.options: 3 to 8 entries like ["pepperoni", 0.5]');
          }
          break;
        case 'mc':
        case 'fill': {
          checks++;
          need(c.type === 'fill' || isStr(c.q), '"q" is required');
          if (c.type === 'fill') {
            need(isStr(c.before), '"before" is required (text before the blank)');
            need(typeof c.after === 'string', '"after" is required (text after the blank, may be empty)');
          }
          const o = c.options;
          need(Array.isArray(o) && o.length >= 2 && o.length <= (c.type === 'mc' ? 5 : 4) && o.every(isStr), `"options" needs 2 to ${c.type === 'mc' ? 5 : 4} non-empty strings`);
          need(isInt(c.answer) && Array.isArray(o) && c.answer >= 0 && c.answer < o.length, '"answer" must be the index (from 0) of the correct option');
          if (Array.isArray(o) && new Set(o).size !== o.length) warn(cw, 'has duplicate options');
          if (Array.isArray(o) && o.some((x) => x.length > 90)) warn(cw, 'an option is over 90 characters');
          need(isStr(c.why), '"why" is required (shown after every answer)');
          if (c.type === 'mc') mcAnswers.push(c.answer);
          break;
        }
        case 'spot':
          checks++;
          need(isStr(c.q), '"q" is required');
          need(Array.isArray(c.sentences) && c.sentences.length >= 3 && c.sentences.length <= 5 && c.sentences.every(isStr), '"sentences" needs 3 to 5 strings');
          need(isInt(c.answer) && Array.isArray(c.sentences) && c.answer >= 0 && c.answer < c.sentences.length, '"answer" must be the index of the wrong sentence');
          need(isStr(c.why), '"why" is required');
          break;
        case 'order':
          checks++;
          need(isStr(c.q), '"q" is required');
          need(Array.isArray(c.steps) && c.steps.length >= 3 && c.steps.length <= 6 && c.steps.every(isStr), '"steps" needs 3 to 6 strings, written in the CORRECT order (the app shuffles them)');
          need(isStr(c.why), '"why" is required');
          break;
        case 'match':
          checks++;
          need(isStr(c.q), '"q" is required');
          need(Array.isArray(c.pairs) && c.pairs.length >= 3 && c.pairs.length <= 5 && c.pairs.every((p) => Array.isArray(p) && p.length === 2 && isStr(p[0]) && isStr(p[1])),
            '"pairs" needs 3 to 5 entries like ["Term", "Meaning"] (the app shuffles the right column)');
          need(isStr(c.why), '"why" is required');
          break;
      }
    });
    if (checks === 0) warn(w, 'has no questions, only concept/widget cards');
    if (mcAnswers.length >= 3) {
      const top = Math.max(...[0, 1, 2, 3, 4].map((n) => mcAnswers.filter((a) => a === n).length));
      if (top / mcAnswers.length > 0.7) warn(w, 'most multiple-choice answers sit in the same position, so vary where the correct option goes');
    }
  }
  return { errors: E, warnings: W };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const content = loadContent(root);
  const { errors, warnings } = validate(content);
  const nLessons = Object.keys(content.lessons).length;
  const nCards = Object.values(content.lessons).reduce((n, l) => n + (l.cards ? l.cards.length : 0), 0);
  for (const w of warnings) console.log(`warning  ${w}`);
  for (const e of errors) console.log(`error    ${e}`);
  console.log(`\n${nLessons} lessons, ${nCards} cards: ${errors.length} errors, ${warnings.length} warnings`);
  process.exit(errors.length ? 1 : 0);
}
