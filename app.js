/* Thali — personal food tracker. All data stays in this phone's storage. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const r0 = x => Math.round(+x || 0);
const r1 = x => Math.round((+x || 0) * 10) / 10;
const num = v => { const x = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isFinite(x) ? x : 0; };
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const fmtDate = s => parseYmd(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const KEYS = ['kcal', 'p', 'c', 'f', 'fib'];
const LABEL = { kcal: 'Calories', p: 'Protein', c: 'Carbs', f: 'Fat', fib: 'Fiber' };
const UNIT = { kcal: 'kcal', p: 'g', c: 'g', f: 'g', fib: 'g' };
const zeroN = () => ({ kcal: 0, p: 0, c: 0, f: 0, fib: 0 });
const addN = (a, b, k = 1) => { KEYS.forEach(x => a[x] += (+b[x] || 0) * k); return a; };
const scaleN = (n, k) => { const o = {}; KEYS.forEach(x => o[x] = (+n[x] || 0) * k); return o; };
const roundN = n => { const o = {}; KEYS.forEach(x => o[x] = x === 'kcal' ? r0(n[x]) : r1(n[x])); return o; };

/* ---------------- State ---------------- */
const STORE = 'thali_v1';
const DEFAULT_SLOTS = [
  { name: 'Upon waking', h: 4 }, { name: 'Breakfast', h: 7.5 }, { name: 'Mid-morning', h: 10.5 },
  { name: 'Lunch', h: 12 }, { name: 'Snack', h: 15.5 }, { name: 'Dinner', h: 18.5 }, { name: 'Before bed', h: 21.5 }
];
function defaults() {
  return {
    v: 1,
    settings: { apiKey: '', model: '', weightUnit: 'lb', heightUnit: 'ftin', slots: DEFAULT_SLOTS.map(s => ({ ...s })),
      weekdayTypes: { 4: 'fasting' }, statePref: {}, lastBackup: 0, matchBy: 'kcal', hideInstall: false },
    profile: { sex: 'male', age: null, heightCm: null, weightKg: null, activity: 1.725, goal: 'lose', rateKg: 0.45 },
    goalSource: 'plan',
    custom: { kcal: 2200, p: 150, c: 220, f: 70, fib: 35 },
    fasting: { mode: 'same', kcal: 1500, p: 80, c: 180, f: 55, fib: 25 },
    plans: [], activePlans: { normal: null, veg: null, fasting: null },
    days: {}, myFoods: [], weights: [], favorites: []
  };
}
let S;
function load() {
  const d = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (raw) {
      S = Object.assign(d, raw);
      S.settings = Object.assign(defaults().settings, raw.settings || {});
      S.profile = Object.assign(defaults().profile, raw.profile || {});
      return;
    }
  } catch (e) { console.warn(e); }
  S = d;
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(S)); }
  catch (e) { toast('Storage full — export a backup and clear old data.'); }
}
window.S = null;

/* ---------------- Foods & nutrition ---------------- */
const STD = { g: 1, oz: 28.35, ml: 1, katori: 150, cup: 240, tbsp: 15, tsp: 5, scoop: 30, slice: 30, plate: 300, glass: 250, can: 355, piece: 50, serving: 150 };
const UNIT_LIST = ['g', 'oz', 'ml', 'piece', 'katori', 'cup', 'tbsp', 'tsp', 'scoop', 'slice', 'plate', 'glass', 'can', 'serving'];
function normUnit(u) {
  u = String(u || 'g').toLowerCase().trim().replace(/s$/, '');
  const map = { gram: 'g', gm: 'g', grams: 'g', bowl: 'katori', vati: 'katori', wati: 'katori', pc: 'piece', pcs: 'piece', whole: 'piece', roti: 'piece', chapati: 'piece', number: 'piece', nos: 'piece', tablespoon: 'tbsp', teaspoon: 'tsp', ounce: 'oz', milliliter: 'ml', glas: 'glass', portion: 'serving', unit: 'piece' };
  u = map[u] || u;
  return UNIT_LIST.includes(u) ? u : 'serving';
}
const allFoods = () => S.myFoods.concat(FOODS);
const foodById = id => id ? allFoods().find(f => f.id === id) : null;
function unitG(food, unit, fallback) {
  if (unit === 'g') return 1;
  if (unit === 'oz') return 28.35;
  if (food && food.u && food.u[unit]) return food.u[unit];
  if (unit === 'ml') return 1;
  if (fallback) return fallback;
  if (unit === 'piece' && food && food.u) { const k = Object.keys(food.u)[0]; if (k) return food.u[k]; }
  return STD[unit] || 100;
}
function canConvert(food) { return food && food.y > 0; }
function otherState(food) { return food.state === 'cooked' ? 'dry' : 'cooked'; }
function baseGrams(food, grams, state) {
  if (!canConvert(food) || !state || state === food.state) return grams;
  const fC = food.state === 'cooked', sC = state === 'cooked';
  if (fC && !sC) return grams * food.y;
  if (!fC && sC) return grams / food.y;
  return grams;
}
function nutrFor(food, grams, state) { return scaleN(food.n, baseGrams(food, grams, state) / 100); }
function unitOptions(food) {
  const s = new Set(['g', 'oz']);
  Object.keys((food && food.u) || {}).forEach(u => s.add(u));
  ['piece', 'katori', 'cup', 'tbsp', 'tsp', 'serving', 'ml'].forEach(u => s.add(u));
  return Array.from(s);
}
function defaultUnit(food) {
  const u = food.u || {};
  for (const k of ['piece', 'scoop', 'slice', 'katori', 'glass', 'cup', 'tbsp']) if (u[k]) return k;
  return 'g';
}
function searchFoods(q, limit = 25) {
  q = q.toLowerCase().trim();
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored = [];
  for (const f of allFoods()) {
    const name = f.name.toLowerCase(), al = (f.aliases || []).join(' ').toLowerCase();
    let s = 0;
    if (name === q) s += 10;
    if (name.startsWith(q)) s += 5;
    if (name.includes(q)) s += 3;
    if (al.split(' ').some(a => a.startsWith(q))) s += 2;
    if (words.every(w => name.includes(w) || al.includes(w))) s += 2;
    if (s) { if (f.id.startsWith('my:')) s += 1.5; scored.push([s, f]); }
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(x => x[1]);
}
function catalogText() {
  const line = f => `${f.id} | ${f.name} | ${(f.aliases || []).slice(0, 4).join(', ')} | ${f.state} | ${Object.entries(f.u || {}).map(([k, v]) => k + '=' + v).join(' ')}`;
  return allFoods().map(line).join('\n');
}
function ensureMyFood(food, name) {
  const nm = (name || food.name).trim();
  const ex = S.myFoods.find(f => f.name.toLowerCase() === nm.toLowerCase());
  if (ex) return ex.id;
  const f = { id: 'my:' + uid(), name: nm, aliases: [], state: food.state || 'cooked', y: food.y || 0, n: roundN(food.n), u: food.u || {}, src: food.src || 'ai', est: food.est !== false, created: Date.now() };
  S.myFoods.unshift(f);
  return f.id;
}

/* ---------------- Days, slots, plans, targets ---------------- */
const slotNames = () => S.settings.slots.map(s => s.name);
function guessSlot(date) {
  const sl = S.settings.slots;
  if (date && date !== today()) return sl.find(s => /lunch/i.test(s.name))?.name || sl[0].name;
  const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
  let pick = sl[0].name;
  sl.slice().sort((a, b) => a.h - b.h).forEach(s => { if (h >= s.h - 0.5) pick = s.name; });
  return pick;
}
function getDay(date, create) {
  if (!S.days[date] && create) S.days[date] = { entries: [] };
  return S.days[date] || { entries: [] };
}
function dayType(date) {
  const d = S.days[date];
  if (d && d.type) return d.type;
  return S.settings.weekdayTypes[parseYmd(date).getDay()] || 'normal';
}
function dayTotals(date) { return getDay(date).entries.reduce((a, e) => addN(a, e.n), zeroN()); }
function slotTotals(date, slot) { return getDay(date).entries.filter(e => e.slot === slot).reduce((a, e) => addN(a, e.n), zeroN()); }
function mapSlot(name) {
  const n = String(name || '').toLowerCase().trim();
  const exact = S.settings.slots.find(s => s.name.toLowerCase() === n);
  if (exact) return exact.name;
  const rules = [[/wak|empty stomach|early morning/, 'Upon waking'], [/break/, 'Breakfast'], [/mid.?morn|brunch/, 'Mid-morning'], [/lunch/, 'Lunch'], [/snack|evening|pre.?work|post.?work|tea time/, 'Snack'], [/dinner|supper/, 'Dinner'], [/bed|night/, 'Before bed']];
  for (const [re, s] of rules) if (re.test(n) && slotNames().includes(s)) return s;
  return null;
}
function ensureSlot(name) {
  const m = mapSlot(name);
  if (m) return m;
  const nm = String(name).trim().replace(/\b\w/g, c => c.toUpperCase());
  S.settings.slots.push({ name: nm, h: 23 });
  return nm;
}
function planFor(date) {
  const type = dayType(date), d = S.days[date];
  const id = (d && d.planId) || S.activePlans[type] || S.activePlans.normal;
  const plan = S.plans.find(p => p.id === id);
  if (!plan) return null;
  const vs = plan.versions.filter(v => v.start <= date).sort((a, b) => a.start < b.start ? 1 : -1);
  const version = vs[0];
  return version ? { plan, version } : null;
}
function planSlotItems(pv, slot) {
  if (!pv) return [];
  return pv.version.slots.filter(s => mapSlot(s.name) === slot).flatMap(s => s.items);
}
function planTotals(version) { return version.slots.reduce((a, s) => s.items.reduce((b, i) => addN(b, i.n), a), zeroN()); }
function calcRec(p) {
  if (!p.age || !p.heightCm || !p.weightKg) return null;
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'female' ? -161 : 5);
  const tdee = bmr * (+p.activity || 1.2);
  const delta = p.goal === 'lose' ? -p.rateKg * 7700 / 7 : p.goal === 'gain' ? p.rateKg * 7700 / 7 : 0;
  const kcal = Math.max(1200, tdee + delta);
  const pk = (+p.activity >= 1.55 ? 2.0 : 1.6) * p.weightKg;
  const f = kcal * 0.27 / 9;
  const c = Math.max(0, (kcal - pk * 4 - f * 9) / 4);
  return { bmr: r0(bmr), tdee: r0(tdee), kcal: r0(kcal), p: r0(pk), c: r0(c), f: r0(f), fib: r0(kcal / 1000 * 14) };
}
function targets(date) {
  const type = dayType(date);
  if (type === 'fasting' && S.fasting.mode === 'custom') return { ...pickN(S.fasting), src: 'Fasting-day targets' };
  if (S.goalSource === 'plan') { const pv = planFor(date); if (pv) return { ...roundN(planTotals(pv.version)), src: 'Diet plan · ' + pv.plan.name }; }
  if (S.goalSource !== 'custom') { const r = calcRec(S.profile); if (r) return { ...pickN(r), src: 'Recommended' }; }
  return { ...pickN(S.custom), src: 'Custom targets' };
}
const pickN = o => { const n = {}; KEYS.forEach(k => n[k] = +o[k] || 0); return n; };

