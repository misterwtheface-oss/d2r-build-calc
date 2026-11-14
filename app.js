'use strict';
// D2R skill calculator: original tree art + icons, points allocation, and every source that boosts a chosen skill.
const D = window.D2R;
const FEATURES = { grants: true, magicAffixes: true };

const EL = { fire: 'Fire', ltng: 'Lightning', cold: 'Cold', pois: 'Poison', mag: 'Magic' };
const KIND_ORDER = ['synergy', 'skill', 'levels', 'damage', 'grant'];
const KIND_TITLE = {
  synergy: 'Synergies', skill: 'Other skills', levels: 'Items: skill levels',
  damage: 'Items: damage and resistance', grant: 'Items that grant it',
};
const LEVEL_KINDS = new Set(['all skills', 'class skills', 'skill tab', 'single skill', 'oskill', 'element skills']);
const ITEM_KIND = { unique: 'Unique', 'set item': 'Set', 'set bonus': 'Set bonus', runeword: 'Runeword',
  prefix: 'Prefix', suffix: 'Suffix', automagic: 'Class item' };

const state = load();
let cls = state.cls || 'sor';
let page = state.page?.[cls] || 3;
let sel = state.sel?.[cls] || null;

function load() {
  try { return JSON.parse(localStorage.getItem('d2r-calc') || '{}'); } catch { return {}; }
}
function save() {
  state.cls = cls;
  state.page = { ...(state.page || {}), [cls]: page };
  state.sel = { ...(state.sel || {}), [cls]: sel };
  localStorage.setItem('d2r-calc', JSON.stringify(state));
}
const pts = () => (state.pts ||= {});
const ptsOf = (k) => pts()[k] || 0;
const classSkills = (c) => Object.entries(D.skills).filter(([, s]) => s.cls === c);
const clsInfo = (c) => D.classes.find((x) => x.code === c);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const range = (lo, hi) => (lo && hi && lo !== hi ? `${lo}-${hi}` : hi || lo || '');
const skillName = (k) => D.skills[k]?.name || k;

// ---------- fonts ----------
(function fonts() {
  const css = [];
  if (D.fonts.ExocetBlizzardOT) css.push(`@font-face{font-family:Exocet;src:url(${D.fonts.ExocetBlizzardOT});font-display:swap}`);
  if (D.fonts.Formal436BT) css.push(`@font-face{font-family:Formal;src:url(${D.fonts.Formal436BT});font-display:swap}`);
  const st = document.createElement('style');
  st.textContent = css.join('');
  document.head.appendChild(st);
})();

// ---------- icons ----------
function iconStyle(s) {
  const c = clsInfo(s.cls);
  const i = c.cel[String(s.icon)] ?? 0;
  const pct = c.sheetCount > 1 ? (i / (c.sheetCount - 1)) * 100 : 0;
  return `background-image:url(${c.sheet});background-size:${c.sheetCount * 100}% 100%;background-position:${pct}% 0`;
}

// ---------- rules ----------
function totalPoints() {
  return Object.entries(pts()).reduce((n, [k, v]) => n + (D.skills[k]?.cls === cls ? v : 0), 0);
}
function reqMet(k) {
  return D.skills[k].req.every((r) => !D.skills[r] || ptsOf(r) > 0);
}
function charLevelNeeded() {
  // Each point needs a character level >= the skill's required level + points already in it.
  let lvl = 1;
  for (const [k, s] of classSkills(cls)) {
    const p = ptsOf(k);
    if (p) lvl = Math.max(lvl, s.reqlevel + p - 1);
  }
  return lvl;
}
function setPts(k, v) {
  const s = D.skills[k];
  v = Math.max(0, Math.min(s.maxlvl, v));
  if (v > 0 && !reqMet(k)) return;
  if (v === 0) {
    // Removing a prerequisite clears the skills that depend on it.
    for (const [o, os] of classSkills(cls)) if (os.req.includes(k) && ptsOf(o)) setPts(o, 0);
  }
  if (v) pts()[k] = v; else delete pts()[k];
  save();
}

