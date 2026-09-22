/* Nibble engine. All content comes from /content JSON (see docs/CONTENT-GUIDE.md).
   Nothing in this file should need editing to add lessons, units or plans. */
(function () {
'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
const CHECKABLE = ['mc', 'fill', 'spot', 'order', 'match'];

let CFG, C, LES, P, KEY, ACCOUNT, ACCOUNT_KEY, ACCOUNTS_KEY;
const S = { tab: 'learn', modal: null, lesson: false, rs: false, open: {}, billing: 'year' };
let L = null;

/* ---------- content loading ---------- */
async function load() {
  if (window.__CONTENT__) return window.__CONTENT__;
  const j = async (p) => { const r = await fetch(p); if (!r.ok) throw new Error(p + ' returned ' + r.status); return r.json(); };
  const config = await j('content/config.json');
  const course = await j('content/course.json');
  const ids = [];
  course.tracks.forEach((t) => t.units.forEach((u) => u.lessons.forEach((id) => ids.push(id))));
  const lessons = {};
  await Promise.all(ids.map(async (id) => { lessons[id] = await j('content/lessons/' + id + '.json'); }));
  return { config, course, lessons };
}

/* ---------- progress (localStorage, with in-memory fallback) ---------- */
const mem = {};
const store = {
  get(k) { try { const v = localStorage.getItem(k); if (v) return JSON.parse(v); } catch (e) { /* storage unavailable */ } return mem[k] || null; },
  set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};
const now = () => Date.now();
const fresh = () => ({ xp: 0, streak: 0, lastDay: null, hearts: CFG.hearts.max, heartsAt: now(), done: {}, missed: [], pro: false });
function save() {
  if (!ACCOUNT) { store.set(KEY, P); return; }
  const all = store.get(ACCOUNTS_KEY) || {};
  all[ACCOUNT.email] = { ...ACCOUNT, progress: P };
  store.set(ACCOUNTS_KEY, all);
  store.set(ACCOUNT_KEY, ACCOUNT.email);
}
function emailKey(email) { return email.trim().toLowerCase(); }
async function passwordHash(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function accountProgress(progress) { return Object.assign(fresh(), progress || {}); }
function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function yesterdayKey() { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); }
const streakNow = () => (P.lastDay === dayKey() || P.lastDay === yesterdayKey() ? P.streak : 0);
function touchStreak() {
  const t = dayKey();
  if (P.lastDay === t) return;
  P.streak = P.lastDay === yesterdayKey() ? P.streak + 1 : 1;
  P.lastDay = t;
}
function regen() {
  if (P.pro) return;
  const max = CFG.hearts.max, ms = CFG.hearts.regenMinutes * 60000;
  if (P.hearts >= max) { P.hearts = max; P.heartsAt = now(); return; }
  const g = Math.floor((now() - P.heartsAt) / ms);
  if (g > 0) { P.hearts = Math.min(max, P.hearts + g); P.heartsAt = P.hearts >= max ? now() : P.heartsAt + g * ms; }
}
function loseHeart() {
  if (P.pro) return;
  if (P.hearts >= CFG.hearts.max) P.heartsAt = now();
  P.hearts = Math.max(0, P.hearts - 1);
}
const heartWait = () => Math.max(1, Math.ceil((P.heartsAt + CFG.hearts.regenMinutes * 60000 - now()) / 60000));

/* ---------- course helpers ---------- */
function flat() {
  const out = [];
  C.tracks.forEach((t) => t.units.forEach((u) => u.lessons.forEach((id) => out.push({ id, unit: u, track: t }))));
  return out;
}
function lessonStates() {
  let allPrev = true;
  const map = {};
  flat().forEach((x) => {
    const done = !!P.done[x.id];
    const proLock = x.unit.tier === 'pro' && !P.pro;
    let st;
    if (proLock) st = 'pro'; else if (done) st = 'done'; else if (allPrev) st = 'current'; else st = 'locked';
    if (!done) allPrev = false;
    map[x.id] = st;
  });
  return map;
}

/* ---------- icons + mascot ---------- */
const ic = {
  flame: (s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FF8A3D" d="M12 2c1 3.6 5.3 5.6 5.3 10.2A5.3 5.3 0 0 1 6.7 12.2c0-2 .9-3.3 2.1-4.4.2 1.5.9 2.2 1.8 2.4C10.2 7.6 10.5 4.6 12 2z"/></svg>`,
  bolt: (s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FFB800" d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>`,
  heart: (s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FF4F75" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
  lock: (s = 26) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="3" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  check: (s = 26) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  star: (s = 36) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`,
  x: (s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  home: (s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor"/></svg>`,
  loop: (s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M20.5 3.5v5.5H15" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  gem: (s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z" fill="currentColor"/></svg>`
};
function mascot(size, mood) {
  mood = mood || 'happy';
  const eyes = mood === 'cheer'
    ? '<path d="M32 60q11-14 22 0M66 60q11-14 22 0" fill="none" stroke="#22204A" stroke-width="5" stroke-linecap="round"/>'
    : `<circle cx="44" cy="60" r="13" fill="#fff"/><circle cx="76" cy="60" r="13" fill="#fff"/>
       <circle cx="${mood === 'sad' ? 45 : 46}" cy="${mood === 'sad' ? 65 : 62}" r="6.5" fill="#22204A"/><circle cx="${mood === 'sad' ? 77 : 78}" cy="${mood === 'sad' ? 65 : 62}" r="6.5" fill="#22204A"/>
       <circle cx="48" cy="59" r="2" fill="#fff"/><circle cx="80" cy="59" r="2" fill="#fff"/>`;
  const mouth = mood === 'cheer'
    ? '<path d="M46 80q14 24 28 0z" fill="#22204A"/><path d="M53 89q7 6 14 0q-7-3-14 0z" fill="#FF7391"/>'
    : mood === 'sad'
      ? '<path d="M51 91q9-9 18 0" fill="none" stroke="#22204A" stroke-width="4.5" stroke-linecap="round"/>'
      : '<path d="M50 82q10 10 20 0" fill="none" stroke="#22204A" stroke-width="4.5" stroke-linecap="round"/>';
  return `<svg width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
    <path d="M42 26L36 10M78 26l6-16" stroke="#3A3AC9" stroke-width="5" stroke-linecap="round"/>
    <circle cx="35" cy="8" r="6" fill="#FFC93C"/><circle cx="85" cy="8" r="6" fill="#FFC93C"/>
    <rect x="14" y="24" width="92" height="84" rx="34" fill="#5B5BFF"/>
    <path d="M30 46q4-14 20-16" stroke="#fff" stroke-opacity=".45" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse cx="27" cy="80" rx="8" ry="5" fill="#FF7391" opacity=".7"/><ellipse cx="93" cy="80" rx="8" ry="5" fill="#FF7391" opacity=".7"/>
    ${eyes}${mouth}</svg>`;
}

/* ---------- seeded shuffle (same order every time for a given card) ---------- */
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function shuffled(n, seed) {
  const a = [...Array(n).keys()];
  let r = hash(seed) || 1;
  const rnd = () => { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; };
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  if (a.every((v, i) => v === i)) a.push(a.shift());
  return a;
}

/* ---------- widgets (interactive cards). Add new ones here, then list the name in tools/validate.mjs ---------- */
const PRE = ['inter', 'over', 'dis', 'mis', 'non', 'pre', 'un', 're'];
const SUF = ['ization', 'ation', 'ibly', 'ably', 'able', 'ible', 'ingly', 'ness', 'ment', 'ing', 'ally', 'ly', 'ed', 'er', 'es', 's'];
function splitWord(w) {
  let head = '', tail = '', mid = w;
  for (const p of PRE) if (mid.toLowerCase().startsWith(p) && mid.length > p.length + 3) { head = mid.slice(0, p.length); mid = mid.slice(p.length); break; }
  for (const s of SUF) if (mid.toLowerCase().endsWith(s) && mid.length > s.length + 2) { tail = mid.slice(mid.length - s.length); mid = mid.slice(0, mid.length - s.length); break; }
  const out = [];
  if (head) out.push(head);
  if (mid.length > 8) { const h = Math.ceil(mid.length / 2); out.push(mid.slice(0, h), mid.slice(h)); } else out.push(mid);
  if (tail) out.push(tail);
  return out;
}
function tokenize(text) {
  const out = []; const re = /\s?[A-Za-z]+|\s?\d+|\s?[^\sA-Za-z\d]/g; let m;
  while ((m = re.exec(text))) {
    const raw = m[0], lead = /^\s/.test(raw) ? ' ' : '', w = raw.trim();
    if (/^[A-Za-z]{8,}$/.test(w)) { const p = splitWord(w); p[0] = lead + p[0]; out.push(...p); } else out.push(raw);
  }
  return out;
}
const tokChips = (t) => { const k = tokenize(t); return k.length ? k.map((x, i) => `<span class="tok t${i % 5}">${esc(x)}</span>`).join('') : '<span class="empty">Type something to see tokens.</span>'; };
const tokCount = (t) => { const w = t.trim().split(/\s+/).filter(Boolean).length; return w ? `${w} ${w === 1 ? 'word' : 'words'} became ${tokenize(t).length} tokens` : ''; };

function dist(opts, T) {
  const w = opts.map((o) => Math.pow(o[1], 1 / T));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}

const widgets = {
  tokenizer: {
    init: (c) => ({ text: c.props.text }),
    html: (c, w) => `<label class="sr" for="tokin">Text to split into tokens</label>
      <textarea id="tokin" class="field" rows="3" maxlength="140">${esc(w.text)}</textarea>
      <div class="tokens" id="toks">${tokChips(w.text)}</div><div class="count" id="tokc">${tokCount(w.text)}</div>
      ${c.props.note ? `<p class="fine">${esc(c.props.note)}</p>` : ''}`,
    input(e, c, w) {
      if (e.target.id !== 'tokin') return;
      w.text = e.target.value; $('#toks').innerHTML = tokChips(w.text); $('#tokc').textContent = tokCount(w.text);
    }
  },
  temperature: {
    init: () => ({ T: 1, hist: [] }),
    html(c, w) {
      const o = c.props.options, d = dist(o, w.T);
      const bars = o.map((x, i) => `<div class="brow"><span>${esc(x[0])}</span><div class="track"><i id="b${i}" style="width:${(d[i] * 100).toFixed(1)}%"></i></div><span class="pc" id="p${i}">${Math.round(d[i] * 100)}%</span></div>`).join('');
      return `<div class="sent">${esc(c.props.prompt)} <span class="blank" id="blank">${esc(w.hist.length ? w.hist[w.hist.length - 1] : '___')}</span></div>
        <div class="bars">${bars}</div>
        <div class="range"><label for="tempr">Temperature <span id="tv">${w.T.toFixed(1)}</span></label>
        <input id="tempr" type="range" min="0.1" max="2" step="0.1" value="${w.T}"><div class="ends"><span>Focused</span><span>Wild</span></div></div>
        <button class="btn sun" data-act="wact" data-w="sample">${esc(c.props.button || 'Sample')}</button>
        <div class="hist" id="hist">${w.hist.map((h) => `<span>${esc(h)}</span>`).join('')}</div>`;
    },
    input(e, c, w) {
      if (e.target.id !== 'tempr') return;
      w.T = +e.target.value; w.hist = [];
      dist(c.props.options, w.T).forEach((v, i) => { $('#b' + i).style.width = (v * 100).toFixed(1) + '%'; $('#p' + i).textContent = Math.round(v * 100) + '%'; });
      $('#tv').textContent = w.T.toFixed(1); $('#hist').innerHTML = ''; $('#blank').textContent = '___';
    },
    act(name, c, w) {
      if (name !== 'sample') return;
      const o = c.props.options, d = dist(o, w.T);
      let r = Math.random(), k = 0;
      for (; k < d.length - 1; k++) { r -= d[k]; if (r <= 0) break; }
      w.hist.push(o[k][0]); if (w.hist.length > 10) w.hist.shift();
      $('#blank').textContent = o[k][0]; $('#hist').innerHTML = w.hist.map((h) => `<span>${esc(h)}</span>`).join('');
    }
  }
};
const W = (c) => (L.w[c.id] || (L.w[c.id] = widgets[c.widget].init(c)));

/* ---------- lessons ---------- */
const cur = () => L.queue[L.i] || {};

function initLesson(o) {
  L = { id: o.id || null, title: o.title, practice: !!o.practice, lesson: o.lesson || null,
        queue: o.cards.map((c) => ({ ...c })), i: 0, done: 0, first: 0,
        checks: o.cards.filter((c) => CHECKABLE.includes(c.type)).length, total: o.cards.length,
        sel: null, ord: [], pairs: {}, msel: null, phase: 'ask', ok: false, out: false, fin: false, w: {}, conf: '', xp: 0, acc: 100, bonus: false };
  S.lesson = true; S.modal = null; S.rs = true; render();
}
function openLesson(id) {
  regen();
  if (!P.pro && P.hearts <= 0) {
    const acts = [{ label: 'Get unlimited hearts with Pro', act: 'pro', cls: 'brand' }];
    if (CFG.demo) acts.push({ label: 'Refill hearts (demo)', act: 'refillHome', cls: 'sun' });
    acts.push({ label: 'Close', act: 'close', cls: 'ghost' });
    S.modal = { title: 'Out of hearts', body: `Your next heart arrives in about ${heartWait()} min. Pro members never run out.`, actions: acts };
    render(); return;
  }
  const les = LES[id];
  initLesson({ id, title: les.title, lesson: les, cards: les.cards });
}
function startPractice() {
  const cards = [];
  for (const m of P.missed) {
    const les = LES[m.l], c = les && les.cards.find((x) => x.id === m.c);
    if (c) cards.push({ ...c, _m: m });
    if (cards.length >= 5) break;
  }
  if (!cards.length) { P.missed = []; save(); render(); return; }
  initLesson({ title: 'Practice', practice: true, cards });
}
function addMissed(lid, cid) { if (!P.missed.some((m) => m.l === lid && m.c === cid)) P.missed.push({ l: lid, c: cid }); }
function removeMissed(m) { P.missed = P.missed.filter((x) => !(x.l === m.l && x.c === m.c)); }

function confetti() {
  const cols = ['#5B5BFF', '#FFC93C', '#33D6A8', '#FF7391']; let h = '';
  for (let i = 0; i < 30; i++) h += `<span style="left:${(Math.random() * 100).toFixed(1)}%;background:${cols[i % 4]};animation-delay:${(Math.random() * 0.7).toFixed(2)}s;animation-duration:${(1.9 + Math.random() * 1.5).toFixed(2)}s;transform:rotate(${Math.floor(Math.random() * 360)}deg)"></span>`;
  return `<div class="confetti" aria-hidden="true">${h}</div>`;
}
function complete() {
  L.acc = L.checks ? Math.round((L.first / L.checks) * 100) : 100;
  let xp;
  if (L.practice) xp = CFG.xp.practice;
  else {
    const firstTime = !P.done[L.id];
    xp = firstTime ? (L.lesson.xp || CFG.xp.lesson) : CFG.xp.replay;
    if (L.acc === 100 && L.checks && CFG.xp.perfectBonus) { xp += CFG.xp.perfectBonus; L.bonus = true; }
    const prev = P.done[L.id] || { n: 0, best: 0 };
    P.done[L.id] = { n: prev.n + 1, best: Math.max(prev.best, L.acc) };
  }
  P.xp += xp; L.xp = xp; touchStreak(); save();
  L.fin = true; L.done = L.total; L.conf = confetti();
}
function advance() {
  const c = cur();
  const play = c.type === 'concept' || c.type === 'widget';
  if (play || L.ok) L.done++;
  else if (!c.retry) L.queue.push({ ...c, retry: true });
  else L.done++;
  L.i++; L.sel = null; L.ord = []; L.pairs = {}; L.msel = null; L.phase = 'ask'; L.ok = false; S.rs = true;
  if (L.i >= L.queue.length) complete();
  render();
}
const ansText = (c) => ((c.type === 'mc' || c.type === 'fill') ? 'Answer: ' + c.options[c.answer] + '. ' : '');

/* ---------- views ---------- */
function topHTML() {
  const s = streakNow();
  return `<button class="brand brand-btn" data-act="account" aria-label="${ACCOUNT ? 'Open account menu' : 'Sign in or create an account'}">${mascot(30)}${esc(CFG.name.toLowerCase())}</button>
  <div class="stats">
    <div class="pill" aria-label="${s} day streak">${ic.flame()}${s}</div>
    <div class="pill" aria-label="${P.xp} XP">${ic.bolt()}${P.xp}</div>
    <button class="pill" data-act="pro" aria-label="${P.pro ? 'Unlimited' : P.hearts} hearts. See plans">${ic.heart()}${P.pro ? '∞' : P.hearts}</button>
    <button class="pill account-pill" data-act="account" aria-label="${ACCOUNT ? 'Account: ' + esc(ACCOUNT.email) : 'Sign in or create an account'}">${ACCOUNT ? esc(ACCOUNT.email.split('@')[0]) : 'Sign in'}</button>
  </div>`;
}
function navHTML() {
  const t = [['learn', 'Learn', ic.home()], ['practice', 'Practice', ic.loop()], ['plans', 'Plans', ic.gem()]];
  return t.map((x) => `<button data-tab="${x[0]}" ${S.tab === x[0] ? 'aria-current="page"' : ''}><span class="ico">${x[2]}${x[0] === 'practice' && P.missed.length ? `<span class="dot" aria-label="${P.missed.length} to review">${P.missed.length}</span>` : ''}</span>${x[1]}</button>`).join('');
}
function homeHTML() {
  const st = lessonStates();
  let h = '';
  C.tracks.forEach((t) => {
    if (C.tracks.length > 1) h += `<h2 class="trk">${esc(t.title)}</h2>`;
    t.units.forEach((u, ui) => {
      const n = u.lessons.length, doneN = u.lessons.filter((id) => st[id] === 'done').length;
      const header = (tag, extra) => `<${tag} ${extra}><h2>Unit ${ui + 1}: ${esc(u.title)}</h2><p>${esc(u.blurb || '')}</p></${tag}>`;
      if (u.tier === 'pro' && !P.pro) {
        h += `<button class="unit pro" data-act="pro"><div><h2>Unit ${ui + 1}: ${esc(u.title)}</h2><p>${esc(u.blurb || '')}</p></div><span class="tag">${ic.lock(14)}Pro</span></button>`;
        return;
      }
      const all = doneN === n;
      if (all && !S.open[u.id]) {
        h += `<button class="unit-mini" data-act="toggleUnit" data-u="${esc(u.id)}"><span class="badge">${ic.check(20)}</span><span><h3>Unit ${ui + 1}: ${esc(u.title)}</h3><p>${n} of ${n} lessons complete. Tap to review.</p></span></button>`;
        return;
      }
      const cls = `unit c-${u.color || 'brand'}`;
      h += all ? header('button', `class="${cls}" data-act="toggleUnit" data-u="${esc(u.id)}"`) : header('div', `class="${cls}"`);
      h += '<div class="path">' + u.lessons.map((id, i) => {
        const les = LES[id], s = st[id], dx = Math.round(Math.sin(i * 1.2) * 46);
        const icon = s === 'done' ? ic.check(30) : s === 'current' ? ic.star(40) : ic.lock(28);
        const label = s === 'done' ? 'completed' : s === 'current' ? 'start' : 'locked';
        const bub = s === 'current' ? `<div class="bubble">${doneN === 0 && ui === 0 ? 'Start' : 'Up next'}</div>` : '';
        return `<div class="step ${s}" style="--dx:${dx}px">${bub}<button class="node ${s}" data-act="node" data-id="${esc(id)}" aria-label="${esc(les.title)}, ${label}">${icon}</button><div class="lbl">${esc(les.title)}</div></div>`;
      }).join('') + '</div>';
    });
  });
  return h + '<p class="soon">More units are on the way.</p>';
}
function practiceHTML() {
  const n = P.missed.length, total = flat().length, doneN = Object.keys(P.done).length;
  const head = n
    ? `<div class="card">${mascot(84)}<h2>${n} ${n === 1 ? 'question' : 'questions'} to review</h2><p>Questions you missed come back here until you get them right.</p><button class="btn brand" data-act="practice">Review now</button></div>`
    : `<div class="card">${mascot(84)}<h2>Nothing to review yet</h2><p>Questions you miss show up here so you can lock them in.</p><button class="btn brand" data-act="goLearn">Go to lessons</button></div>`;
  return `<h1 class="ph">Practice</h1><p class="sub">A few minutes on what you've missed beats a long re-read.</p>${head}
    <div class="tiles solo"><div class="tile" style="--c:var(--mint)"><b>Lessons done</b><span>${doneN}/${total}</span></div><div class="tile" style="--c:var(--sun)"><b>Total XP</b><span>${P.xp}</span></div><div class="tile" style="--c:var(--coral)"><b>Day streak</b><span>${streakNow()}</span></div></div>`;
}
function plansHTML() {
  const y = S.billing === 'year', per = y ? 'year' : 'month';
  const li = (t) => `<li>${ic.check(18)}<span>${esc(t)}</span></li>`;
  const cards = CFG.plans.map((p) => {
    const note = typeof p.note === 'object' ? p.note[per] : (p.note || '');
    const sub = p.sub && p.sub[per] ? p.sub[per] : '';
    let btn;
    if (p.id === 'free') btn = `<button class="btn" disabled>${P.pro && CFG.demo ? 'Included' : esc(p.cta)}</button>`;
    else if (p.id === 'pro' && CFG.demo && P.pro) btn = `<button class="btn ghost" data-act="plan" data-p="pro">Pro is on (demo). Turn off</button>`;
    else btn = `<button class="btn ${p.cls || 'brand'}" data-act="plan" data-p="${esc(p.id)}">${esc(p.cta)}</button>`;
    return `<section class="plan ${p.highlight ? 'pro' : ''}"><h2>${esc(p.name)}</h2><div class="price">${esc(p.price[per])}<span class="per">${esc((p.per && p.per[per]) || '')}</span></div>
      <p class="note">${esc(note)}${sub ? ' ' + esc(sub) : ''}</p><ul>${p.features.map(li).join('')}</ul>${btn}</section>`;
  }).join('');
  return `<h1 class="ph">Pick your plan</h1><p class="sub">Start free. Upgrade when you want every track.</p>
    <div class="seg" role="group" aria-label="Billing period">
      <button data-act="bill" data-v="month" aria-pressed="${!y}">Monthly</button>
      <button data-act="bill" data-v="year" aria-pressed="${y}">Yearly<em>save ${esc((CFG.billing && CFG.billing.yearlySavings) || '')}</em></button>
    </div>${cards}<p class="foot">${esc(CFG.plansNote || '')}</p>
    ${CFG.demo ? '<button class="btn ghost" data-act="reset">Reset demo progress</button>' : ''}`;
}
function modalHTML() {
  const m = S.modal;
  if (m.kind === 'auth') {
    const signup = m.mode === 'signup';
    return `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">${signup ? 'Create your account' : 'Welcome back'}</h2><p>${signup ? 'Save your Nibble progress to this browser with an email and password.' : 'Sign in to continue your saved lessons.'}</p>
      <form id="auth-form" class="account-form"><label for="auth-email">Email</label><input id="auth-email" name="email" type="email" autocomplete="email" required value="${esc(m.email || '')}"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="8" required><button class="btn brand" type="submit">${signup ? 'Create account' : 'Sign in'}</button></form>
      ${m.error ? `<p class="auth-error" role="alert">${esc(m.error)}</p>` : ''}<button class="btn ghost" data-act="authToggle">${signup ? 'Already have an account? Sign in' : 'New here? Create an account'}</button><button class="btn ghost" data-act="close">Cancel</button></div></div>`;
  }
  if (m.kind === 'account') {
    return `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Your account</h2><p class="account-email">${esc(ACCOUNT.email)}</p><p>Your progress is saved in this browser for this account. Cross-device sync needs a connected server.</p><div class="stack"><button class="btn coral" data-act="signout">Sign out</button><button class="btn ghost" data-act="close">Close</button></div></div></div>`;
  }
  return `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">${esc(m.title)}</h2><p>${esc(m.body)}</p><div class="stack">${m.actions.map((a) => `<button class="btn ${a.cls}" data-act="${a.act}">${esc(a.label)}</button>`).join('')}</div></div></div>`;
}

/* lesson body / footer */
function bodyHTML(c) {
  if (L.fin) {
    return `<div class="done">${L.conf}${mascot(128, 'cheer')}<h1>${L.practice ? 'Practice complete' : 'Lesson complete'}</h1>
      <p>${L.practice ? 'Reviewing what you missed is how it sticks.' : 'Nice work. ' + (L.bonus ? 'A perfect run earns bonus XP.' : 'Keep the streak going.')}</p>
      <div class="tiles"><div class="tile" style="--c:var(--sun)"><b>XP earned</b><span>+${L.xp}</span></div><div class="tile" style="--c:var(--mint)"><b>Accuracy</b><span>${L.acc}%</span></div><div class="tile" style="--c:var(--coral)"><b>Day streak</b><span>${streakNow()}</span></div></div></div>`;
  }
  if (L.out) return `<div class="done">${mascot(120, 'sad')}<h1>Out of hearts</h1><p>Hearts refill over time. Pro members never run out.</p></div>`;
  const chk = L.phase === 'fb';
  const say = (mood) => `<div class="say">${mascot(64, mood || c.mood)}<div class="bub">${md(c.say)}</div></div>`;
  if (c.type === 'concept') {
    return `<div class="say">${mascot(88, c.mood)}<div class="bub">${md(c.say)}</div></div>` +
      (c.points ? `<ul class="pts">${c.points.map((p) => `<li>${md(p)}</li>`).join('')}</ul>` : '');
  }
  if (c.type === 'widget') return say() + widgets[c.widget].html(c, W(c));
  if (c.type === 'mc') {
    return `<h2 class="q">${md(c.q)}</h2>` + c.options.map((t, i) => {
      const cls = chk ? (i === c.answer ? 'right' : i === L.sel ? 'wrong' : '') : '';
      return `<button class="opt ${cls}" data-act="pick" data-i="${i}" aria-pressed="${L.sel === i}" ${chk ? 'disabled' : ''}>${md(t)}</button>`;
    }).join('');
  }
  if (c.type === 'fill') {
    const blank = L.sel !== null ? esc(c.options[L.sel]) : '';
    return `<h2 class="q">${md(c.q || 'Fill in the blank')}</h2><div class="sent">${esc(c.before)} <span class="blank">${blank || '&nbsp;'}</span> ${esc(c.after)}</div><div style="height:12px"></div>` +
      c.options.map((t, i) => {
        const cls = chk ? (i === c.answer ? 'right' : i === L.sel ? 'wrong' : '') : '';
        return `<button class="opt ${cls}" data-act="pick" data-i="${i}" aria-pressed="${L.sel === i}" ${chk ? 'disabled' : ''}>${esc(t)}</button>`;
      }).join('');
  }
  if (c.type === 'spot') {
    return `<h2 class="q">${md(c.q)}</h2>` + c.sentences.map((t, i) => {
      const cls = chk ? (i === c.answer ? 'right' : i === L.sel ? 'wrong' : '') : '';
      return `<button class="opt ${cls}" data-act="pick" data-i="${i}" aria-pressed="${L.sel === i}" ${chk ? 'disabled' : ''}>${esc(t)}</button>`;
    }).join('');
  }
  if (c.type === 'order') {
    const bank = c._b || (c._b = shuffled(c.steps.length, c.id));
    const remaining = bank.filter((i) => !L.ord.includes(i));
    const ansCls = (pos) => (chk ? (L.ord[pos] === pos ? 'right' : 'wrong') : '');
    const answer = L.ord.length
      ? L.ord.map((si, pos) => `<button class="chip ${ansCls(pos)}" data-act="chip" data-side="ans" data-i="${si}" ${chk ? 'disabled' : ''}><span class="n">${pos + 1}</span>${esc(c.steps[si])}</button>`).join('')
      : '<p class="hintline">Tap the steps below in order</p>';
    const fix = chk && !L.ok ? `<h3 class="cor">Correct order</h3><div class="bank">${c.steps.map((s, i) => `<div class="chip right"><span class="n">${i + 1}</span>${esc(s)}</div>`).join('')}</div>` : '';
    return `<h2 class="q">${md(c.q)}</h2><div class="ans">${answer}</div>` +
      (chk ? fix : `<div class="bank">${remaining.map((si) => `<button class="chip" data-act="chip" data-side="bank" data-i="${si}">${esc(c.steps[si])}</button>`).join('')}</div>`);
  }
  if (c.type === 'match') {
    const n = c.pairs.length, rs = c._r || (c._r = shuffled(n, c.id + 'm'));
    const inv = {}; Object.keys(L.pairs).forEach((l) => { inv[L.pairs[l]] = +l; });
    const left = c.pairs.map((p, i) => {
      const paired = L.pairs[i] !== undefined;
      const cls = chk ? (L.pairs[i] === i ? 'right' : 'wrong') : '';
      return `<button class="mbtn ${cls}" data-act="mleft" data-i="${i}" aria-pressed="${L.msel === i}" ${chk ? 'disabled' : ''}>${paired ? `<span class="n">${i + 1}</span>` : ''}<span>${esc(p[0])}</span></button>`;
    }).join('');
    const right = rs.map((ri) => {
      const l = inv[ri], paired = l !== undefined;
      const cls = chk && paired ? (l === ri ? 'right' : 'wrong') : '';
      return `<button class="mbtn ${cls}" data-act="mright" data-i="${ri}" ${chk ? 'disabled' : ''}>${paired ? `<span class="n">${l + 1}</span>` : ''}<span>${esc(c.pairs[ri][1])}</span></button>`;
    }).join('');
    return `<h2 class="q">${md(c.q)}</h2><p class="fine" style="margin:-8px 0 14px">Tap an item on the left, then its match on the right.</p><div class="mcols"><div class="mcol">${left}</div><div class="mcol">${right}</div></div>` +
      (chk && !L.ok ? `<h3 class="cor">Correct matches</h3><div class="mcol">${c.pairs.map((p) => `<div class="chip right">${esc(p[0])}: ${esc(p[1])}</div>`).join('')}</div>` : '');
  }
  return '';
}
function footHTML(c) {
  if (L.fin) return '<div class="l-foot"><button class="btn brand" data-act="finish">Continue</button></div>';
  if (L.out) return '<div class="l-foot"><div class="stack"><button class="btn brand" data-act="goPro">Get unlimited hearts with Pro</button>' + (CFG.demo ? '<button class="btn sun" data-act="refill">Refill hearts (demo)</button>' : '') + '<button class="btn ghost" data-act="quit">Quit lesson</button></div></div>';
  if (L.phase === 'fb') {
    const bad = !L.ok;
    return `<div class="l-foot ${bad ? 'bad' : 'ok'}"><div class="fb ${bad ? 'bad' : 'ok'}">${bad ? 'Not quite' : 'Right'}</div><p class="why">${bad ? esc(ansText(c)) : ''}${md(c.why)}</p><button class="btn ${bad ? 'coral' : 'mint'}" data-act="next">Continue</button></div>`;
  }
  if (c.type === 'concept' || c.type === 'widget') return '<div class="l-foot"><button class="btn brand" data-act="next">Continue</button></div>';
  const ready = c.type === 'order' ? L.ord.length === c.steps.length : c.type === 'match' ? Object.keys(L.pairs).length === c.pairs.length : L.sel !== null;
  return `<div class="l-foot"><button class="btn brand" data-act="check" ${ready ? '' : 'disabled'}>Check</button></div>`;
}
function lessonHTML() {
  const c = cur(), pct = Math.min(100, Math.round((L.done / L.total) * 100));
  const hearts = L.practice ? '' : `<div class="hp" aria-label="${P.pro ? 'Unlimited' : P.hearts} hearts">${ic.heart()}${P.pro ? '∞' : P.hearts}</div>`;
  return `<section class="lesson" aria-label="${esc(L.title)}"><div class="l-top"><button class="x" data-act="quit" aria-label="Quit lesson">${ic.x()}</button>
    <div class="bar" role="progressbar" aria-label="Lesson progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>${hearts || '<span style="min-width:52px"></span>'}</div>
    <div class="l-body">${bodyHTML(c)}</div>${footHTML(c)}</section>`;
}

/* ---------- render ---------- */
function render() {
  const shell = $('#shell');
  regen();
  const ae = document.activeElement; let fk = null;
  if (ae && ae !== document.body && ae.dataset && (ae.dataset.act || ae.dataset.tab)) {
    fk = ae.dataset.tab ? `[data-tab="${ae.dataset.tab}"]` : `[data-act="${ae.dataset.act}"]` + (ae.dataset.i !== undefined ? `[data-i="${ae.dataset.i}"]` : '') + (ae.dataset.v ? `[data-v="${ae.dataset.v}"]` : '') + (ae.dataset.p ? `[data-p="${ae.dataset.p}"]` : '');
  }
  const m0 = shell.querySelector('.main'), l0 = shell.querySelector('.l-body');
  const ms = m0 ? m0.scrollTop : 0, ls = l0 ? l0.scrollTop : 0;
  const lock = S.lesson || S.modal;
  const view = S.tab === 'learn' ? homeHTML() : S.tab === 'practice' ? practiceHTML() : plansHTML();
  shell.innerHTML = `<header class="top" ${lock ? 'inert' : ''}>${topHTML()}</header><main class="main" ${lock ? 'inert' : ''}>${view}</main><nav class="nav" aria-label="Main" ${lock ? 'inert' : ''}>${navHTML()}</nav>${S.lesson && L ? lessonHTML() : ''}${S.modal ? modalHTML() : ''}`;
  const m1 = shell.querySelector('.main'), l1 = shell.querySelector('.l-body');
  if (!S.rs) { if (m1) m1.scrollTop = ms; if (l1) l1.scrollTop = ls; }
  S.rs = false;
  if (S.modal) { const b = shell.querySelector('.sheet .btn'); if (b) b.focus({ preventScroll: true }); }
  else if (fk) { const el = shell.querySelector(fk); if (el && !el.disabled) el.focus({ preventScroll: true }); }
  $('#live').textContent = (S.lesson && L && L.phase === 'fb') ? (L.ok ? 'Right' : 'Not quite') : '';
}
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  $('#shell').appendChild(t); setTimeout(() => t.remove(), 2600);
}

/* ---------- actions ---------- */
const A = {
  account() { S.modal = ACCOUNT ? { kind: 'account' } : { kind: 'auth', mode: 'signin', email: '', error: '' }; render(); },
  authToggle() { S.modal.mode = S.modal.mode === 'signup' ? 'signin' : 'signup'; S.modal.error = ''; render(); },
  async authSubmit(form) {
    const email = emailKey(form.email.value), password = form.password.value;
    S.modal.email = email;
    if (!email || password.length < 8) { S.modal.error = 'Use a valid email and a password with at least 8 characters.'; render(); return; }
    const all = store.get(ACCOUNTS_KEY) || {}, existing = all[email], hash = await passwordHash(password);
    if (S.modal.mode === 'signup') {
      if (existing) { S.modal.error = 'An account with this email already exists. Sign in instead.'; render(); return; }
      ACCOUNT = { email, passwordHash: hash, createdAt: new Date().toISOString(), progress: P };
      all[email] = ACCOUNT; store.set(ACCOUNTS_KEY, all); store.set(ACCOUNT_KEY, email); save();
      S.modal = null; render(); toast('Account created. Your progress is saved here.'); return;
    }
    if (!existing || existing.passwordHash !== hash) { S.modal.error = 'That email or password is not correct.'; render(); return; }
    ACCOUNT = existing; P = accountProgress(existing.progress); store.set(ACCOUNT_KEY, email); save();
    S.modal = null; render(); toast('Signed in. Progress loaded.');
  },
  signout() { save(); ACCOUNT = null; store.set(ACCOUNT_KEY, null); P = fresh(); S.modal = null; S.tab = 'learn'; S.open = {}; S.rs = true; render(); toast('Signed out.'); },
  node(b) {
    const id = b.dataset.id, s = lessonStates()[id];
    if (s === 'locked') { S.modal = { title: 'Locked', body: 'Finish the lesson before this one to unlock it.', actions: [{ label: 'Got it', act: 'close', cls: 'brand' }] }; render(); return; }
    openLesson(id);
  },
  toggleUnit(b) { S.open[b.dataset.u] = !S.open[b.dataset.u]; render(); },
  close() { S.modal = null; render(); },
  pro() { S.modal = null; S.tab = 'plans'; S.rs = true; render(); },
  bill(b) { S.billing = b.dataset.v; render(); },
  plan(b) {
    if (CFG.demo && b.dataset.p === 'pro') { P.pro = !P.pro; if (P.pro) P.hearts = CFG.hearts.max; save(); toast(P.pro ? 'Pro is on for this demo. Everything is unlocked.' : 'Pro is off.'); render(); return; }
    toast("Prototype only. Checkout isn't connected.");
  },
  reset() { S.modal = { title: 'Reset demo progress?', body: 'This clears XP, streak, hearts, completed lessons and missed questions on this device.', actions: [{ label: 'Reset progress', act: 'resetYes', cls: 'coral' }, { label: 'Cancel', act: 'close', cls: 'ghost' }] }; render(); },
  resetYes() { P = fresh(); save(); S.modal = null; S.tab = 'learn'; S.open = {}; S.rs = true; render(); },
  goLearn() { S.tab = 'learn'; S.rs = true; render(); },
  practice() { startPractice(); },
  refillHome() { P.hearts = CFG.hearts.max; save(); S.modal = null; render(); },
  quit() { L = null; S.lesson = false; S.rs = true; save(); render(); },
  goPro() { L = null; S.lesson = false; S.tab = 'plans'; S.rs = true; render(); },
  refill() { P.hearts = CFG.hearts.max; save(); L.out = false; advance(); },
  pick(b) { L.sel = +b.dataset.i; render(); },
  chip(b) {
    const i = +b.dataset.i;
    if (b.dataset.side === 'bank') { if (!L.ord.includes(i)) L.ord.push(i); } else L.ord = L.ord.filter((x) => x !== i);
    render();
  },
  mleft(b) { const i = +b.dataset.i; if (L.pairs[i] !== undefined) delete L.pairs[i]; L.msel = L.msel === i ? null : i; render(); },
  mright(b) {
    const r = +b.dataset.i, holder = Object.keys(L.pairs).find((k) => L.pairs[k] === r);
    if (L.msel !== null) { if (holder !== undefined) delete L.pairs[holder]; L.pairs[L.msel] = r; L.msel = null; }
    else if (holder !== undefined) delete L.pairs[holder];
    render();
  },
  check() {
    const c = cur();
    let ok;
    if (c.type === 'order') ok = L.ord.length === c.steps.length && L.ord.every((v, i) => v === i);
    else if (c.type === 'match') ok = c.pairs.every((_, i) => L.pairs[i] === i);
    else ok = L.sel === c.answer;
    L.ok = ok; L.phase = 'fb';
    if (!ok && !L.practice) loseHeart();
    if (ok && !c.retry) L.first++;
    if (!ok && !c.retry && !L.practice) addMissed(L.id, c.id);
    if (ok && !c.retry && L.practice && c._m) removeMissed(c._m);
    save(); render();
  },
  next() {
    if (L.phase === 'fb' && !L.ok && !P.pro && P.hearts === 0 && !L.practice) { L.out = true; render(); return; }
    advance();
  },
  wact(b) { const c = cur(); widgets[c.widget].act && widgets[c.widget].act(b.dataset.w, c, W(c)); },
  finish() { L = null; S.lesson = false; S.rs = true; render(); }
};

document.addEventListener('click', (e) => {
  if (!CFG) return;
  if (e.target.classList && e.target.classList.contains('scrim')) { A.close(); return; }
  const t = e.target.closest('[data-tab]');
  if (t) { S.tab = t.dataset.tab; S.rs = true; render(); return; }
  const b = e.target.closest('[data-act]');
  if (b && A[b.dataset.act]) A[b.dataset.act](b);
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'auth-form') return;
  e.preventDefault();
  A.authSubmit(e.target);
});
document.addEventListener('input', (e) => {
  if (!L || !S.lesson) return;
  const c = cur();
  if (c.type === 'widget' && widgets[c.widget].input) widgets[c.widget].input(e, c, W(c));
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.modal) A.close(); });

/* ---------- boot ---------- */
(async function boot() {
  try {
    const c = await load();
    CFG = c.config; C = c.course; LES = c.lessons; KEY = CFG.storageKey || 'nibble.v1'; ACCOUNT_KEY = KEY + '.account'; ACCOUNTS_KEY = KEY + '.accounts';
    const accounts = store.get(ACCOUNTS_KEY) || {}, active = store.get(ACCOUNT_KEY);
    ACCOUNT = active && accounts[active] ? accounts[active] : null;
    P = ACCOUNT ? accountProgress(ACCOUNT.progress) : accountProgress(store.get(KEY));
    document.title = CFG.name + ': ' + CFG.tagline;
    render();
  } catch (err) {
    $('#shell').innerHTML = '<p style="padding:24px">Could not load content: ' + esc(err.message) + '. If you opened src/index.html directly, run <code>npm run dev</code> instead, or open dist/index.html after <code>npm run build</code>.</p>';
  }
})();
})();