/* ---------------- UI plumbing ---------------- */
const UI = { tab: 'today', date: today(), reportMode: 'week', reportOffset: 0, reportMetric: 'kcal' };
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms);
}
let sheetStack = [];
function openSheet(html, mount) {
  $('#sheet').innerHTML = html;
  $('#sheetWrap').hidden = false;
  document.body.style.overflow = 'hidden';
  if (mount) mount($('#sheet'));
}
function closeSheet() {
  $('#sheetWrap').hidden = true; $('#sheet').innerHTML = ''; document.body.style.overflow = '';
  if (REC.stream) stopRecording(true);
}
$('.sheet-bg').addEventListener('click', closeSheet);
function spinner(msg) { return `<div class="spin"></div><p class="muted small" style="text-align:center">${esc(msg || 'Working…')}</p>`; }
function aiError(e) {
  if (e && e.message === 'NO_KEY') {
    openSheet(`<h2>Add your Gemini key</h2><p>Voice, photos and AI estimates need a free Google Gemini key. Search and manual entry work without it.</p>
      <button class="btn primary block" id="goKey">Open Settings</button>`, s => $('#goKey', s).onclick = () => { closeSheet(); go('more'); });
    return;
  }
  toast(e && e.message ? e.message : 'Something went wrong.', 4000);
}
function render() {
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  $('#topActions').innerHTML = '';
  $('#fab').style.display = (UI.tab === 'today') ? '' : 'none';
  ({ today: renderToday, reports: renderReports, plan: renderPlan, goals: renderGoals, more: renderMore })[UI.tab]();
}
function go(tab) { UI.tab = tab; render(); window.scrollTo(0, 0); }
$$('.tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
$('#fab').onclick = () => openAdd(guessSlot(UI.date));

/* ---------------- Today ---------------- */
function ring(eaten, target) {
  const R = 50, C = 2 * Math.PI * R, pct = target ? Math.min(1, eaten / target) : 0;
  const over = target && eaten > target * 1.05;
  return `<div class="ring"><svg width="118" height="118" viewBox="0 0 118 118">
    <circle cx="59" cy="59" r="${R}" fill="none" stroke="var(--track)" stroke-width="11"/>
    <circle cx="59" cy="59" r="${R}" fill="none" stroke="${over ? 'var(--red)' : 'var(--kcal)'}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
    <div class="c"><div class="big num">${r0(eaten)}</div><div class="tiny muted">of ${r0(target)} kcal</div></div></div>`;
}
function bar(k, eaten, target, fasting) {
  const pct = target ? Math.min(100, eaten / target * 100) : 0;
  const diff = target - eaten, u = UNIT[k];
  let note = '';
  if (target) {
    if (diff >= 0) note = `<span class="${fasting ? 'muted' : 'left'}">${k === 'kcal' ? r0(diff) : r0(diff)} ${u} left</span>`;
    else note = `<span class="over">${r0(-diff)} ${u} over</span>`;
  }
  return `<div class="bar"><div class="lbl"><span><b>${LABEL[k]}</b> <span class="muted num">${r0(eaten)} / ${r0(target)} ${u}</span></span>${note}</div>
    <div class="track"><i style="width:${pct}%;background:var(--${k})"></i></div></div>`;
}
function renderToday() {
  const date = UI.date, isToday = date === today();
  $('#title').textContent = isToday ? 'Today' : fmtDate(date);
  const type = dayType(date), T = targets(date), E = dayTotals(date), pv = planFor(date);
  const rem = KEYS.reduce((o, k) => (o[k] = T[k] - E[k], o), {});
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const entriesCount = Object.values(S.days).reduce((a, d) => a + d.entries.length, 0);
  let html = `
  <div class="row between wrap" style="margin-top:4px;row-gap:8px">
    <div class="datebar">
      <button class="iconbtn" id="prevD" aria-label="Previous day">◀</button>
      <label class="d" style="position:relative">${fmtDate(date)}<input type="date" id="pickD" value="${date}" style="position:absolute;inset:0;opacity:0;width:100%"></label>
      <button class="iconbtn" id="nextD" aria-label="Next day">▶</button>
      ${isToday ? '' : '<button class="chip" id="toToday">Today</button>'}
    </div>
    <div class="daytype">${['normal', 'veg', 'fasting'].map(t => `<button class="chip ${type === t ? 'on' : ''}" data-dt="${t}">${t === 'normal' ? 'Normal' : t === 'veg' ? 'Veg' : 'Fast'}</button>`).join('')}</div>
  </div>`;
  if (!standalone && ios && !S.settings.hideInstall) html += `<div class="banner">Install on your iPhone: tap <b>Share</b> → <b>Add to Home Screen</b>. <a href="#" id="hideInst" class="small">Hide</a></div>`;
  if (!S.settings.apiKey) html += `<div class="banner">Add your free Gemini key in <a href="#" id="toKey">More → Settings</a> to use voice, photos and AI estimates.</div>`;
  if (entriesCount > 20 && Date.now() - (S.settings.lastBackup || 0) > 14 * 864e5) html += `<div class="banner">It's been a while since your last backup. <a href="#" id="doBackup">Back up now</a></div>`;
  html += `<div class="card">
    <div class="hero">${ring(E.kcal, T.kcal)}<div>${['p', 'c', 'f', 'fib'].map(k => bar(k, E[k], T[k], type === 'fasting')).join('')}</div></div>
    <div class="row between" style="margin-top:8px">
      <span class="tiny muted">${esc(T.src)}${type !== 'normal' ? ' · ' + (type === 'veg' ? 'Veg day' : 'Fasting day') : ''}</span>
      <span class="small ${rem.kcal >= 0 ? 'left' : 'over'}">${rem.kcal >= 0 ? r0(rem.kcal) + ' kcal left' : r0(-rem.kcal) + ' kcal over'}</span>
    </div>
    <button class="btn block" id="whatNow" style="margin-top:10px">What can I eat now?</button>
  </div>`;
  for (const slot of slotNames()) {
    const ents = getDay(date).entries.filter(e => e.slot === slot);
    const pitems = planSlotItems(pv, slot);
    const st = slotTotals(date, slot);
    const pt = pitems.reduce((a, i) => addN(a, i.n), zeroN());
    if (!ents.length && !pitems.length) {
      html += `<div class="card slot"><div class="slot-h"><h3 class="muted" style="font-weight:600">${esc(slot)}</h3><button class="btn sm ghost" data-add="${esc(slot)}">+ Add</button></div></div>`;
      continue;
    }
    html += `<div class="card slot"><div class="slot-h"><h3>${esc(slot)}</h3>
      <span class="small num"><b>${r0(st.kcal)}</b>${pitems.length ? ` <span class="muted">/ ${r0(pt.kcal)}</span>` : ''} kcal</span>
      <button class="btn sm ghost" data-add="${esc(slot)}">+ Add</button></div>`;
    if (pitems.length && ents.length) html += `<div class="mini" style="padding:0 14px 10px">${['p', 'c', 'f'].map(k => { const d = st[k] - pt[k]; return `<span>${k.toUpperCase()} <b>${r0(st[k])}</b>/${r0(pt[k])} <span class="${Math.abs(d) < 3 ? '' : d > 0 ? 'over' : 'left'}">${d > 0 ? '+' : ''}${r0(d)}</span></span>`; }).join('')}</div>`;
    if (ents.length) {
      html += `<div class="slot-b">` + ents.map(e => `<div class="entry" data-entry="${e.id}">
        <div class="grow"><div class="nm">${esc(e.name)} ${e.est ? '<span class="tag est">est</span>' : ''}</div>
        <div class="sub">${esc(qtyText(e))}${e.state && e.kind !== 'portion' ? ' · ' + e.state : ''} · P ${r1(e.n.p)} · C ${r1(e.n.c)} · F ${r1(e.n.f)}</div></div>
        <div class="kc">${r0(e.n.kcal)}</div></div>`).join('') + `</div>`;
    }
    if (pitems.length) {
      html += `<details class="planbox" ${ents.length ? '' : 'open'}><summary class="row between"><span><b>Planned</b> · ${r0(pt.kcal)} kcal · P ${r0(pt.p)}</span><span class="muted tiny">${ents.length ? 'show' : ''}</span></summary>
        ${pitems.map((it, i) => `<div class="pi"><span class="grow">${esc(it.name)} <span class="muted">${esc(it.qty || '')}</span></span><span class="muted num tiny">${r0(it.n.kcal)}</span><button class="btn sm ghost" data-swapplan="${esc(slot)}|${i}" title="Swap">⇄</button></div>`).join('')}
        <button class="btn sm primary" data-logplan="${esc(slot)}" style="margin-top:6px">Log as planned</button></details>`;
    }
    html += `</div>`;
  }
  $('#view').innerHTML = html;
  const v = $('#view');
  $('#prevD', v).onclick = () => { UI.date = addDays(UI.date, -1); render(); };
  $('#nextD', v).onclick = () => { UI.date = addDays(UI.date, 1); render(); };
  $('#pickD', v).onchange = e => { if (e.target.value) { UI.date = e.target.value; render(); } };
  if ($('#toToday', v)) $('#toToday', v).onclick = () => { UI.date = today(); render(); };
  $$('[data-dt]', v).forEach(b => b.onclick = () => { getDay(date, true).type = b.dataset.dt; save(); render(); toast(b.dataset.dt === 'fasting' ? 'Marked as fasting day' : b.dataset.dt === 'veg' ? 'Marked as veg day' : 'Normal day'); });
  if ($('#hideInst', v)) $('#hideInst', v).onclick = e => { e.preventDefault(); S.settings.hideInstall = true; save(); render(); };
  if ($('#toKey', v)) $('#toKey', v).onclick = e => { e.preventDefault(); go('more'); };
  if ($('#doBackup', v)) $('#doBackup', v).onclick = e => { e.preventDefault(); exportData(); };
  $('#whatNow', v).onclick = openWhatNow;
  $$('[data-add]', v).forEach(b => b.onclick = () => openAdd(b.dataset.add));
  $$('[data-entry]', v).forEach(el => el.onclick = () => openEntry(el.dataset.entry));
  $$('[data-logplan]', v).forEach(b => b.onclick = () => {
    const slot = b.dataset.logplan;
    startReview(slot, planSlotItems(planFor(date), slot).map(riFromPlan));
  });
  $$('[data-swapplan]', v).forEach(b => b.onclick = () => {
    const [slot, i] = b.dataset.swapplan.split('|');
    const it = planSlotItems(planFor(date), slot)[+i];
    openSwap({ name: it.name + (it.qty ? ' (' + it.qty + ')' : ''), n: it.n }, ri => startReview(slot, [ri]));
  });
}
function qtyText(e) {
  if (e.kind === 'portion') return (e.qty !== 1 ? e.qty + ' × ' : '') + (e.qtyText || '1 serving');
  const q = r1(e.qty);
  return e.unit === 'g' ? `${q} g` : `${q} ${e.unit}${q !== 1 && !['g', 'oz', 'ml'].includes(e.unit) ? 's' : ''} · ${r0(e.grams)} g`;
}

/* ---------------- Review items ---------------- */
// RI = review item: { key, on, kind:'food'|'portion', name, food, qty, unit, grams, state, est, unitFallback, portionN, qtyText }
function riN(ri) { return ri.kind === 'portion' ? scaleN(ri.portionN, ri.qty) : nutrFor(ri.food, ri.grams, ri.state); }
function riFromFood(food, qty, unit, state) {
  const pref = S.settings.statePref[food.id];
  unit = unit || defaultUnit(food);
  qty = qty ?? (unit === 'g' ? 100 : 1);
  return { key: uid(), on: true, kind: 'food', name: food.name, food, qty, unit, grams: qty * unitG(food, unit), state: state || pref || food.state, est: !!food.est };
}
function riFromPlan(it) { return { key: uid(), on: true, kind: 'portion', name: it.name, qty: 1, unit: 'serving', qtyText: it.qty || '1 serving', portionN: { ...it.n }, est: false, fromPlan: true }; }
function riFromAI(it, text) {
  const qty = +it.qty || 1, unit = normUnit(it.unit), aiG = +it.grams || 0;
  const stated = /\b(raw|cooked|uncooked|dry|boiled|grilled weight)\b/i.test(text || '');
  let state = ['raw', 'cooked', 'dry'].includes(it.state) ? it.state : null;
  const food = foodById(it.match_id);
  if (food) {
    if (!stated && S.settings.statePref[food.id]) state = S.settings.statePref[food.id];
    if (food.state === 'cooked' && state === 'raw') state = 'dry';
    const known = ['g', 'oz', 'ml'].includes(unit) || (food.u && food.u[unit]);
    const fb = aiG && qty ? aiG / qty : null;
    const grams = known ? qty * unitG(food, unit) : (aiG || qty * unitG(food, unit, fb));
    return { key: uid(), on: true, kind: 'food', name: it.name || food.name, food, qty, unit, grams, state: state || food.state, est: !!food.est, unitFallback: known ? null : fb, note: it.note };
  }
  const per = it.est_per100 || zeroN();
  const u = {}; if (!['g', 'oz', 'ml'].includes(unit) && aiG && qty) u[unit] = r1(aiG / qty);
  const f = { id: null, name: it.name, state: state || 'cooked', y: 0, n: pickN(per), u, est: true, src: 'ai' };
  return { key: uid(), on: true, kind: 'food', name: it.name, food: f, qty, unit, grams: aiG || qty * unitG(f, unit), state: f.state, est: true, note: it.note };
}
function riFromIdea(it) {
  const g = +it.grams || 100, n = pickN(it);
  const f = { id: null, name: it.name, state: it.state || 'cooked', y: 0, n: scaleN(n, 100 / g), u: {}, est: true, src: 'ai' };
  const unit = normUnit(it.unit), qty = +it.qty || 1;
  if (!['g', 'oz', 'ml'].includes(unit)) f.u[unit] = r1(g / qty);
  return { key: uid(), on: true, kind: 'food', name: it.name, food: f, qty, unit, grams: g, state: f.state, est: true };
}

/* Review session */
let R = null;
function startReview(slot, items, extra) {
  R = Object.assign({ slot: slot || guessSlot(UI.date), date: UI.date, items: [], questions: [], transcript: '' }, extra || {});
  R.items.push(...(items || []));
  renderReview();
}
function renderReview() {
  const tot = R.items.filter(i => i.on).reduce((a, i) => addN(a, riN(i)), zeroN());
  let html = `<div class="row between"><h2>Review</h2>
    <select id="rvSlot" style="width:auto">${slotNames().map(s => `<option ${s === R.slot ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>`;
  if (R.transcript) html += `<p class="small muted" style="margin:-4px 0 6px">“${esc(R.transcript)}”</p>`;
  if (R.questions && R.questions.length) html += `<div class="banner small">${R.questions.map(esc).join('<br>')}</div>`;
  if (!R.items.length) html += `<div class="empty">Nothing yet — add foods below.</div>`;
  html += R.items.map(ri => {
    const n = riN(ri);
    const states = ri.kind === 'food' ? (canConvert(ri.food) ? [ri.food.state, otherState(ri.food)] : [ri.state]) : [];
    return `<div class="ritem ${ri.on ? '' : 'off'}" data-k="${ri.key}">
      <div class="top"><input type="checkbox" data-on ${ri.on ? 'checked' : ''} style="width:20px;height:20px;margin-top:3px">
        <div class="grow"><input type="text" data-name value="${esc(ri.name)}" style="padding:4px 6px;font-weight:600;border-color:transparent;background:transparent">
        <div class="row wrap" style="gap:5px;margin-top:2px">
          ${ri.est ? '<span class="tag est">estimated</span>' : ''}
          ${states.map(s => `<button class="tag ${s}" data-state="${s}" style="border:${s === ri.state ? '1.5px solid currentColor' : '1.5px solid transparent'};${s === ri.state ? '' : 'opacity:.55'}">${s}</button>`).join('')}
          ${ri.note ? `<span class="tiny muted">${esc(ri.note)}</span>` : ''}
        </div></div>
        <button class="iconbtn" data-swap title="Swap">⇄</button><button class="iconbtn" data-del title="Remove">✕</button></div>
      <div class="ctl"><input type="number" inputmode="decimal" step="any" data-qty value="${r1(ri.qty)}">
        ${ri.kind === 'portion' ? `<span class="small muted">× ${esc(ri.qtyText)}</span>` : `<select data-unit>${unitOptions(ri.food).map(u => `<option ${u === ri.unit ? 'selected' : ''}>${u}</option>`).join('')}</select>`}
        <span class="small num right">${ri.kind === 'food' ? r0(ri.grams) + ' g' : ''}</span></div>
      <div class="mini" style="margin-top:6px"><span><b>${r0(n.kcal)}</b> kcal</span><span>P <b>${r1(n.p)}</b></span><span>C <b>${r1(n.c)}</b></span><span>F <b>${r1(n.f)}</b></span><span>Fib <b>${r1(n.fib)}</b></span></div>
    </div>`;
  }).join('');
  html += `<div class="card" style="margin:10px 0;padding:10px 12px"><div class="mini" style="font-size:13px"><span><b>${r0(tot.kcal)}</b> kcal</span><span>P <b>${r0(tot.p)}</b></span><span>C <b>${r0(tot.c)}</b></span><span>F <b>${r0(tot.f)}</b></span><span>Fib <b>${r0(tot.fib)}</b></span></div></div>
    <div class="grid2"><button class="btn" id="rvMore">+ Add more</button><button class="btn" id="rvFav">☆ Save as favorite</button></div>
    <button class="btn primary block" id="rvSave" style="margin-top:10px" ${R.items.some(i => i.on) ? '' : 'disabled'}>Save to ${esc(R.slot)}</button>`;
  openSheet(html, s => {
    $('#rvSlot', s).onchange = e => { R.slot = e.target.value; $('#rvSave', s).textContent = 'Save to ' + R.slot; };
    $$('.ritem', s).forEach(el => {
      const ri = R.items.find(i => i.key === el.dataset.k);
      $('[data-on]', el).onchange = e => { ri.on = e.target.checked; renderReview(); };
      $('[data-name]', el).onchange = e => { ri.name = e.target.value; };
      $('[data-del]', el).onclick = () => { R.items = R.items.filter(i => i !== ri); renderReview(); };
      $('[data-qty]', el).onchange = e => { ri.qty = num(e.target.value) || 0; if (ri.kind === 'food') ri.grams = ri.qty * unitG(ri.food, ri.unit, ri.unitFallback); renderReview(); };
      if ($('[data-unit]', el)) $('[data-unit]', el).onchange = e => {
        ri.unit = e.target.value;
        if (ri.unit === 'g') ri.qty = r1(ri.grams);
        else if (ri.unit === 'oz') ri.qty = r1(ri.grams / 28.35);
        else { ri.unitFallback = null; ri.qty = r1(ri.grams / unitG(ri.food, ri.unit)) || 1; }
        ri.grams = ri.qty * unitG(ri.food, ri.unit);
        renderReview();
      };
      $$('[data-state]', el).forEach(b => b.onclick = () => { ri.state = b.dataset.state; ri.stateTouched = true; renderReview(); });
      $('[data-swap]', el).onclick = () => openSwap({ name: ri.name, n: riN(ri) }, nri => { const i = R.items.indexOf(ri); R.items[i] = nri; renderReview(); }, renderReview);
    });
    $('#rvMore', s).onclick = () => openAdd(R.slot, true);
    $('#rvFav', s).onclick = () => {
      const name = prompt('Name this favorite (e.g. "My usual breakfast")', R.slot);
      if (!name) return;
      S.favorites.unshift({ id: uid(), name, items: R.items.filter(i => i.on).map(serializeRI) });
      save(); toast('Saved to favorites');
    };
    $('#rvSave', s).onclick = saveReview;
  });
}
function serializeRI(ri) {
  const o = { kind: ri.kind, name: ri.name, qty: ri.qty, unit: ri.unit, grams: ri.grams, state: ri.state, est: ri.est, qtyText: ri.qtyText, portionN: ri.portionN };
  if (ri.kind === 'food') { if (ri.food.id) o.foodId = ri.food.id; else o.food = ri.food; }
  return o;
}
function deserializeRI(o) {
  const ri = Object.assign({ key: uid(), on: true }, o);
  if (o.kind === 'food') { ri.food = foodById(o.foodId) || o.food; if (!ri.food) return null; }
  return ri;
}
function saveReview() {
  const d = getDay(R.date, true);
  for (const ri of R.items.filter(i => i.on)) {
    if (ri.kind === 'food' && !ri.food.id) { ri.food.id = ensureMyFood(ri.food, ri.name); ri.food = foodById(ri.food.id); }
    if (ri.kind === 'food' && ri.stateTouched && ri.food.id && canConvert(ri.food)) S.settings.statePref[ri.food.id] = ri.state;
    const e = { id: uid(), slot: R.slot, name: ri.name, kind: ri.kind, qty: ri.qty, unit: ri.unit, t: Date.now(), est: !!ri.est, n: roundN(riN(ri)) };
    if (ri.kind === 'food') Object.assign(e, { foodId: ri.food.id, grams: r1(ri.grams), state: ri.state });
    else Object.assign(e, { portionN: ri.portionN, qtyText: ri.qtyText, fromPlan: !!ri.fromPlan });
    if (R.editId) { const i = d.entries.findIndex(x => x.id === R.editId); if (i >= 0) { e.id = R.editId; e.t = d.entries[i].t; d.entries[i] = e; continue; } }
    d.entries.push(e);
  }
  save(); closeSheet(); R = null; UI.tab = 'today'; render(); toast('Logged');
}

/* Edit an existing entry */
function openEntry(id) {
  const e = getDay(UI.date).entries.find(x => x.id === id);
  if (!e) return;
  let ri;
  if (e.kind === 'portion') ri = { key: uid(), on: true, kind: 'portion', name: e.name, qty: e.qty, unit: 'serving', qtyText: e.qtyText, portionN: e.portionN, fromPlan: e.fromPlan };
  else {
    let food = foodById(e.foodId);
    if (!food) food = { id: null, name: e.name, state: e.state || 'cooked', y: 0, n: scaleN(e.n, 100 / (e.grams || 100)), u: {}, est: e.est };
    ri = { key: uid(), on: true, kind: 'food', name: e.name, food, qty: e.qty, unit: e.unit, grams: e.grams, state: e.state, est: e.est, unitFallback: e.unit && !['g', 'oz', 'ml'].includes(e.unit) && e.qty ? e.grams / e.qty : null };
  }
  R = { slot: e.slot, date: UI.date, items: [ri], editId: id, questions: [], transcript: '' };
  renderReview();
  const s = $('#sheet');
  $('#rvMore', s).outerHTML = `<button class="btn danger" id="rvDelete">Delete entry</button>`;
  $('#rvDelete', s).onclick = () => {
    const d = getDay(UI.date); d.entries = d.entries.filter(x => x.id !== id); save(); closeSheet(); render(); toast('Deleted');
  };
  $('#rvSave', s).textContent = 'Update';
}

/* ---------------- Add sheet ---------------- */
function recentItems() {
  const seen = new Map();
  const dates = Object.keys(S.days).sort().reverse().slice(0, 21);
  for (const dt of dates) for (const e of S.days[dt].entries.slice().reverse()) if (!seen.has(e.name.toLowerCase())) seen.set(e.name.toLowerCase(), e);
  return Array.from(seen.values()).slice(0, 14);
}
function riFromEntry(e) {
  if (e.kind === 'portion') return { key: uid(), on: true, kind: 'portion', name: e.name, qty: e.qty, unit: 'serving', qtyText: e.qtyText, portionN: e.portionN, fromPlan: e.fromPlan };
  const food = foodById(e.foodId);
  if (!food) return null;
  return { key: uid(), on: true, kind: 'food', name: e.name, food, qty: e.qty, unit: e.unit, grams: e.grams, state: e.state, est: !!food.est };
}
function openAdd(slot, appendToReview) {
  if (!appendToReview) R = null;
  const target = () => { if (!R) R = { slot, date: UI.date, items: [], questions: [], transcript: '' }; return R; };
  const rec = recentItems();
  const yest = getDay(addDays(UI.date, -1)).entries.filter(e => e.slot === slot);
  const html = `<div class="row between"><h2>Log food</h2><span class="chip">${esc(slot)}</span></div>
  <div class="addgrid">
    <button data-a="voice"><span class="ic">🎤</span>Speak</button>
    <button data-a="type"><span class="ic">⌨️</span>Describe</button>
    <button data-a="search"><span class="ic">🔍</span>Search</button>
    <button data-a="photo"><span class="ic">📷</span>Meal photo</button>
    <button data-a="label"><span class="ic">🏷️</span>Label</button>
    <button data-a="barcode"><span class="ic">▥</span>Barcode</button>
    <button data-a="menu"><span class="ic">🧾</span>Order / menu</button>
    <button data-a="dish"><span class="ic">🍲</span>New dish</button>
  </div>
  ${yest.length ? `<button class="btn block" id="yest" style="margin-bottom:10px">↺ Same as yesterday's ${esc(slot)} (${r0(yest.reduce((a, e) => a + e.n.kcal, 0))} kcal)</button>` : ''}
  ${S.favorites.length ? `<div class="small muted" style="margin:6px 0">Favorites</div><div class="row wrap">${S.favorites.slice(0, 10).map(f => `<button class="chip" data-fav="${f.id}">★ ${esc(f.name)}</button>`).join('')}</div>` : ''}
  ${rec.length ? `<div class="small muted" style="margin:12px 0 6px">Recent</div><div class="row wrap">${rec.map((e, i) => `<button class="chip" data-rec="${i}">${esc(e.name)} <span class="muted">${esc(e.kind === 'portion' ? '' : r1(e.qty) + ' ' + e.unit)}</span></button>`).join('')}</div>` : ''}
  ${appendToReview ? `<button class="btn block ghost" id="backRv" style="margin-top:12px">← Back to review</button>` : ''}`;
  openSheet(html, s => {
    const A = {
      voice: () => openVoice(target), type: () => openType(target), search: () => openSearch(target),
      photo: () => openPhoto('meal', target), label: () => scanLabel(target), barcode: () => scanBarcode(target),
      menu: () => openPhoto('menu', target), dish: () => openDish(target)
    };
    $$('[data-a]', s).forEach(b => b.onclick = () => A[b.dataset.a]());
    if ($('#yest', s)) $('#yest', s).onclick = () => { const r = target(); r.items.push(...yest.map(riFromEntry).filter(Boolean)); renderReview(); };
    $$('[data-fav]', s).forEach(b => b.onclick = () => { const f = S.favorites.find(x => x.id === b.dataset.fav); const r = target(); r.items.push(...f.items.map(deserializeRI).filter(Boolean)); renderReview(); });
    $$('[data-rec]', s).forEach(b => b.onclick = () => { const ri = riFromEntry(rec[+b.dataset.rec]); if (!ri) return toast('That food was deleted'); target().items.push(ri); renderReview(); });
    if ($('#backRv', s)) $('#backRv', s).onclick = renderReview;
  });
}
function aiCtx() {
  return { slots: slotNames(), time: new Date().toLocaleString(), dayType: dayType(UI.date), catalog: catalogText(), myNames: S.myFoods.slice(0, 60).map(f => f.name).join(', ') };
}
function handleParsed(res, target, text) {
  const r = target();
  if (res.day_type && ['normal', 'veg', 'fasting'].includes(res.day_type)) { getDay(r.date, true).type = res.day_type; save(); toast('Marked as ' + res.day_type + ' day'); }
  if (res.slot && slotNames().includes(res.slot)) r.slot = res.slot;
  if (res.copy && res.copy.days_ago) {
    const src = getDay(addDays(r.date, -res.copy.days_ago)).entries.filter(e => !res.copy.slot || e.slot === res.copy.slot);
    r.items.push(...src.map(riFromEntry).filter(Boolean));
  }
  (res.items || []).forEach(it => r.items.push(riFromAI(it, text || res.transcript)));
  r.questions = res.questions || [];
  r.transcript = res.transcript || '';
  if (!r.items.length && !res.day_type) { toast('No foods found in that — try again.'); }
  if (!r.items.length && res.day_type) { closeSheet(); render(); return; }
  renderReview();
}

/* Voice */
const REC = { stream: null, rec: null, chunks: [], timer: null, t0: 0 };
function openVoice(target) {
  openSheet(`<h2>Speak</h2><p class="small muted">Say what you ate, like “2 multigrain dosa with a katori of sambar for breakfast” or “150 g grilled chicken, raw weight”. You can also say “today is my fasting day”.</p>
    <button class="mic" id="mic" aria-label="Record"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
    <p id="micState" class="small" style="text-align:center">Tap to start</p>
    <details style="margin-top:10px"><summary class="small muted">Prefer the keyboard mic?</summary><p class="small muted">Use “Describe” and tap the 🎤 on your iPhone keyboard.</p></details>`, s => {
    $('#mic', s).onclick = async () => {
      if (REC.rec && REC.rec.state === 'recording') { stopRecording(); return; }
      if (!S.settings.apiKey) return aiError(new Error('NO_KEY'));
      try {
        REC.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) { toast('Microphone permission was denied. Allow it in iPhone Settings → Safari → Microphone.', 5000); return; }
      REC.chunks = [];
      REC.rec = new MediaRecorder(REC.stream);
      REC.rec.ondataavailable = e => e.data.size && REC.chunks.push(e.data);
      REC.rec.onstop = async () => {
        clearInterval(REC.timer);
        REC.stream && REC.stream.getTracks().forEach(t => t.stop()); REC.stream = null;
        if (REC.cancel) { REC.cancel = false; return; }
        const blob = new Blob(REC.chunks, { type: REC.rec.mimeType || 'audio/mp4' });
        $('#sheet').innerHTML = spinner('Listening & working out the nutrition…');
        try {
          const { b64, mime } = await audioToB64(blob);
          const res = await AI.parseAudio(b64, mime, aiCtx());
          handleParsed(res, target, res.transcript);
        } catch (e) { aiError(e); openVoice(target); }
      };
      REC.rec.start(); REC.t0 = Date.now();
      $('#mic', s).classList.add('rec');
      REC.timer = setInterval(() => { const sec = Math.round((Date.now() - REC.t0) / 1000); const el = $('#micState'); if (el) el.textContent = `Recording… ${sec}s — tap to finish`; if (sec >= 90) stopRecording(); }, 300);
    };
  });
}
function stopRecording(cancel) {
  if (cancel) REC.cancel = true;
  try { if (REC.rec && REC.rec.state === 'recording') REC.rec.stop(); else { REC.stream && REC.stream.getTracks().forEach(t => t.stop()); REC.stream = null; } } catch (e) {}
}
async function audioToB64(blob) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    const buf = await blob.arrayBuffer();
    const audio = await new Promise((res, rej) => ac.decodeAudioData(buf, res, rej));
    try { ac.close(); } catch (e) {}
    const rate = 16000, len = Math.max(1, Math.ceil(audio.duration * rate));
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new OAC(1, len, rate);
    const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start(0);
    const out = await off.startRendering();
    const data = out.getChannelData(0);
    const wav = new DataView(new ArrayBuffer(44 + data.length * 2));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); wav.setUint32(4, 36 + data.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true); wav.setUint32(24, rate, true);
    wav.setUint32(28, rate * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true); w(36, 'data'); wav.setUint32(40, data.length * 2, true);
    for (let i = 0; i < data.length; i++) { const v = Math.max(-1, Math.min(1, data[i])); wav.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
    return { b64: bufToB64(wav.buffer), mime: 'audio/wav' };
  } catch (e) {
    console.warn('WAV conversion failed, sending original', e);
    return { b64: bufToB64(await blob.arrayBuffer()), mime: (blob.type || 'audio/mp4').split(';')[0] };
  }
}
function bufToB64(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

/* Type / describe */
function openType(target) {
  openSheet(`<h2>Describe what you ate</h2>
    <textarea id="txt" placeholder="e.g. 2 rotis, 1 katori guvar sabzi made with ghee, 150 g grilled chicken (raw weight), 8 almonds"></textarea>
    <p class="tiny muted">Tip: tap 🎤 on the keyboard to dictate. Say “cooked” or “raw” when it matters.</p>
    <button class="btn primary block" id="go">Understand</button>`, s => {
    $('#txt', s).focus();
    $('#go', s).onclick = async () => {
      const text = $('#txt', s).value.trim(); if (!text) return;
      $('#sheet').innerHTML = spinner('Working out the nutrition…');
      try { handleParsed(await AI.parseMeal(text, aiCtx()), target, text); }
      catch (e) { aiError(e); openType(target); }
    };
  });
}

/* Search */
function openSearch(target, onPickFood, title) {
  openSheet(`<h2>${esc(title || 'Search foods')}</h2>
    <input type="search" id="q" placeholder="Search (roti, dal, paneer, almonds…)" autocomplete="off">
    <div class="results" id="res"></div>
    ${onPickFood ? '' : '<button class="btn block ghost" id="newF" style="margin-top:8px">+ Create a food manually</button>'}`, s => {
    const q = $('#q', s), res = $('#res', s);
    const show = () => {
      const v = q.value.trim();
      const list = searchFoods(v);
      res.innerHTML = list.map(f => `<div class="res" data-id="${f.id}"><div class="grow"><div class="nm">${esc(f.name)} ${f.id.startsWith('my:') ? '<span class="tag">mine</span>' : ''} ${f.est ? '<span class="tag est">est</span>' : ''}</div>
        <div class="tiny muted">${r0(f.n.kcal)} kcal · P ${r1(f.n.p)} per 100 g ${f.state}${f.u.piece ? ` · 1 piece ≈ ${f.u.piece} g` : f.u.katori ? ` · 1 katori ≈ ${f.u.katori} g` : ''}</div></div><span class="muted">›</span></div>`).join('')
        + (v.length > 1 ? `<div class="res" id="askAI"><div class="grow"><div class="nm">Ask AI about “${esc(v)}”</div><div class="tiny muted">Looks it up (web search) and saves it to My Foods</div></div><span>✨</span></div>` : '');
      $$('[data-id]', res).forEach(el => el.onclick = () => {
        const f = foodById(el.dataset.id);
        if (onPickFood) return onPickFood(f);
        target().items.push(riFromFood(f)); renderReview();
      });
      if ($('#askAI', res)) $('#askAI', res).onclick = async () => {
        res.innerHTML = spinner('Looking up “' + v + '”…');
        try {
          const j = await AI.lookup(v);
          const unit = normUnit(j.unit);
          const f = { id: null, name: j.name || v, state: j.state || 'cooked', y: 0, n: pickN(j.per100 || {}), u: unit !== 'g' && j.unit_g ? { [unit]: +j.unit_g } : {}, est: true, src: 'ai' };
          f.id = ensureMyFood(f); save();
          const food = foodById(f.id);
          if (onPickFood) return onPickFood(food);
          target().items.push(riFromFood(food)); renderReview();
        } catch (e) { aiError(e); show(); }
      };
    };
    q.oninput = show; q.focus();
    if ($('#newF', s)) $('#newF', s).onclick = () => openFoodEditor({ name: q.value }, f => { target().items.push(riFromFood(f)); renderReview(); });
  });
}

/* Photos */
function pickImage() {
  return new Promise(res => {
    const inp = $('#fileInput'); inp.value = ''; inp.accept = 'image/*'; inp.removeAttribute('capture');
    inp.onchange = () => res(inp.files[0] || null); inp.click();
  });
}
function loadImage(file) {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); });
}
async function imageToCanvas(file, max = 1400) {
  const img = await loadImage(file);
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}
const canvasB64 = c => c.toDataURL('image/jpeg', 0.85).split(',')[1];
function openPhoto(kind, target) {
  const meal = kind === 'meal';
  openSheet(`<h2>${meal ? 'Meal photo' : 'Order / menu'}</h2>
    <p class="small muted">${meal ? 'Take a photo of your plate. Add a note if it helps (e.g. “paneer is Sach brand, cooked in 1 tsp ghee”).' : 'Take a photo or screenshot of the receipt, delivery order or menu. If it’s a menu, write what you ordered.'}</p>
    <input type="text" id="note" placeholder="${meal ? 'Optional note' : 'What did you order? (optional)'}">
    <button class="btn primary block" id="pick" style="margin-top:10px">Choose / take photo</button>`, s => {
    $('#pick', s).onclick = async () => {
      if (!S.settings.apiKey) return aiError(new Error('NO_KEY'));
      const note = $('#note', s).value;
      const file = await pickImage(); if (!file) return;
      $('#sheet').innerHTML = spinner(meal ? 'Looking at your plate…' : 'Reading your order…');
      try {
        const b64 = canvasB64(await imageToCanvas(file));
        const res = meal ? await AI.mealPhoto(b64, aiCtx(), note) : await AI.menuPhoto(b64, aiCtx(), note);
        handleParsed(res, target, note);
      } catch (e) { aiError(e); openPhoto(kind, target); }
    };
  });
}
async function scanLabel(target) {
  openSheet(`<h2>Nutrition label</h2><p class="small muted">Photograph the Nutrition Facts panel (and the front if you can). The product gets saved to My Foods so you only scan it once.</p>
    <button class="btn primary block" id="pick">Choose / take photo</button>`, s => {
    $('#pick', s).onclick = async () => {
      if (!S.settings.apiKey) return aiError(new Error('NO_KEY'));
      const file = await pickImage(); if (!file) return;
      $('#sheet').innerHTML = spinner('Reading the label…');
      try {
        const j = await AI.label(canvasB64(await imageToCanvas(file, 1800)));
        const sg = +j.serving_g || 0;
        let per = j.per100 && +j.per100.kcal ? pickN(j.per100) : (sg ? scaleN(pickN(j.per_serving || {}), 100 / sg) : pickN(j.per_serving || {}));
        const u = {}; if (sg) u.serving = sg;
        openFoodEditor({ name: [j.brand, j.name].filter(Boolean).join(' ').trim() || 'Packaged food', state: j.state || 'raw', n: roundN(per), u, src: 'label', est: false, note: j.serving_desc ? 'Serving: ' + j.serving_desc : '' },
          f => { target().items.push(riFromFood(f, 1, f.u.serving ? 'serving' : 'g')); renderReview(); });
      } catch (e) { aiError(e); scanLabel(target); }
    };
  });
}
function loadScript(src) {
  return new Promise((res, rej) => { if ($(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
function decodeBarcode(canvas) {
  try {
    const Z = window.ZXing, hints = new Map();
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128]);
    const reader = new Z.MultiFormatReader(); reader.setHints(hints);
    const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
    return reader.decode(bmp).getText();
  } catch (e) { return null; }
}
async function scanBarcode(target) {
  openSheet(`<h2>Barcode</h2><p class="small muted">Take a close, sharp photo of the barcode. Products are looked up in Open Food Facts (free).</p>
    <button class="btn primary block" id="pick">Choose / take photo</button>
    <div class="row" style="margin-top:10px"><input type="text" id="code" inputmode="numeric" placeholder="…or type the number"><button class="btn" id="look">Look up</button></div>`, s => {
    const lookup = async code => {
      code = String(code).replace(/\D/g, '');
      if (!code) return toast('No barcode number found.');
      const mine = S.myFoods.find(f => f.barcode === code);
      if (mine) { target().items.push(riFromFood(mine)); return renderReview(); }
      $('#sheet').innerHTML = spinner('Looking up ' + code + '…');
      try {
        const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments,serving_quantity,serving_size`);
        const j = await r.json();
        if (j.status !== 1 || !j.product) throw new Error('nf');
        const p = j.product, n = p.nutriments || {};
        const per = { kcal: +n['energy-kcal_100g'] || (+n['energy_100g'] || 0) / 4.184, p: +n.proteins_100g || 0, c: +n.carbohydrates_100g || 0, f: +n.fat_100g || 0, fib: +n.fiber_100g || 0 };
        const u = {}; if (+p.serving_quantity) u.serving = +p.serving_quantity;
        openFoodEditor({ name: [p.brands && p.brands.split(',')[0], p.product_name].filter(Boolean).join(' ') || 'Product ' + code, state: 'raw', n: roundN(per), u, barcode: code, src: 'barcode', est: false, note: p.serving_size ? 'Serving: ' + p.serving_size : '' },
          f => { target().items.push(riFromFood(f, 1, f.u.serving ? 'serving' : 'g')); renderReview(); });
      } catch (e) {
        openSheet(`<h2>Not found</h2><p>Barcode ${esc(code)} isn't in Open Food Facts. Photograph the nutrition label instead — it'll be saved with this barcode.</p><button class="btn primary block" id="lbl">Scan label</button>`, s2 => $('#lbl', s2).onclick = () => scanLabel(target));
      }
    };
    $('#look', s).onclick = () => lookup($('#code', s).value);
    $('#pick', s).onclick = async () => {
      const file = await pickImage(); if (!file) return;
      $('#sheet').innerHTML = spinner('Reading barcode…');
      let code = null;
      try { await loadScript('vendor/zxing.min.js'); const c = await imageToCanvas(file, 1600); code = decodeBarcode(c); if (!code && S.settings.apiKey) code = (await AI.barcodeDigits(canvasB64(c))).code; } catch (e) { console.warn(e); }
      if (!code) { toast('Couldn’t read the barcode — try a closer photo or type the number.', 4000); return scanBarcode(target); }
      lookup(code);
    };
  });
}