// ---------- synergy evaluation ----------
// Formulas reference skill('Name'.blvl) (hard points) and parN (row params). Evaluate when only arithmetic remains.
function evalFormula(fx, par, lvlOf) {
  let e = fx.replace(/^"|"$/g, '')
    .replace(/skill\('([^']+)'\.(\w+)\)/g, (_, n) => String(lvlOf(n)))
    .replace(/par(\d+)/g, (_, n) => String(Number(par[`par${n}`] || 0)))
    .replace(/\bmin\(/g, 'Math.min(').replace(/\bmax\(/g, 'Math.max(');
  if (/[^0-9+\-*/().,\s]|Math\.(?!min|max)/.test(e.replace(/Math\.(min|max)/g, ''))) return null;
  try { return Function(`"use strict";return (${e})`)(); } catch { return null; }
}
function perLevel(b) {
  // Value one point in the source skill adds: formula at 1 point minus formula at 0 points.
  const one = evalFormula(b.fx, b.par, (n) => (n === b.f ? 1 : 0));
  const zero = evalFormula(b.fx, b.par, () => 0);
  return one == null || zero == null ? null : one - zero;
}
function readableFormula(fx, par) {
  return fx.replace(/^"|"$/g, '')
    .replace(/skill\('([^']+)'\.(\w+)\)/g, (_, n) => `[${skillName(n)}]`)
    .replace(/par(\d+)/g, (_, n) => par[`par${n}`] || `par${n}`);
}
const statLabel = (t) => (t || '').replace(/%[+]?d%*/g, '').replace(/%%/g, '%').replace(/\s+/g, ' ').trim();

// ---------- item text ----------
function itemLine(b, k) {
  const s = D.skills[k];
  const v = range(b.lo, b.hi);
  const el = EL[s.element] || '';
  switch (b.k) {
    case 'all skills': return `+${v} to All Skills`;
    case 'class skills': return `+${v} to ${clsInfo(s.cls).name} Skill Levels`;
    case 'skill tab': return `+${v} to ${s.tab} Skills`;
    case 'single skill': return `+${v} to ${s.name} (${clsInfo(s.cls).name} only)`;
    case 'oskill': return `+${v} to ${s.name}`;
    case 'element skills': return `+${v} to ${el} Skills`;
    case 'mastery': return `+${v}% to ${el} Skill Damage`;
    case 'pierce': return `-${v}% to Enemy ${el} Resistance`;
    case 'immune': return `Pierces ${el} Immunity`;
  }
  return `${b.p} ${v}`;
}
function grantLine(b, k) {
  const n = D.skills[k].name;
  if (b.h === 'charges') return `Level ${b.hi} ${n} (${b.lo} charges)`;
  if (b.h === 'aura') return `Level ${range(b.lo, b.hi)} ${n} Aura When Equipped`;
  return `${b.lo}% chance to cast level ${b.hi} ${n} ${b.h}`;
}
const itemValue = (b) => Number(b.hi || b.lo || 0);

// ---------- render: classes, tabs, tree ----------
function renderClasses() {
  document.getElementById('classes').innerHTML = D.classes.map((c) =>
    `<button class="cls${c.code === cls ? ' on' : ''}" data-cls="${c.code}">${esc(c.name)}</button>`).join('');
}
function renderSummary() {
  const n = totalPoints();
  document.getElementById('summary').innerHTML =
    `<span>Points <b>${n}</b></span><span>Level <b>${n ? Math.max(charLevelNeeded(), n + 1) : 1}</b></span>` +
    `<button class="reset" data-reset>Reset</button>`;
}
function renderTabs() {
  const c = clsInfo(cls);
  // Top-to-bottom order matches the in-game tabs: page 3, 2, 1.
  document.getElementById('tabs').innerHTML = [3, 2, 1].map((p) => {
    const used = classSkills(cls).filter(([, s]) => s.page === p).reduce((n, [k]) => n + ptsOf(k), 0);
    return `<button class="tab${p === page ? ' on' : ''}" data-page="${p}">${esc(c.tabs[p - 1])}<i>${used || ''}</i></button>`;
  }).join('');
}
function renderTree() {
  const c = clsInfo(cls);
  const L = D.layout;
  const tree = document.getElementById('tree');
  const scrollKeep = window.scrollY;
  tree.style.backgroundImage = `url(${c.trees[page - 1]})`;
  tree.style.aspectRatio = `${L.w} / ${L.h}`;
  const synFrom = new Set(sel ? D.skills[sel].b.filter((b) => b.t === 'synergy').map((b) => b.f) : []);
  const synTo = new Set(sel ? classSkills(cls).filter(([, s]) => s.b.some((b) => b.t === 'synergy' && b.f === sel)).map(([k]) => k) : []);
  tree.innerHTML = classSkills(cls).filter(([, s]) => s.page === page).map(([k, s]) => {
    const x = (L.x[s.col - 1] + 2) / L.w * 100, y = (L.y[s.row - 1] + 2) / L.h * 100;
    const w = L.icon / L.w * 100, h = L.icon / L.h * 100;
    const p = ptsOf(k);
    const cl = ['skill', p ? 'has' : '', reqMet(k) ? '' : 'locked', k === sel ? 'sel' : '',
      synFrom.has(k) ? 'syn-from' : '', synTo.has(k) ? 'syn-to' : ''].join(' ');
    return `<button class="${cl}" data-skill="${esc(k)}" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%" title="${esc(s.name)}">` +
      `<span class="ic" style="${iconStyle(s)}"></span><span class="pts">${p || ''}</span></button>`;
  }).join('');
  window.scrollTo(0, scrollKeep);
}

// ---------- render: detail ----------
function group(k) {
  const s = D.skills[k];
  const g = Object.fromEntries(KIND_ORDER.map((x) => [x, []]));
  for (const b of s.b) {
    if (b.t === 'synergy') g.synergy.push(b);
    else if (b.t === 'skill') g.skill.push(b);
    else if (b.t === 'grant') { if (FEATURES.grants) g.grant.push(b); }
    else if (!FEATURES.magicAffixes && ['prefix', 'suffix'].includes(D.items[b.i][0])) continue;
    else (LEVEL_KINDS.has(b.k) ? g.levels : g.damage).push(b);
  }
  return g;
}
function bar(v, max) {
  const w = max > 0 ? Math.max(2, Math.round((Math.abs(v) / max) * 100)) : 0;
  return `<span class="bar"><span style="width:${w}%"></span></span>`;
}
function synergyRows(list) {
  const rows = list.map((b) => {
    const per = perLevel(b);
    const have = evalFormula(b.fx, b.par, (n) => ptsOf(n));
    return { b, per, now: per == null ? null : (have ?? 0) - (evalFormula(b.fx, b.par, () => 0) ?? 0) };
  });
  // One scale per field (rule A-magnitude-bars): per-level value against the largest per-level value shown.
  const max = Math.max(0, ...rows.map((r) => Math.abs(r.per || 0)));
  return rows.map(({ b, per, now }) => {
    const src = D.skills[b.f];
    const what = statLabel(b.fd) || b.fld;
    const val = per == null ? '' : `${per > 0 ? '+' : ''}${+per.toFixed(2)}${/dmg|damage|%/i.test(b.fld + b.fd) ? '%' : ''} per level`;
    return `<li class="row" data-jump="${esc(b.f)}">` +
      (src ? `<span class="ic sm" style="${iconStyle(src)}"></span>` : '') +
      `<span class="txt"><b>${esc(skillName(b.f))}</b> <em>${esc(what)}</em><br><span class="v">${esc(val)}</span>` +
      (now ? ` <span class="now">now ${now > 0 ? '+' : ''}${+now.toFixed(2)}</span>` : '') +
      `<span class="fx">${esc(readableFormula(b.fx, b.par))}</span></span>${per == null ? '' : bar(per, max)}</li>`;
  }).join('');
}
function skillRows(list) {
  const seen = new Set();
  return list.filter((b) => !seen.has(b.f + b.k) && seen.add(b.f + b.k)).map((b) => {
    const src = D.skills[b.f];
    const what = { mastery: 'raises damage', pierce: 'lowers enemy resistance', enemyres: 'lowers enemy resistance',
      immune: 'pierces immunity' }[b.k] || b.k;
    return `<li class="row" data-jump="${esc(b.f)}"><span class="ic sm" style="${iconStyle(src)}"></span>` +
      `<span class="txt"><b>${esc(src.name)}</b> <em>${esc(clsInfo(src.cls).name)}${b.via === 'aura' ? ' · aura/curse' : ''}</em>` +
      `<br><span class="v">${esc(what)}</span><span class="fx">${esc(b.st)} = ${esc(b.fx)}</span></span></li>`;
  }).join('');
}
function itemRows(list, k, line) {
  const rows = list.map((b) => ({ b, it: D.items[b.i], v: itemValue(b) }))
    .sort((a, c) => c.v - a.v || a.it[1].localeCompare(c.it[1]));
  const max = Math.max(0, ...rows.map((r) => r.v));
  return rows.map(({ b, it, v }) =>
    `<li class="row item"><span class="txt"><b class="q-${it[0].replace(/\s/g, '')}">${esc(it[1])}</b> ` +
    `<em>${esc(ITEM_KIND[it[0]] || it[0])}${it[2] ? ` · lvl ${esc(it[2])}` : ''}</em><br>` +
    `<span class="v">${esc(line(b, k))}</span></span>${line === itemLine ? bar(v, max) : ''}</li>`).join('');
}
function renderDetail() {
  const el = document.getElementById('detail');
  if (!sel || !D.skills[sel] || D.skills[sel].cls !== cls) {
    el.innerHTML = '<p class="hint">Select a skill.</p>';
    return;
  }
  const s = D.skills[sel];
  const p = ptsOf(sel);
  const g = group(sel);
  const open = state.open || {};
  const body = { synergy: synergyRows, skill: skillRows,
    levels: (l) => itemRows(l, sel, itemLine), damage: (l) => itemRows(l, sel, itemLine),
    grant: (l) => itemRows(l, sel, grantLine) };
  el.innerHTML =
    `<div class="head"><span class="ic big" style="${iconStyle(s)}"></span><div>` +
    `<h2>${esc(s.name)}</h2><p>${esc(s.tab)}${s.element ? ` · ${EL[s.element]}` : ''} · req. level ${s.reqlevel}` +
    `${s.req.length ? ` · needs ${s.req.map(skillName).map(esc).join(', ')}` : ''}</p></div>` +
    `<div class="alloc"><button data-add="-1">−</button><b>${p}</b><button data-add="1"${reqMet(sel) ? '' : ' disabled'}>+</button></div></div>` +
    KIND_ORDER.filter((x) => g[x].length).map((x) =>
      `<details data-sec="${x}"${open[x] !== false ? ' open' : ''}><summary>${KIND_TITLE[x]} <i>${x === 'skill' ? new Set(g[x].map((b) => b.f + b.k)).size : g[x].length}</i></summary>` +
      `<ul>${body[x](g[x])}</ul></details>`).join('');
}
function render() {
  renderClasses(); renderSummary(); renderTabs(); renderTree(); renderDetail();
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('button,[data-jump]');
  if (!t) return;
  if (t.dataset.cls) { cls = t.dataset.cls; page = state.page?.[cls] || 3; sel = state.sel?.[cls] || null; }
  else if (t.dataset.page) page = +t.dataset.page;
  else if (t.dataset.skill) {
    if (sel === t.dataset.skill && reqMet(sel)) setPts(sel, ptsOf(sel) + 1);
    sel = t.dataset.skill;
  } else if (t.dataset.add) setPts(sel, ptsOf(sel) + Number(t.dataset.add));
  else if ('reset' in t.dataset) { for (const [k] of classSkills(cls)) delete pts()[k]; }
  else if (t.dataset.jump) {
    const s = D.skills[t.dataset.jump];
    if (!s) return;
    cls = s.cls; page = s.page; sel = t.dataset.jump;
  } else return;
  save(); render();
});
document.addEventListener('contextmenu', (e) => {
  const t = e.target.closest('[data-skill]');
  if (!t) return;
  e.preventDefault();
  sel = t.dataset.skill; setPts(sel, ptsOf(sel) - 1); save(); render();
});
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (d.dataset?.sec) { state.open = { ...(state.open || {}), [d.dataset.sec]: d.open }; save(); }
}, true);

render();