/* New dish (recipe) */
function openDish(target, food) {
  openSheet(`<h2>Save a home dish</h2>
    <p class="small muted">Describe how you make it once; next time just say its name. Include amounts, oil/ghee, and roughly how much it makes.</p>
    <textarea id="txt" placeholder="e.g. Multigrain dosa: batter of 100 g rice, 50 g urad, 30 g moong, 30 g chana dal, 20 g toor dal, fermented. Makes 8 dosas, ½ tsp ghee each.

or: Guvar paneer — 300 g frozen guvar, 200 g Sach paneer, 1 tbsp ghee, spices. Makes about 3 katoris."></textarea>
    <button class="btn primary block" id="go" style="margin-top:8px">Work it out</button>`, s => {
    $('#go', s).onclick = async () => {
      const text = $('#txt', s).value.trim(); if (!text) return;
      $('#sheet').innerHTML = spinner('Calculating your recipe…');
      try { showDish(await AI.dish(text, aiCtx()), target); } catch (e) { aiError(e); openDish(target); }
    };
  });
}
function showDish(j, target) {
  const ings = j.ingredients || [];
  const tot = ings.reduce((a, i) => addN(a, i), zeroN());
  let total = +j.total_cooked_g || ings.reduce((a, i) => a + (+i.grams || 0), 0) || 100;
  let unit = normUnit(j.unit || 'katori'); if (unit === 'g') unit = 'serving';
  let unitGr = +j.unit_g || (j.servings ? total / j.servings : 150);
  const draw = () => {
    const per = scaleN(tot, 100 / total), pu = scaleN(per, unitGr / 100);
    openSheet(`<h2>${esc(j.name || 'Dish')}</h2>
      <table class="t"><tr><th>Ingredient</th><th>g</th><th>kcal</th><th>P</th><th>C</th><th>F</th></tr>
      ${ings.map(i => `<tr><td>${esc(i.name)}</td><td>${r0(i.grams)}</td><td>${r0(i.kcal)}</td><td>${r1(i.p)}</td><td>${r1(i.c)}</td><td>${r1(i.f)}</td></tr>`).join('')}
      <tr><th>Total</th><th></th><th>${r0(tot.kcal)}</th><th>${r0(tot.p)}</th><th>${r0(tot.c)}</th><th>${r0(tot.f)}</th></tr></table>
      ${j.notes ? `<p class="tiny muted">${esc(j.notes)}</p>` : ''}
      <label class="f">Name</label><input type="text" id="nm" value="${esc(j.name || '')}">
      <div class="grid2"><div><label class="f">Finished dish weight (g)</label><input type="number" inputmode="decimal" id="tw" value="${r0(total)}"></div>
      <div><label class="f">1 ${esc(unit)} = (g)</label><input type="number" inputmode="decimal" id="ug" value="${r0(unitGr)}"></div></div>
      <div class="swapres"><b>Per ${esc(unit)}:</b> ${r0(pu.kcal)} kcal · P ${r1(pu.p)} · C ${r1(pu.c)} · F ${r1(pu.f)} · Fib ${r1(pu.fib)}</div>
      <div class="grid2"><button class="btn" id="sv">Save dish</button><button class="btn primary" id="svlog">Save & log 1 ${esc(unit)}</button></div>`, s => {
      $('#tw', s).onchange = e => { total = num(e.target.value) || total; draw(); };
      $('#ug', s).onchange = e => { unitGr = num(e.target.value) || unitGr; draw(); };
      const doSave = () => {
        const name = $('#nm', s).value.trim() || j.name || 'My dish';
        const ex = S.myFoods.find(f => f.name.toLowerCase() === name.toLowerCase());
        const f = { id: ex ? ex.id : 'my:' + uid(), name, aliases: j.aliases || [], state: 'cooked', y: 0, n: roundN(scaleN(tot, 100 / total)), u: { [unit]: r1(unitGr) }, src: 'recipe', est: false, recipe: { ingredients: ings, total }, created: Date.now() };
        if (ex) Object.assign(ex, f); else S.myFoods.unshift(f);
        save(); return foodById(f.id);
      };
      $('#sv', s).onclick = () => { doSave(); toast('Saved to My Foods'); closeSheet(); };
      $('#svlog', s).onclick = () => { const f = doSave(); target().items.push(riFromFood(f, 1, unit)); renderReview(); };
    });
  };
  draw();
}

/* ---------------- Food editor ---------------- */
function openFoodEditor(init, onSaved) {
  const f = Object.assign({ name: '', aliases: [], state: 'cooked', y: 0, n: zeroN(), u: {}, est: false }, init || {});
  const units = Object.entries(f.u || {});
  openSheet(`<h2>${f.id ? 'Edit food' : 'Save food'}</h2>
    ${f.note ? `<p class="small muted">${esc(f.note)}</p>` : ''}
    <label class="f">Name</label><input type="text" id="nm" value="${esc(f.name)}">
    <label class="f">Also called (comma separated)</label><input type="text" id="al" value="${esc((f.aliases || []).join(', '))}">
    <div class="grid2"><div><label class="f">Values are for</label><select id="st">${['raw', 'cooked', 'dry'].map(s => `<option ${s === f.state ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div><label class="f">Cooked ÷ raw weight</label><input type="number" inputmode="decimal" step="any" id="y" value="${f.y || ''}" placeholder="e.g. 0.75 chicken, 3 rice"></div></div>
    <div class="row between" style="margin-top:12px"><b>Nutrition</b><div class="seg" style="width:auto"><button class="on" data-basis="100">per 100 g</button><button data-basis="serv">per serving</button></div></div>
    <div id="servRow" hidden><label class="f">Serving size (g)</label><input type="number" inputmode="decimal" id="sg" value="${f.u.serving || ''}"></div>
    <div class="grid5" style="margin-top:8px">${KEYS.map(k => `<div><label class="f">${k === 'kcal' ? 'kcal' : k === 'fib' ? 'Fiber' : LABEL[k]}</label><input type="number" inputmode="decimal" step="any" data-n="${k}" value="${r1(f.n[k])}"></div>`).join('')}</div>
    <label class="f">Unit weights (g)</label>
    <div id="units">${(units.length ? units : [['piece', '']]).map(([u, g]) => unitRow(u, g)).join('')}</div>
    <button class="btn sm ghost" id="addU">+ unit</button>
    <label class="row small" style="margin-top:10px"><input type="checkbox" id="est" ${f.est ? 'checked' : ''} style="width:18px;height:18px"> Estimated (not yet confirmed)</label>
    <div class="grid2" style="margin-top:12px">${f.id && f.id.startsWith('my:') ? '<button class="btn danger" id="del">Delete</button>' : '<button class="btn" id="cancel">Cancel</button>'}<button class="btn primary" id="sv">Save</button></div>`, s => {
    let basis = '100';
    $$('[data-basis]', s).forEach(b => b.onclick = () => { basis = b.dataset.basis; $$('[data-basis]', s).forEach(x => x.classList.toggle('on', x === b)); $('#servRow', s).hidden = basis !== 'serv'; });
    $('#addU', s).onclick = () => $('#units', s).insertAdjacentHTML('beforeend', unitRow('katori', ''));
    if ($('#cancel', s)) $('#cancel', s).onclick = closeSheet;
    if ($('#del', s)) $('#del', s).onclick = () => { if (!confirm('Delete ' + f.name + '? Past logs keep their numbers.')) return; S.myFoods = S.myFoods.filter(x => x.id !== f.id); save(); closeSheet(); render(); };
    $('#sv', s).onclick = () => {
      const n = {}; KEYS.forEach(k => n[k] = num($(`[data-n="${k}"]`, s).value));
      const u = {};
      $$('.urow', s).forEach(r => { const name = $('select', r).value, g = num($('input', r).value); if (g > 0) u[name] = g; });
      const sg = num($('#sg', s).value);
      if (basis === 'serv') { if (!sg) return toast('Enter the serving size in grams'); Object.assign(n, scaleN(n, 100 / sg)); u.serving = sg; }
      const out = {
        id: f.id && f.id.startsWith('my:') ? f.id : 'my:' + uid(), name: $('#nm', s).value.trim() || 'Food',
        aliases: $('#al', s).value.split(',').map(x => x.trim()).filter(Boolean), state: $('#st', s).value, y: num($('#y', s).value),
        n: roundN(n), u, est: $('#est', s).checked, src: f.src || 'manual', barcode: f.barcode, recipe: f.recipe, created: f.created || Date.now()
      };
      const i = S.myFoods.findIndex(x => x.id === out.id);
      if (i >= 0) S.myFoods[i] = out; else S.myFoods.unshift(out);
      save(); toast('Saved');
      if (onSaved) onSaved(foodById(out.id)); else { closeSheet(); render(); }
    };
  });
}
function unitRow(u, g) {
  return `<div class="row urow" style="margin:4px 0"><select style="width:45%">${UNIT_LIST.filter(x => !['g', 'oz'].includes(x)).map(x => `<option ${x === u ? 'selected' : ''}>${x}</option>`).join('')}</select><input type="number" inputmode="decimal" step="any" value="${g}" placeholder="grams"><button class="iconbtn" onclick="this.parentNode.remove()">✕</button></div>`;
}

/* ---------------- Swap & "what can I eat now" ---------------- */
function portionText(food, grams) {
  const u = food.u || {};
  for (const k of ['piece', 'katori', 'scoop', 'slice', 'cup', 'glass', 'tbsp', 'serving']) if (u[k]) { const q = Math.round(grams / u[k] * 2) / 2; if (q >= 0.5) return `${q} ${k}${q !== 1 ? 's' : ''}`; }
  return '';
}
function openSwap(orig, onPick, onBack) {
  const mode = S.settings.matchBy || 'kcal';
  openSearch(null, food => showSwap(orig, food, onPick, onBack), 'Swap “' + orig.name + '”');
  const s = $('#sheet');
  s.insertAdjacentHTML('afterbegin', `<div class="swapres small" style="margin-top:0">Replacing <b>${esc(orig.name)}</b>: ${r0(orig.n.kcal)} kcal · P ${r1(orig.n.p)} · C ${r1(orig.n.c)} · F ${r1(orig.n.f)}</div>
    <div class="seg" style="margin-bottom:8px"><button data-m="kcal" class="${mode === 'kcal' ? 'on' : ''}">Match calories</button><button data-m="p" class="${mode === 'p' ? 'on' : ''}">Match protein</button></div>`);
  $$('[data-m]', s).forEach(b => b.onclick = () => { S.settings.matchBy = b.dataset.m; save(); $$('[data-m]', s).forEach(x => x.classList.toggle('on', x === b)); });
}
function showSwap(orig, food, onPick, onBack) {
  const by = S.settings.matchBy || 'kcal';
  const draw = (state) => {
    const per1 = nutrFor(food, 1, state);
    const key = by === 'p' && per1.p > 0.005 ? 'p' : 'kcal';
    let grams = per1[key] > 0 ? orig.n[key] / per1[key] : 100;
    grams = Math.round(grams / 5) * 5 || 5;
    const n = nutrFor(food, grams, state);
    const d = k => { const x = n[k] - orig.n[k]; return `<span class="${Math.abs(x) < (k === 'kcal' ? 25 : 3) ? '' : x > 0 ? 'over' : 'left'}">${x > 0 ? '+' : ''}${k === 'kcal' ? r0(x) : r1(x)}</span>`; };
    const pt = portionText(food, grams);
    const states = canConvert(food) ? [food.state, otherState(food)] : [];
    openSheet(`<h2>Swap</h2>
      <div class="swapres"><div class="small muted">Instead of ${esc(orig.name)}, have</div>
        <div style="font-size:22px;font-weight:750;margin:4px 0">${grams} g ${esc(food.name)}${state !== food.state || states.length ? ` <span class="small">(${state})</span>` : ''}</div>
        ${pt ? `<div class="small">≈ ${pt}</div>` : ''}
        <table class="t" style="margin-top:8px"><tr><th></th><th>kcal</th><th>P</th><th>C</th><th>F</th><th>Fib</th></tr>
        <tr><td>Swap</td>${KEYS.map(k => `<td>${k === 'kcal' ? r0(n[k]) : r1(n[k])}</td>`).join('')}</tr>
        <tr><td>Diff</td>${KEYS.map(k => `<td>${d(k)}</td>`).join('')}</tr></table>
        ${key === 'kcal' && orig.n.p - n.p > 8 ? `<p class="small over" style="margin:8px 0 0">You'll be ${r0(orig.n.p - n.p)} g short on protein — add curd, paneer, whey or eggs to make it up.</p>` : ''}
      </div>
      ${states.length ? `<div class="row" style="gap:6px;margin-bottom:8px"><span class="small muted">I'll weigh it</span>${states.map(x => `<button class="chip ${x === state ? 'on' : ''}" data-st="${x}">${x}</button>`).join('')}</div>` : ''}
      <div class="grid2"><button class="btn" id="back">Pick another</button><button class="btn primary" id="use">Use this</button></div>`, s => {
      $$('[data-st]', s).forEach(b => b.onclick = () => draw(b.dataset.st));
      $('#back', s).onclick = () => openSwap(orig, onPick, onBack);
      $('#use', s).onclick = () => onPick(riFromFood(food, grams, 'g', state));
    });
  };
  draw(S.settings.statePref[food.id] || food.state);
}
function openWhatNow() {
  const date = UI.date, T = targets(date), E = dayTotals(date);
  const rem = {}; KEYS.forEach(k => rem[k] = Math.max(0, T[k] - E[k]));
  const slot = guessSlot(date);
  const head = `<h2>What can I eat now?</h2>
    <div class="swapres small">Left today: <b>${r0(rem.kcal)} kcal</b> · P <b>${r0(rem.p)}</b> · C <b>${r0(rem.c)}</b> · F <b>${r0(rem.f)}</b> · Fib <b>${r0(rem.fib)}</b>${dayType(date) !== 'normal' ? ` · <i>${dayType(date)} day</i>` : ''}</div>`;
  openSheet(head + `<div class="grid2"><button class="btn" id="pickF">Pick a food</button><button class="btn primary" id="ideas">✨ Ideas</button></div><div id="out"></div>`, s => {
    $('#pickF', s).onclick = () => openSearch(null, food => {
      const p1 = nutrFor(food, 1, food.state);
      const gk = p1.kcal > 0 ? rem.kcal / p1.kcal : 0, gp = p1.p > 0.01 ? rem.p / p1.p : 0;
      const opts = [];
      if (gk > 0) opts.push({ t: 'Fill remaining calories', g: Math.round(gk / 5) * 5 });
      if (gp > 0 && gp < gk) opts.push({ t: 'Hit remaining protein', g: Math.round(gp / 5) * 5 });
      openSheet(head + `<h3>${esc(food.name)}</h3>` + (opts.length ? opts.map((o, i) => { const n = nutrFor(food, o.g, food.state); const pt = portionText(food, o.g); return `<div class="ritem"><div class="small muted">${o.t}</div><div style="font-weight:700;font-size:18px">${o.g} g ${pt ? '≈ ' + pt : ''}</div>
        <div class="mini">${r0(n.kcal)} kcal · P ${r1(n.p)} · C ${r1(n.c)} · F ${r1(n.f)}</div><button class="btn sm primary" data-i="${i}" style="margin-top:6px">Log this</button></div>`; }).join('') : '<p class="empty">You have no calories left today.</p>')
        + `<button class="btn block ghost" id="again">Pick another food</button>`, s2 => {
        $$('[data-i]', s2).forEach(b => b.onclick = () => startReview(slot, [riFromFood(food, opts[+b.dataset.i].g, 'g')]));
        $('#again', s2).onclick = openWhatNow;
      });
    }, 'Pick a food');
    $('#ideas', s).onclick = async () => {
      $('#out', s).innerHTML = spinner('Thinking of options…');
      try {
        const pv = planFor(date);
        const pl = planSlotItems(pv, slot).map(i => i.name + ' ' + (i.qty || '')).join(', ');
        const j = await AI.ideas(aiCtx(), roundN(rem), slot, pl, dayType(date));
        const ideas = j.ideas || [];
        $('#out', s).innerHTML = ideas.map((idea, i) => { const n = idea.items.reduce((a, x) => addN(a, x), zeroN()); return `<div class="ritem"><b>${esc(idea.title)}</b><div class="small muted">${esc(idea.why || '')}</div>
          <div class="small" style="margin:4px 0">${idea.items.map(x => esc(`${x.name} ${x.qty} ${x.unit}`)).join(', ')}</div>
          <div class="mini">${r0(n.kcal)} kcal · P ${r0(n.p)} · C ${r0(n.c)} · F ${r0(n.f)}</div><button class="btn sm primary" data-idea="${i}" style="margin-top:6px">Log this</button></div>`; }).join('') || '<p class="empty">No ideas came back.</p>';
        $$('[data-idea]', s).forEach(b => b.onclick = () => startReview(slot, ideas[+b.dataset.idea].items.map(riFromIdea)));
      } catch (e) { $('#out', s).innerHTML = ''; aiError(e); }
    };
  });
}

/* ---------------- Plan ---------------- */
function renderPlan() {
  $('#title').textContent = 'Diet plan';
  let html = '';
  if (!S.plans.length) {
    html += `<div class="card"><h2>Import your diet plan</h2><p class="small muted">Your plan sets the daily goals and shows “planned vs actual” for each meal. Import your Excel file as-is, or a photo/text of any plan.</p>
      <button class="btn primary block" id="impX">Import Excel (.xlsx)</button>
      <div class="grid2" style="margin-top:8px"><button class="btn" id="impP">From photo</button><button class="btn" id="impT">Paste text</button></div></div>`;
  } else {
    const opt = (sel, allowNone) => (allowNone ? `<option value="">Same as normal day</option>` : '') + S.plans.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    html += `<div class="card"><h3>Which plan applies</h3>
      <label class="f">Normal day</label><select data-ap="normal">${opt(S.activePlans.normal)}</select>
      <label class="f">Veg day</label><select data-ap="veg">${opt(S.activePlans.veg, true)}</select>
      <label class="f">Fasting day</label><select data-ap="fasting">${opt(S.activePlans.fasting, true)}</select>
      <p class="tiny muted">Day types: tap Normal / Veg / Fast on the Today screen, say it when logging, or set defaults per weekday in More.</p></div>`;
    for (const p of S.plans) {
      const v = p.versions.slice().sort((a, b) => a.start < b.start ? 1 : -1)[0];
      const t = planTotals(v);
      html += `<div class="card"><div class="row between"><h3 style="margin:0">${esc(p.name)}</h3><button class="btn sm" data-edit="${p.id}">Edit</button></div>
        <div class="mini" style="margin:6px 0 10px"><span><b>${r0(t.kcal)}</b> kcal</span><span>P <b>${r0(t.p)}</b></span><span>C <b>${r0(t.c)}</b></span><span>F <b>${r0(t.f)}</b></span><span>Fib <b>${r0(t.fib)}</b></span></div>
        ${v.slots.map(sl => { const st = sl.items.reduce((a, i) => addN(a, i.n), zeroN()); return `<details><summary class="row between list-item"><span><b>${esc(sl.name)}</b> <span class="tiny muted">→ ${esc(mapSlot(sl.name) || '?')}</span></span><span class="small num">${r0(st.kcal)} kcal · P ${r0(st.p)}</span></summary>
          <table class="t">${sl.items.map(i => `<tr><td>${esc(i.name)} <span class="muted">${esc(i.qty || '')}</span></td><td>${r0(i.n.kcal)}</td><td>P ${r1(i.n.p)}</td></tr>`).join('')}</table></details>`; }).join('')}
        <div class="row between" style="margin-top:10px"><span class="tiny muted">${p.versions.length > 1 ? p.versions.length + ' versions · current since ' + (v.start === '2000-01-01' ? 'start' : fmtDate(v.start)) : 'Since start'}</span>
        <span><button class="btn sm ghost" data-ren="${p.id}">Rename</button><button class="btn sm ghost danger" data-delp="${p.id}">Delete</button></span></div></div>`;
    }
    html += `<div class="card"><h3>Add another plan</h3><div class="grid3"><button class="btn sm" id="impX">Excel</button><button class="btn sm" id="impP">Photo</button><button class="btn sm" id="impT">Text</button></div></div>`;
  }
  $('#view').innerHTML = html;
  const v = $('#view');
  $('#impX', v).onclick = importPlanExcel;
  $('#impP', v).onclick = async () => {
    if (!S.settings.apiKey) return aiError(new Error('NO_KEY'));
    const f = await pickImage(); if (!f) return;
    openSheet(spinner('Reading your plan…'));
    try { previewPlans((await AI.plan(canvasB64(await imageToCanvas(f, 2000)))).plans.map(aiPlanToPlan)); } catch (e) { closeSheet(); aiError(e); }
  };
  $('#impT', v).onclick = () => openSheet(`<h2>Paste your plan</h2><textarea id="t" style="min-height:200px"></textarea><button class="btn primary block" id="go" style="margin-top:8px">Import</button>`, s => {
    $('#go', s).onclick = async () => {
      const text = $('#t', s).value.trim(); if (!text) return;
      $('#sheet').innerHTML = spinner('Reading your plan…');
      try { previewPlans((await AI.plan(null, text)).plans.map(aiPlanToPlan)); } catch (e) { closeSheet(); aiError(e); }
    };
  });
  $$('[data-ap]', v).forEach(sel => sel.onchange = () => { S.activePlans[sel.dataset.ap] = sel.value || null; save(); toast('Updated'); });
  $$('[data-edit]', v).forEach(b => b.onclick = () => editPlan(S.plans.find(p => p.id === b.dataset.edit)));
  $$('[data-ren]', v).forEach(b => b.onclick = () => { const p = S.plans.find(x => x.id === b.dataset.ren); const n = prompt('Plan name', p.name); if (n) { p.name = n; save(); render(); } });
  $$('[data-delp]', v).forEach(b => b.onclick = () => {
    if (!confirm('Delete this plan? Logged food stays.')) return;
    S.plans = S.plans.filter(x => x.id !== b.dataset.delp);
    Object.keys(S.activePlans).forEach(k => { if (S.activePlans[k] === b.dataset.delp) S.activePlans[k] = null; });
    if (!S.activePlans.normal && S.plans[0]) S.activePlans.normal = S.plans[0].id;
    save(); render();
  });
}
function aiPlanToPlan(p) {
  return { name: p.name || 'Diet plan', slots: (p.slots || []).map(s => ({ name: s.name, items: (s.items || []).map(i => ({ name: i.name, qty: String(i.qty ?? ''), n: pickN(i) })) })) };
}
async function importPlanExcel() {
  const inp = $('#fileInput'); inp.value = ''; inp.removeAttribute('capture');
  inp.accept = '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  inp.onchange = async () => {
    const file = inp.files[0]; if (!file) return;
    openSheet(spinner('Reading spreadsheet…'));
    try {
      await loadScript('vendor/xlsx.mini.min.js');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const plans = [];
      wb.SheetNames.forEach(sn => plans.push(...parsePlanSheet(sn, XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: true }))));
      if (!plans.length) throw new Error('No meals found in that file. Try “From photo” instead.');
      previewPlans(plans);
    } catch (e) { closeSheet(); toast(e.message || 'Could not read that file', 4000); }
  };
  inp.click();
}
function parsePlanSheet(sheetName, rows) {
  const plans = [];
  let cur = null, cols = null, title = '';
  const txt = v => v == null ? '' : String(v).replace(/[\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
  const flush = () => { if (cur && cur.slots.length) plans.push(cur); };
  for (const row of rows) {
    if (!row || row.every(c => c == null || txt(c) === '')) continue;
    const a = txt(row[0]);
    if (/^day\s*\d+/i.test(a) && row.slice(1).every(c => c == null)) { flush(); title = a; cur = null; cols = null; continue; }
    const lower = row.map(c => txt(c).toLowerCase());
    if (lower.includes('meal') || (lower.some(x => x.startsWith('protein')) && lower.some(x => x.startsWith('calor')))) {
      const find = re => lower.findIndex(x => re.test(x));
      const nameCol = Math.max(1, find(/ingredient|food|item/));
      let qtyCol = find(/^recipe|^qty|^quantity|^amount|^portion|^serving/);
      if (qtyCol < 0 || qtyCol === nameCol) qtyCol = nameCol + 1;
      cols = { name: nameCol, qty: qtyCol, p: find(/^protein/), c: find(/^carb/), f: find(/^fat/), fib: find(/^fib/), kcal: find(/^cal|kcal|energy/) };
      flush();
      cur = { name: [txt(sheetName), title].filter(Boolean).join(' – '), slots: [] };
      continue;
    }
    if (!cols || !cur) continue;
    if (/^total/i.test(a)) continue;
    const n = { kcal: num(row[cols.kcal]), p: num(row[cols.p]), c: num(row[cols.c]), f: num(row[cols.f]), fib: num(row[cols.fib]) };
    if (a) cur.slots.push({ name: a, header: { name: txt(row[cols.name]), qty: txt(row[cols.qty]), n }, items: [] });
    else if (cur.slots.length && txt(row[cols.name])) {
      const nm = txt(row[cols.name]);
      let q = txt(row[cols.qty]);
      cur.slots[cur.slots.length - 1].items.push({ name: nm, qty: q, n });
    }
  }
  flush();
  plans.forEach(p => p.slots.forEach(s => { if (!s.items.length && s.header.name) s.items.push({ name: s.header.name, qty: s.header.qty, n: s.header.n }); delete s.header; }));
  return plans;
}
function previewPlans(plans) {
  openSheet(`<h2>Import plan</h2>` + plans.map((p, i) => { const t = planTotals(p); return `<div class="ritem"><label class="row"><input type="checkbox" data-pi="${i}" checked style="width:20px;height:20px"><b class="grow">${esc(p.name)}</b></label>
    <div class="mini" style="margin:6px 0"><span><b>${r0(t.kcal)}</b> kcal</span><span>P <b>${r0(t.p)}</b></span><span>C <b>${r0(t.c)}</b></span><span>F <b>${r0(t.f)}</b></span><span>Fib <b>${r0(t.fib)}</b></span></div>
    <div class="tiny muted">${p.slots.map(s => `${esc(s.name)} (${s.items.length})`).join(' · ')}</div></div>`; }).join('')
    + `<p class="tiny muted">Totals are added up from each food line exactly as written in your plan.</p><button class="btn primary block" id="imp">Import</button>`, s => {
    $('#imp', s).onclick = () => {
      const chosen = plans.filter((p, i) => $(`[data-pi="${i}"]`, s).checked);
      chosen.forEach(p => {
        p.slots.forEach(sl => ensureSlot(sl.name));
        const plan = { id: uid(), name: p.name, created: Date.now(), versions: [{ start: S.plans.length ? today() : '2000-01-01', slots: p.slots }] };
        S.plans.push(plan);
        if (!S.activePlans.normal) S.activePlans.normal = plan.id;
      });
      save(); closeSheet(); render(); toast('Plan imported');
    };
  });
}
function editPlan(plan) {
  const v = plan.versions.slice().sort((a, b) => a.start < b.start ? 1 : -1)[0];
  const draft = JSON.parse(JSON.stringify(v.slots));
  const draw = () => {
    openSheet(`<h2>Edit ${esc(plan.name)}</h2>
      ${draft.map((sl, si) => `<div class="ritem pe"><div class="row"><input type="text" data-sn="${si}" value="${esc(sl.name)}" style="font-weight:700"><button class="iconbtn" data-dels="${si}">✕</button></div>
        ${sl.items.map((it, ii) => `<div style="margin-top:8px;border-top:1px dashed var(--line);padding-top:8px">
          <div class="row"><input type="text" data-f="${si}|${ii}|name" value="${esc(it.name)}" placeholder="Food"><input type="text" data-f="${si}|${ii}|qty" value="${esc(it.qty)}" placeholder="Qty" style="width:34%"><button class="iconbtn" data-deli="${si}|${ii}">✕</button></div>
          <div class="grid5" style="margin-top:4px">${KEYS.map(k => `<input type="number" inputmode="decimal" step="any" data-f="${si}|${ii}|${k}" value="${r1(it.n[k])}" title="${LABEL[k]}" placeholder="${k}">`).join('')}</div></div>`).join('')}
        <div class="row" style="margin-top:8px"><button class="btn sm ghost" data-addi="${si}">+ food</button><button class="btn sm ghost" data-findi="${si}">+ from my foods</button></div></div>`).join('')}
      <p class="tiny muted">Columns: kcal · protein · carbs · fat · fiber</p>
      <button class="btn block ghost" id="adds">+ Add meal</button>
      <label class="f">Changes apply from</label><input type="date" id="from" value="${today()}">
      <p class="tiny muted">Days before this date keep using the previous version, so old reports stay accurate.</p>
      <button class="btn primary block" id="sv">Save plan</button>`, s => {
      $$('[data-sn]', s).forEach(i => i.onchange = () => draft[+i.dataset.sn].name = i.value);
      $$('[data-f]', s).forEach(i => i.onchange = () => { const [si, ii, k] = i.dataset.f.split('|'); const it = draft[+si].items[+ii]; if (k === 'name' || k === 'qty') it[k] = i.value; else it.n[k] = num(i.value); });
      $$('[data-dels]', s).forEach(b => b.onclick = () => { if (confirm('Remove this meal?')) { draft.splice(+b.dataset.dels, 1); draw(); } });
      $$('[data-deli]', s).forEach(b => b.onclick = () => { const [si, ii] = b.dataset.deli.split('|'); draft[+si].items.splice(+ii, 1); draw(); });
      $$('[data-addi]', s).forEach(b => b.onclick = () => { draft[+b.dataset.addi].items.push({ name: '', qty: '', n: zeroN() }); draw(); });
      $$('[data-findi]', s).forEach(b => b.onclick = () => openSearch(null, food => {
        const unit = defaultUnit(food), g = unitG(food, unit);
        draft[+b.dataset.findi].items.push({ name: food.name, qty: unit === 'g' ? '100 g' : `1 ${unit}`, n: roundN(nutrFor(food, unit === 'g' ? 100 : g, food.state)) });
        draw();
      }, 'Add to plan'));
      $('#adds', s).onclick = () => { const n = prompt('Meal name (e.g. Pre-workout)'); if (n) { draft.push({ name: n, items: [] }); draw(); } };
      $('#sv', s).onclick = () => {
        const from = $('#from', s).value || today();
        draft.forEach(sl => ensureSlot(sl.name));
        const same = plan.versions.find(x => x.start === from);
        if (same) same.slots = draft; else plan.versions.push({ start: from, slots: draft });
        save(); closeSheet(); render(); toast('Plan saved');
      };
    });
  };
  draw();
}

/* ---------------- Goals ---------------- */
const ACTIVITY = [[1.2, 'Sedentary (desk job, little exercise)'], [1.375, 'Light (1–3 workouts/week)'], [1.55, 'Moderate (3–5 workouts/week)'], [1.725, 'Very active (6–7 hard sessions/week)'], [1.9, 'Athlete (2 sessions/day or physical job)']];
const kgToLb = k => k * 2.20462, lbToKg = l => l / 2.20462;
function wShow(kg) { return kg == null ? '' : S.settings.weightUnit === 'lb' ? r1(kgToLb(kg)) : r1(kg); }
function renderGoals() {
  $('#title').textContent = 'Goals';
  const p = S.profile, rec = calcRec(p), wu = S.settings.weightUnit, ftin = S.settings.heightUnit === 'ftin';
  const ft = p.heightCm ? Math.floor(p.heightCm / 30.48) : '', inch = p.heightCm ? r1((p.heightCm / 2.54) - ft * 12) : '';
  const T = targets(today());
  const pv = planFor(today());
  const planT = pv ? roundN(planTotals(pv.version)) : null;
  const ws = S.weights.slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const row = (lbl, o) => o ? `<tr><td>${lbl}</td>${KEYS.map(k => `<td>${r0(o[k])}</td>`).join('')}</tr>` : '';
  $('#view').innerHTML = `
  <div class="card"><h3>Active targets today</h3>
    <div class="grid5 num" style="text-align:center">${KEYS.map(k => `<div><div style="font-size:19px;font-weight:750;color:var(--${k})">${r0(T[k])}</div><div class="tiny muted">${k === 'kcal' ? 'kcal' : LABEL[k] + ' g'}</div></div>`).join('')}</div>
    <div class="tiny muted" style="margin-top:6px">${esc(T.src)}</div></div>
  <div class="card"><h3>Goals come from</h3>
    <div class="seg">${[['plan', 'Diet plan'], ['rec', 'Recommended'], ['custom', 'Custom']].map(([k, l]) => `<button data-gs="${k}" class="${S.goalSource === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <table class="t" style="margin-top:10px"><tr><th></th><th>kcal</th><th>P</th><th>C</th><th>F</th><th>Fib</th></tr>${row('Plan', planT)}${row('Recomm.', rec)}${row('Custom', S.custom)}</table>
    ${S.goalSource === 'custom' ? `<div class="grid5" style="margin-top:8px">${KEYS.map(k => `<div><label class="f">${k === 'kcal' ? 'kcal' : k === 'fib' ? 'Fiber' : LABEL[k]}</label><input type="number" inputmode="decimal" data-cu="${k}" value="${S.custom[k]}"></div>`).join('')}</div>` : ''}
    ${S.goalSource === 'plan' && !planT ? '<p class="small over">No plan imported yet — using Recommended until you add one in the Plan tab.</p>' : ''}
  </div>
  <div class="card"><h3>About you</h3>
    <div class="seg">${['male', 'female'].map(x => `<button data-sex="${x}" class="${p.sex === x ? 'on' : ''}">${x === 'male' ? 'Male' : 'Female'}</button>`).join('')}</div>
    <div class="grid2"><div><label class="f">Age</label><input type="number" inputmode="numeric" id="age" value="${p.age ?? ''}"></div>
      <div><label class="f">Weight (${wu}) <a href="#" id="tw" class="tiny">switch</a></label><input type="number" inputmode="decimal" id="wt" value="${wShow(p.weightKg)}"></div></div>
    <label class="f">Height <a href="#" id="th" class="tiny">${ftin ? 'use cm' : 'use ft/in'}</a></label>
    ${ftin ? `<div class="grid2"><input type="number" inputmode="numeric" id="hft" placeholder="ft" value="${ft}"><input type="number" inputmode="decimal" id="hin" placeholder="in" value="${inch}"></div>` : `<input type="number" inputmode="decimal" id="hcm" placeholder="cm" value="${p.heightCm ? r1(p.heightCm) : ''}">`}
    <label class="f">Activity</label><select id="act">${ACTIVITY.map(([v, l]) => `<option value="${v}" ${+p.activity === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <label class="f">Goal</label><div class="seg">${[['lose', 'Lose fat'], ['maintain', 'Maintain'], ['gain', 'Gain']].map(([k, l]) => `<button data-goal="${k}" class="${p.goal === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${p.goal !== 'maintain' ? `<label class="f">Rate per week</label><select id="rate">${[0.25, 0.5, 0.75, 1, 1.5].map(lb => { const kg = lbToKg(lb); return `<option value="${kg}" ${Math.abs(p.rateKg - kg) < 0.02 ? 'selected' : ''}>${wu === 'lb' ? lb + ' lb' : r1(kg) + ' kg'}</option>`; }).join('')}</select>` : ''}
    ${rec ? `<div class="swapres small" style="margin-top:12px">BMR <b>${rec.bmr}</b> kcal · Maintenance <b>${rec.tdee}</b> kcal<br>Recommended: <b>${rec.kcal}</b> kcal · P ${rec.p} g (${+p.activity >= 1.55 ? '2.0' : '1.6'} g/kg) · F ${rec.f} g (27%) · C ${rec.c} g · Fiber ${rec.fib} g
      ${planT ? `<br>Your plan: <b>${planT.kcal}</b> kcal → ${planT.kcal < rec.tdee ? r0(rec.tdee - planT.kcal) + ' kcal/day below maintenance (≈ ' + (wu === 'lb' ? r1((rec.tdee - planT.kcal) * 7 / 3500) + ' lb' : r1((rec.tdee - planT.kcal) * 7 / 7700) + ' kg') + '/week)' : r0(planT.kcal - rec.tdee) + ' kcal/day above maintenance'}` : ''}</div>` : '<p class="small muted">Fill in age, height and weight to see recommendations.</p>'}
  </div>
  <div class="card"><h3>Fasting-day targets</h3>
    <div class="seg">${[['same', 'Same as normal'], ['custom', 'Custom']].map(([k, l]) => `<button data-fm="${k}" class="${S.fasting.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${S.fasting.mode === 'custom' ? `<div class="grid5" style="margin-top:8px">${KEYS.map(k => `<div><label class="f">${k === 'kcal' ? 'kcal' : k === 'fib' ? 'Fiber' : LABEL[k]}</label><input type="number" inputmode="decimal" data-fa="${k}" value="${S.fasting[k]}"></div>`).join('')}</div>` : '<p class="tiny muted">On fasting days the bars show progress but don’t flag “left” in green.</p>'}
  </div>
  <div class="card"><h3>Weight log</h3>
    <div class="row"><input type="number" inputmode="decimal" id="wl" placeholder="Today's weight (${wu})"><button class="btn primary" id="wlAdd">Log</button></div>
    ${ws.length > 1 ? lineChart(ws.slice(-60).map(w => ({ x: w.date, y: +wShow(w.kg) }))) : ''}
    ${ws.slice(-6).reverse().map(w => `<div class="list-item"><span class="grow">${fmtDate(w.date)}</span><b class="num">${wShow(w.kg)} ${wu}</b><button class="iconbtn" data-wd="${w.date}">✕</button></div>`).join('')}
  </div>`;
  const v = $('#view');
  // Re-render only once focus has left the form, so typing across fields (ft → in) isn't interrupted.
  const upd = (fn) => { fn(); save(); setTimeout(() => { const a = document.activeElement; if (!a || !a.matches('#view input')) renderGoals(); }, 0); };
  if (!v._fo) v._fo = 1, v.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (UI.tab === 'goals' && (!a || !a.matches('#view input'))) renderGoals(); }, 0));
  $$('[data-gs]', v).forEach(b => b.onclick = () => upd(() => S.goalSource = b.dataset.gs));
  $$('[data-cu]', v).forEach(i => i.onchange = () => upd(() => S.custom[i.dataset.cu] = num(i.value)));
  $$('[data-fa]', v).forEach(i => i.onchange = () => upd(() => S.fasting[i.dataset.fa] = num(i.value)));
  $$('[data-fm]', v).forEach(b => b.onclick = () => upd(() => S.fasting.mode = b.dataset.fm));
  $$('[data-sex]', v).forEach(b => b.onclick = () => upd(() => p.sex = b.dataset.sex));
  $$('[data-goal]', v).forEach(b => b.onclick = () => upd(() => p.goal = b.dataset.goal));
  $('#age', v).onchange = e => upd(() => p.age = num(e.target.value) || null);
  $('#wt', v).onchange = e => upd(() => { const x = num(e.target.value); if (x) { p.weightKg = wu === 'lb' ? lbToKg(x) : x; logWeight(p.weightKg); } });
  $('#act', v).onchange = e => upd(() => p.activity = +e.target.value);
  if ($('#rate', v)) $('#rate', v).onchange = e => upd(() => p.rateKg = +e.target.value);
  if (ftin) { const h = () => upd(() => { const f = num($('#hft', v).value), i = num($('#hin', v).value); if (f || i) p.heightCm = (f * 12 + i) * 2.54; }); $('#hft', v).onchange = h; $('#hin', v).onchange = h; }
  else $('#hcm', v).onchange = e => upd(() => p.heightCm = num(e.target.value) || null);
  $('#tw', v).onclick = e => { e.preventDefault(); upd(() => S.settings.weightUnit = wu === 'lb' ? 'kg' : 'lb'); };
  $('#th', v).onclick = e => { e.preventDefault(); upd(() => S.settings.heightUnit = ftin ? 'cm' : 'ftin'); };
  $('#wlAdd', v).onclick = () => { const x = num($('#wl', v).value); if (!x) return; upd(() => { const kg = wu === 'lb' ? lbToKg(x) : x; logWeight(kg); p.weightKg = kg; }); toast('Weight logged'); };
  $$('[data-wd]', v).forEach(b => b.onclick = () => upd(() => S.weights = S.weights.filter(w => w.date !== b.dataset.wd)));
}
function logWeight(kg) { const d = today(); S.weights = S.weights.filter(w => w.date !== d); S.weights.push({ date: d, kg: r1(kg * 10) / 10 }); }

/* ---------------- Reports ---------------- */
function barChart(points, color) {
  const W = 340, H = 150, pad = 22, n = points.length;
  const max = Math.max(1, ...points.map(p => Math.max(p.v, p.t || 0))) * 1.12;
  const bw = (W - pad) / n;
  const y = v => H - 18 - (v / max) * (H - 30);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}">`;
  [0.5, 1].forEach(f => { const yy = y(max / 1.12 * f); s += `<line x1="${pad}" x2="${W}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="1"/><text x="0" y="${yy + 3}">${r0(max / 1.12 * f)}</text>`; });
  points.forEach((p, i) => {
    const x = pad + i * bw, w = Math.max(2, bw * 0.62);
    const over = p.t && p.v > p.t * 1.1;
    if (p.v > 0) s += `<rect x="${x + (bw - w) / 2}" y="${y(p.v)}" width="${w}" height="${H - 18 - y(p.v)}" rx="${Math.min(4, w / 3)}" fill="${over ? 'var(--red)' : color}" opacity="${p.v ? 1 : .2}"/>`;
    if (p.t) s += `<line x1="${x + 1}" x2="${x + bw - 1}" y1="${y(p.t)}" y2="${y(p.t)}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="3 2" opacity=".55"/>`;
    if (n <= 8 || i % Math.ceil(n / 8) === 0) s += `<text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${esc(p.l)}</text>`;
  });
  return s + '</svg>';
}
function lineChart(pts) {
  const W = 340, H = 130, pad = 30;
  const ys = pts.map(p => p.y), mn = Math.min(...ys), mx = Math.max(...ys), span = Math.max(1, mx - mn);
  const x = i => pad + i * (W - pad - 6) / Math.max(1, pts.length - 1), y = v => 10 + (1 - (v - mn) / span) * (H - 30);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.y)}`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><text x="0" y="${y(mx) + 3}">${r1(mx)}</text><text x="0" y="${y(mn) + 3}">${r1(mn)}</text>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.y)}" r="2.6" fill="var(--accent)"/>`).join('')}
    <text x="${pad}" y="${H - 3}">${fmtDate(pts[0].x)}</text><text x="${W}" y="${H - 3}" text-anchor="end">${fmtDate(pts[pts.length - 1].x)}</text></svg>`;
}
function rangeDates() {
  const t = today();
  if (UI.reportMode === 'week') {
    const d = parseYmd(t); const dow = (d.getDay() + 6) % 7; // Monday start
    const start = addDays(t, -dow + UI.reportOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  const d = parseYmd(t); d.setDate(1); d.setMonth(d.getMonth() + UI.reportOffset);
  const out = []; const m = d.getMonth();
  while (d.getMonth() === m) { out.push(ymd(d)); d.setDate(d.getDate() + 1); }
  return out;
}
function renderReports() {
  $('#title').textContent = 'Reports';
  const dates = rangeDates(), t = today();
  const rows = dates.map(d => ({ d, E: dayTotals(d), T: targets(d), n: getDay(d).entries.length, type: dayType(d) }));
  const logged = rows.filter(r => r.n && r.d <= t);
  const label = UI.reportMode === 'week' ? `${fmtDate(dates[0])} – ${fmtDate(dates[6])}` : parseYmd(dates[0]).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const avg = k => logged.length ? logged.reduce((a, r) => a + r.E[k], 0) / logged.length : 0;
  const avgT = k => logged.length ? logged.reduce((a, r) => a + r.T[k], 0) / logged.length : (targets(t)[k]);
  const hit = k => logged.filter(r => {
    if (!r.T[k]) return false; const q = r.E[k] / r.T[k];
    return k === 'p' || k === 'fib' ? q >= 0.9 : k === 'kcal' ? Math.abs(q - 1) <= 0.1 : Math.abs(q - 1) <= 0.15;
  }).length;
  const mk = UI.reportMetric, colors = { kcal: 'var(--kcal)', p: 'var(--p)', c: 'var(--c)', f: 'var(--f)', fib: 'var(--fib)' };
  const pts = rows.map(r => ({ l: UI.reportMode === 'week' ? parseYmd(r.d).toLocaleDateString(undefined, { weekday: 'narrow' }) : String(parseYmd(r.d).getDate()), v: r.E[mk], t: r.d <= t ? r.T[mk] : 0 }));
  const kc = logged.reduce((a, r) => a + r.E.p * 4 + r.E.c * 4 + r.E.f * 9, 0) || 1;
  const split = k => r0(logged.reduce((a, r) => a + r.E[k] * (k === 'f' ? 9 : 4), 0) / kc * 100);
  const ws = S.weights.filter(w => w.date >= dates[0] && w.date <= dates[dates.length - 1]).sort((a, b) => a.date < b.date ? -1 : 1);
  $('#view').innerHTML = `
  <div class="seg" style="margin-top:4px"><button data-rm="week" class="${UI.reportMode === 'week' ? 'on' : ''}">Week</button><button data-rm="month" class="${UI.reportMode === 'month' ? 'on' : ''}">Month</button></div>
  <div class="row between" style="margin:10px 0"><button class="iconbtn" id="rp">◀</button><b>${label}</b><button class="iconbtn" id="rn" ${UI.reportOffset >= 0 ? 'disabled style="opacity:.3"' : ''}>▶</button></div>
  <div class="card"><div class="row between"><h3 style="margin:0">Daily ${LABEL[mk].toLowerCase()}</h3><span class="tiny muted">dashes = target</span></div>
    <div class="row wrap" style="gap:5px;margin:8px 0">${KEYS.map(k => `<button class="chip ${k === mk ? 'on' : ''}" data-mk="${k}">${LABEL[k]}</button>`).join('')}</div>
    ${barChart(pts, colors[mk])}</div>
  <div class="card"><h3>Averages · ${logged.length} day${logged.length === 1 ? '' : 's'} logged</h3>
    <table class="t"><tr><th></th><th>Avg</th><th>Target</th><th>Diff</th><th>On target</th></tr>
    ${KEYS.map(k => { const a = avg(k), tt = avgT(k), d = a - tt; return `<tr><td>${LABEL[k]}</td><td>${r0(a)}</td><td>${r0(tt)}</td><td class="${Math.abs(d) < tt * 0.05 ? '' : (k === 'p' || k === 'fib') ? (d < 0 ? 'over' : 'left') : (d > 0 ? 'over' : 'left')}">${d > 0 ? '+' : ''}${r0(d)}</td><td>${hit(k)}/${logged.length}</td></tr>`; }).join('')}</table>
    ${logged.length ? `<p class="small" style="margin:10px 0 0">Macro split: <b>P ${split('p')}%</b> · <b>C ${split('c')}%</b> · <b>F ${split('f')}%</b> of calories</p>` : ''}
    <p class="tiny muted">On target: calories within ±10%, carbs/fat within ±15%, protein & fiber at least 90%.</p></div>
  ${ws.length > 1 ? `<div class="card"><h3>Weight</h3>${lineChart(ws.map(w => ({ x: w.date, y: +wShow(w.kg) })))}<p class="small">Change: <b>${r1(+wShow(ws[ws.length - 1].kg) - +wShow(ws[0].kg))} ${S.settings.weightUnit}</b></p></div>` : ''}
  <div class="card"><h3>Days</h3>${rows.filter(r => r.d <= t).reverse().map(r => `<div class="list-item" data-day="${r.d}"><span class="grow">${fmtDate(r.d)} ${r.type !== 'normal' ? `<span class="tag">${r.type}</span>` : ''}</span>
    ${r.n ? `<span class="small num muted">P ${r0(r.E.p)}</span><b class="num ${r.E.kcal > r.T.kcal * 1.1 ? 'over' : ''}">${r0(r.E.kcal)}</b>` : '<span class="small muted">—</span>'}<span class="muted">›</span></div>`).join('')}</div>`;
  const v = $('#view');
  $$('[data-rm]', v).forEach(b => b.onclick = () => { UI.reportMode = b.dataset.rm; UI.reportOffset = 0; render(); });
  $$('[data-mk]', v).forEach(b => b.onclick = () => { UI.reportMetric = b.dataset.mk; render(); });
  $('#rp', v).onclick = () => { UI.reportOffset--; render(); };
  $('#rn', v).onclick = () => { if (UI.reportOffset < 0) { UI.reportOffset++; render(); } };
  $$('[data-day]', v).forEach(el => el.onclick = () => { UI.date = el.dataset.day; go('today'); });
}

/* ---------------- More (settings, foods, backup) ---------------- */
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function renderMore() {
  $('#title').textContent = 'More';
  const st = S.settings;
  $('#view').innerHTML = `
  <div class="card"><h3>Gemini AI key</h3>
    <p class="small muted">Free from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Stored only on this phone.</p>
    <input type="password" id="key" placeholder="Paste your key" value="${esc(st.apiKey)}" autocomplete="off">
    <div class="row between" style="margin-top:8px"><span class="tiny muted">${st.model ? 'Model: ' + esc(st.model) : 'Not set up yet'}</span><button class="btn primary sm" id="saveKey">Save & test</button></div></div>
  <div class="card"><h3>My Foods</h3><p class="small muted">${S.myFoods.length} saved — your dishes, scanned products and AI estimates. ${S.myFoods.filter(f => f.est).length ? `<b>${S.myFoods.filter(f => f.est).length} still estimated.</b>` : ''}</p>
    <div class="grid2"><button class="btn" id="myF">Open My Foods</button><button class="btn" id="newDish">+ New dish</button></div></div>
  <div class="card"><h3>Day types by weekday</h3>
    ${WD.map((d, i) => `<div class="list-item"><span class="grow">${d}</span><select data-wd="${i}" style="width:auto">${['normal', 'veg', 'fasting'].map(t => `<option ${(st.weekdayTypes[i] || 'normal') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`).join('')}
    <p class="tiny muted">You can always change a single day on the Today screen or by saying it.</p></div>
  <div class="card"><h3>Meals</h3>
    ${st.slots.map((s, i) => `<div class="row" style="margin:6px 0"><input type="text" data-sl="${i}" value="${esc(s.name)}"><input type="number" inputmode="decimal" step="0.5" data-sh="${i}" value="${s.h}" style="width:76px" title="Starts at hour"><button class="iconbtn" data-sd="${i}">✕</button></div>`).join('')}
    <div class="row between"><span class="tiny muted">Number = hour the meal starts (24h), used to auto-pick the meal.</span><button class="btn sm" id="addSl">+ Meal</button></div></div>
  <div class="card"><h3>Favorites</h3>${S.favorites.length ? S.favorites.map(f => `<div class="list-item"><span class="grow">★ ${esc(f.name)} <span class="tiny muted">${f.items.length} items</span></span><button class="iconbtn" data-fd="${f.id}">✕</button></div>`).join('') : '<p class="small muted">Save a meal as a favorite from the review screen.</p>'}</div>
  <div class="card"><h3>Backup</h3><p class="small muted">Your data lives only on this phone. iPhone can clear it if the app goes unused for weeks — export a backup to Files or iCloud now and then.${st.lastBackup ? ' Last backup: ' + new Date(st.lastBackup).toLocaleDateString() : ''}</p>
    <div class="grid2"><button class="btn primary" id="exp">Export backup</button><button class="btn" id="imp">Restore</button></div></div>
  <div class="card"><h3>About</h3><p class="small muted">Nutrition values are estimates from USDA/Indian food tables, labels, Open Food Facts and AI. Not medical advice.</p>
    <button class="btn sm danger" id="wipe">Erase all data</button></div>`;
  const v = $('#view');
  $('#saveKey', v).onclick = async () => {
    const k = $('#key', v).value.trim();
    if (!k) { st.apiKey = ''; st.model = ''; save(); return renderMore(); }
    $('#saveKey', v).disabled = true; $('#saveKey', v).textContent = 'Testing…';
    try { const names = await AI.listModels(k); st.apiKey = k; st.model = AI.pickModel(names); save(); toast('Key works · ' + st.model); }
    catch (e) { toast(e.message, 4000); }
    renderMore();
  };
  $('#myF', v).onclick = openMyFoods;
  $('#newDish', v).onclick = () => openDish(() => { if (!R) R = { slot: guessSlot(UI.date), date: UI.date, items: [], questions: [] }; return R; });
  $$('[data-wd]', v).forEach(s => s.onchange = () => { st.weekdayTypes[s.dataset.wd] = s.value; save(); });
  $$('[data-sl]', v).forEach(i => i.onchange = () => {
    const old = st.slots[+i.dataset.sl].name, nw = i.value.trim(); if (!nw) return;
    st.slots[+i.dataset.sl].name = nw;
    Object.values(S.days).forEach(d => d.entries.forEach(e => { if (e.slot === old) e.slot = nw; }));
    save();
  });
  $$('[data-sh]', v).forEach(i => i.onchange = () => { st.slots[+i.dataset.sh].h = num(i.value); st.slots.sort((a, b) => a.h - b.h); save(); renderMore(); });
  $$('[data-sd]', v).forEach(b => b.onclick = () => { if (st.slots.length < 2) return; if (!confirm('Remove this meal? Logged food in it stays in history but hides on Today.')) return; st.slots.splice(+b.dataset.sd, 1); save(); renderMore(); });
  $('#addSl', v).onclick = () => { const n = prompt('Meal name'); if (n) { st.slots.push({ name: n, h: 20 }); st.slots.sort((a, b) => a.h - b.h); save(); renderMore(); } };
  $$('[data-fd]', v).forEach(b => b.onclick = () => { S.favorites = S.favorites.filter(f => f.id !== b.dataset.fd); save(); renderMore(); });
  $('#exp', v).onclick = exportData;
  $('#imp', v).onclick = importData;
  $('#wipe', v).onclick = () => { if (confirm('Erase ALL data on this phone? Export a backup first.') && confirm('Really erase everything?')) { localStorage.removeItem(STORE); load(); window.S = S; render(); } };
}
function openMyFoods() {
  const draw = (q = '') => {
    const list = S.myFoods.filter(f => !q || f.name.toLowerCase().includes(q.toLowerCase()));
    openSheet(`<h2>My Foods</h2><input type="search" id="q" placeholder="Search" value="${esc(q)}">
      <div class="results">${list.map(f => `<div class="res" data-id="${f.id}"><div class="grow"><div class="nm">${esc(f.name)} ${f.est ? '<span class="tag est">est</span>' : ''} <span class="tag">${esc(f.src || '')}</span></div>
        <div class="tiny muted">${r0(f.n.kcal)} kcal · P ${r1(f.n.p)} · C ${r1(f.n.c)} · F ${r1(f.n.f)} per 100 g ${f.state}${Object.entries(f.u || {}).map(([k, g]) => ` · 1 ${k} = ${g} g`).join('')}</div></div><span class="muted">›</span></div>`).join('') || '<div class="empty">Nothing saved yet. Foods you log by voice/photo, scanned labels and dishes appear here.</div>'}</div>
      <button class="btn block" id="nf" style="margin-top:8px">+ New food</button>`, s => {
      $('#q', s).oninput = e => { const val = e.target.value; draw(val); const qi = $('#q'); qi.focus(); qi.setSelectionRange(val.length, val.length); };
      $$('[data-id]', s).forEach(el => el.onclick = () => openFoodEditor(foodById(el.dataset.id), () => openMyFoods()));
      $('#nf', s).onclick = () => openFoodEditor({}, () => openMyFoods());
    });
  };
  draw();
}
function exportData() {
  const data = JSON.parse(JSON.stringify(S)); data.settings.apiKey = '';
  const name = `thali-backup-${today()}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const done = () => { S.settings.lastBackup = Date.now(); save(); if (UI.tab === 'more') renderMore(); };
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).then(done).catch(() => {}); return; }
  } catch (e) {}
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); done();
}
function importData() {
  const inp = $('#fileInput'); inp.value = ''; inp.accept = '.json,application/json'; inp.removeAttribute('capture');
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.days || !data.settings) throw new Error();
      if (!confirm('Replace everything on this phone with this backup?')) return;
      const key = S.settings.apiKey, model = S.settings.model;
      localStorage.setItem(STORE, JSON.stringify(data)); load(); window.S = S;
      if (!S.settings.apiKey) { S.settings.apiKey = key; S.settings.model = model; }
      save(); render(); toast('Backup restored');
    } catch (e) { toast('That file is not a Thali backup.'); }
  };
  inp.click();
}

/* ---------------- Boot ---------------- */
load(); window.S = S;
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('visibilitychange', () => { if (!document.hidden && UI.tab === 'today' && $('#sheetWrap').hidden) { const t = today(); if (UI.date !== t && UI._last === UI.date) UI.date = t; UI._last = UI.date; render(); } });
UI._last = UI.date;
render();
