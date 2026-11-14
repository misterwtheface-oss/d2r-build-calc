'use strict';
// D2R skill calculator: original tree art + icons, points allocation, and every source that boosts a chosen skill.
const D = window.D2R;
const FEATURES = { grants: true, magicAffixes: true };

const EL = { fire: 'Fire', ltng: 'Lightning', cold: 'Cold', pois: 'Poison', mag: 'Magic' };
const KIND_ORDER = ['form', 'synergy', 'skill', 'levels', 'damage', 'grant'];
const KIND_TITLE = {
  form: 'Form effects', synergy: 'Synergies', skill: 'Other skills', levels: 'Items: skill levels',
  damage: 'Items: damage and resistance', grant: 'Items that grant it',
};
const LEVEL_KINDS = new Set(['all skills', 'class skills', 'skill tab', 'single skill', 'oskill', 'element skills']);
const ITEM_KIND = { unique: 'Unique', 'set item': 'Set', 'set bonus': 'Set bonus', runeword: 'Runeword',
  prefix: 'Prefix', suffix: 'Suffix', automagic: 'Class item' };
// Item filter chips: chip -> item kinds it covers.
const ITEM_FILTER = { Unique: ['unique'], Set: ['set item', 'set bonus'], Runeword: ['runeword'],
  Magic: ['prefix', 'suffix', 'automagic'] };
const WEAPON = { axe: 'axes', blde: 'swords and daggers', blun: 'maces', pole: 'polearms', spea: 'spears',
  thro: 'throwing weapons', h2h: 'claws', weap: 'any weapon', bow: 'bows', xbow: 'crossbows', mele: 'melee weapons' };
const SKILL_EFFECT = { mastery: 'raises damage', pierce: 'lowers enemy resistance', enemyres: 'lowers enemy resistance',
  immune: 'pierces immunity', damage: 'raises physical damage', crit: 'critical strike chance', crush: 'crushing blow' };

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
// Formulas name skills case-insensitively (Werewolf's calcs use 'shape shifting' for 'Shape Shifting').
const SKILL_KEYS = Object.fromEntries(Object.keys(D.skills).map((k) => [k.toLowerCase(), k]));
const skillKey = (n) => SKILL_KEYS[n.toLowerCase()] || n;
// ctx = the boosted skill's level and its ParamN values, for lnXY / dmXY / lvl (skillcalc.txt).
function evalFormula(fx, par, lvlOf, ctx = { lvl: 1, nums: {} }) {
  const P = (n) => Number(par[`par${n}`] ?? ctx.nums[`Param${n}`] ?? 0);
  const L = ctx.lvl;
  let e = fx.replace(/^"|"$/g, '')
    // skill('X'.blvl|lvl) = points in X; skill('X'.ln34 / dm12 / par2) = that formula on X's own row at X's level.
    .replace(/skill\('([^']+)'\.(\w+)\)/g, (_, raw, attr) => {
      const n = skillKey(raw);
      if (/^b?lvl$/.test(attr) || !D.skills[n]) return String(lvlOf(n));
      const lv = lvlOf(n);
      return lv ? String(evalFormula(attr, {}, lvlOf, { lvl: lv, nums: D.skills[n].nums || {} }) ?? 0) : '0';
    })
    .replace(/\btoht\b/g, `(${Number(ctx.nums.ToHit || 0)}+(${ctx.lvl}-1)*${Number(ctx.nums.LevToHit || 0)})`)
    // miss('name'.rang|rad|par1|par2): the missile row's Range / Radius / Param1-2.
    .replace(/miss\('([^']+)'\.(\w+)\)/g, (all, m, attr) => {
      const n = D.missiles[m]?.nums;
      const col = { rang: 'Range', rad: 'Radius', par1: 'Param1', par2: 'Param2' }[attr];
      return n && col ? String(Number(n[col] || 0)) : all;
    })
    // m<n>en / ex / eo / ey / el / rn / nm / xm: descmissile<n>'s damage, length and range at this skill's level.
    .replace(/\bm([123])(en|ex|eo|ey|el|rn|nm|xm)\b/g, (all, i, what) => {
      const v = ctx.key ? missileValue(ctx, Number(i), what) : null;
      return v == null ? all : `(${v})`;
    })
    // Tooltip tokens (skillcalc.txt) that need the whole skill row: ctx.key names it.
    .replace(/\b(usmc|mana|enma|exma|edmn|edmx|edns|edxs|enms|exms|edln|edma|pnma|pxma|sklvl|len|clc\d+|ast\d|pst\d+|pa1[0-2])\b/g,
      (tok) => { const v = ctx.key ? special(tok, ctx, lvlOf) : null; return v == null ? tok : `(${v})`; })
    .replace(/\bln(\d)(\d)\b/g, (_, a, b) => `(${P(a)}+(${L}-1)*${P(b)})`)
    .replace(/\bdm(\d)(\d)\b/g, (_, a, b) => `((110*${L})*(${P(b)}-${P(a)})/(100*(${L}+6))+${P(a)})`)
    .replace(/\bpar(\d+)\b/g, (_, n) => String(P(n)))
    .replace(/\b[bu]?lvl\b/g, String(L))
    .replace(/\bmin\(/g, 'Math.min(').replace(/\bmax\(/g, 'Math.max(');
  if (/[^0-9+\-*/().,\s]/.test(e.replace(/Math\.(min|max)/g, ''))) return null;
  try { return Function(`"use strict";return (${e})`)(); } catch { return null; }
}
// Whole-row tokens. Damage includes the synergy bonus from current points; "256ths" tokens are scaled by 256.
function special(tok, ctx, lvlOf) {
  const s = D.skills[ctx.key];
  const n = ctx.nums;
  const num = (k) => Number(n[k] || 0);
  const sub = (fx) => (fx ? evalFormula(fx, {}, lvlOf, ctx) : null);
  const v = valuesAt(s, ctx.lvl);
  const esyn = 1 + synergyPct(ctx.key, 'EDmgSymPerCalc') / 100;
  const psyn = 1 + synergyPct(ctx.key, 'DmgSymPerCalc') / 100;
  const lsyn = 1 + synergyPct(ctx.key, 'ELenSymPerCalc') / 100;
  const mana256 = Math.max(num('minmana') * 256, (num('mana') + num('lvlmana') * (ctx.lvl - 1)) * 2 ** num('manashift'));
  let m;
  switch (tok) {
    case 'usmc': return mana256;
    case 'mana': return mana256 / 256;
    case 'enma': case 'edmn': return v.emin == null ? null : v.emin * esyn;
    case 'exma': case 'edmx': return v.emax == null ? null : v.emax * esyn;
    case 'enms': case 'edns': return v.emin == null ? null : v.emin * esyn * 256;
    case 'exms': case 'edxs': return v.emax == null ? null : v.emax * esyn * 256;
    case 'edln': case 'edma': return v.len == null ? null : v.len * 25 * lsyn;
    case 'pnma': return v.pmin == null ? null : v.pmin * psyn;
    case 'pxma': return v.pmax == null ? null : v.pmax * psyn;
    case 'sklvl': return ctx.lvl;
    case 'len': return sub(s.calcs?.auralencalc);
  }
  if ((m = tok.match(/^clc(\d+)$/))) return sub(s.calcs?.[`calc${m[1]}`]);
  if ((m = tok.match(/^ast(\d)$/))) return sub(s.calcs?.[`aurastatcalc${m[1]}`]);
  if ((m = tok.match(/^pst(\d+)$/))) return sub(s.calcs?.[`passivecalc${m[1]}`]);
  if ((m = tok.match(/^pa(1[0-2])$/))) return num(`Param${m[1]}`);
  return null;
}

// Damage of a skill's tooltip missile; the missile's own synergy formula applies when it has one, else the skill's.
function missileValue(ctx, i, what) {
  const m = D.missiles[D.skills[ctx.key].dmis?.[i - 1]];
  if (!m) return null;
  const v = valuesAt({ nums: m.nums }, ctx.lvl);
  const lvlOf = (n) => ptsOf(n);
  const symPct = m.sym ? evalFormula(m.sym, {}, lvlOf, { lvl: ctx.lvl, nums: D.skills[ctx.key].nums || {} })
    : synergyPct(ctx.key, 'EDmgSymPerCalc');
  const syn = 1 + (symPct || 0) / 100;
  switch (what) {
    case 'en': case 'nm': return v.emin == null ? null : v.emin * syn;
    case 'ex': case 'xm': return v.emax == null ? null : v.emax * syn;
    case 'eo': return v.emin == null ? null : v.emin * syn * 256;
    case 'ey': return v.emax == null ? null : v.emax * syn * 256;
    case 'el': return v.len == null ? null : v.len * 25;
    case 'rn': return Number(m.nums.Range || 0);
  }
  return null;
}

// ---------- in-game tooltip ----------
// printf-style templates from the game text: %d, %+d, %s, %%.
function fillText(t, args) {
  let i = 0;
  return t.replace(/%%|%(\+?)(d|s)/g, (all, plus, kind) => {
    if (all === '%%') return '%';
    const a = args[i++];
    if (kind === 's') return a ?? '';
    const v = Math.trunc(Number(a) || 0);
    return plus && v >= 0 ? `+${v}` : String(v);
  });
}
const TIP_COLORS = ['#fff', '#ff4d4d', '#00ff00', '#6969ff', '#c7b377', '#696969', '#000', '#d0c27d', '#ffa800',
  '#ffff64', '#008000', '#ae00ff', '#00c800'];
// One description line (function codes: DataGuide skilldesc.js § descline). null = a code or token not supported.
function tipLine([, fn, ta, tb, ca, cb], ctx) {
  const lvlOf = (n) => (ptsOf(n) ? ptsOf(n) + Number(state.bonus || 0) : 0);
  const calc = (fx) => (fx === '' ? 0 : evalFormula(fx, {}, lvlOf, ctx));
  const a = calc(ca), b = calc(cb);
  if (a == null || b == null) return null;
  switch (fn) {
    case 36: { const v = a / (b || 1); return { t: fillText(Math.trunc(v) === 1 || !tb ? ta : tb, [v]) }; }
    case 40: return { t: fillText(ta, [tb]), c: TIP_COLORS[a] || null };
    case 18: return { t: ta };  // plain text line (Werewolf's synergy list: "Lycanthropy")
    case 74: return { t: fillText(ta, [a]) };
    case 75: return { t: fillText(ta, [a, b]) };
    case 76: return { t: fillText(ta, [tb, a]) };
    case 77: return { t: fillText(ta, [tb, a, b]) };
  }
  return null;
}
// The game text is lower case; capitalize the first word and the word after " - ", keep the game's line breaks.
const sentence = (t) => t.replace(/(^\s*|\s-\s)([a-z])/g, (_, p, c) => p + c.toUpperCase())
  .split('\n').map((l) => l.trim()).filter(Boolean);
function tooltip(k) {
  const s = D.skills[k];
  const tip = s.tip;
  if (!tip || !tip.lines.length) return levelBlock(k);
  const pts = ptsOf(k);
  const bonus = Number(state.bonus || 0);
  const ctxAt = (lvl) => ({ lvl, nums: s.nums || {}, key: k });
  // Per-level lines (section 1) are stored bottom-up, so they render in reverse ("over N seconds" follows the damage
  // line, mana cost ends the block); the synergy block (3) is stored top-down with its header first.
  const lines = (sec, lvl) => tip.lines.filter((l) => l[0] === sec)[sec === 1 ? 'reverse' : 'slice']()
    .map((l) => tipLine(l, ctxAt(lvl))).filter(Boolean)
    .map((l) => `<div${l.c ? ` style="color:${l.c}"` : ''}>${esc(l.t)}</div>`).join('');
  const cur = pts ? pts + bonus : 0;
  let html = `<div class="tip"><p class="desc">${sentence(tip.long || tip.short).map(esc).join('<br>')}</p>`;
  html += lines(2, Math.max(1, cur));
  if (cur) {
    html += `<h4>${esc(fillText(D.ui.curLevel, [cur]))}</h4>${lines(1, cur)}`;
    if (cur < 99) html += `<h4>${esc(D.ui.nextLevel)}</h4>${lines(1, cur + 1)}`;
  } else {
    html += `<h4>${esc(D.ui.firstLevel)}</h4>${lines(1, 1)}`;
  }
  const syn = lines(3, Math.max(1, cur));
  if (syn) html += `<div class="syn">${syn}</div>`;
  return `${html}</div>`;
}

// What a synergy row is worth: per point in the source skill and with the current points.
// Formulas that multiply the skill's own value ((base)*(100+levels*par)/100) read as a percentage of the base.
function synergy(b, k) {
  const s = D.skills[k];
  const ctx = { lvl: Math.max(1, ptsOf(k) + (ptsOf(k) ? Number(state.bonus || 0) : 0)), nums: s.nums || {} };
  const f = (lvlOf) => evalFormula(b.fx, b.par, lvlOf, ctx);
  const zero = f(() => 0), one = f((n) => (n === b.f ? 1 : 0)), have = f((n) => ptsOf(n));
  if (zero == null || one == null) return { per: null, now: null, pct: false };
  if (zero !== 0 && /\*\s*\(?\s*100\s*\+/.test(b.fx)) {
    return { per: (one / zero - 1) * 100, now: ((have ?? zero) / zero - 1) * 100, pct: true };
  }
  return { per: one - zero, now: (have ?? zero) - zero, pct: false };
}

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
    case 'damage': return `+${v}% Enhanced Damage`;
    case 'crit': return `${v}% Deadly Strike`;
    case 'crush': return `${v}% Crushing Blow`;
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
const itemShown = (kind) => {
  const off = state.hideKinds || [];
  return !Object.entries(ITEM_FILTER).some(([chip, kinds]) => off.includes(chip) && kinds.includes(kind));
};

// ---------- values at level ----------
// Damage grows by a per-level amount that changes at levels 9, 17, 23 and 29 (EMinLev1..5 / MinLevDam1..5);
// duration by ELevLen1..3 at 9 and 17. Values are in 256ths of a point: value << HitShift >> 8.
function bracket(base, steps, lvl, cuts) {
  let v = base;
  for (let l = 2; l <= lvl; l++) {
    const i = cuts.findIndex((c) => l <= c);
    v += steps[i < 0 ? steps.length - 1 : i] || 0;
  }
  return v;
}
function valuesAt(s, lvl) {
  const n = s.nums || {};
  const num = (k) => Number(n[k] || 0);
  const shift = (v) => (v * 2 ** num('HitShift')) / 256;
  const dmgCuts = [8, 16, 22, 28];
  const out = {};
  if (num('EMin') || num('EMax')) {
    out.emin = shift(bracket(num('EMin'), [1, 2, 3, 4, 5].map((i) => num(`EMinLev${i}`)), lvl, dmgCuts));
    out.emax = shift(bracket(num('EMax'), [1, 2, 3, 4, 5].map((i) => num(`EMaxLev${i}`)), lvl, dmgCuts));
  }
  if (num('MinDam') || num('MaxDam')) {
    out.pmin = shift(bracket(num('MinDam'), [1, 2, 3, 4, 5].map((i) => num(`MinLevDam${i}`)), lvl, dmgCuts));
    out.pmax = shift(bracket(num('MaxDam'), [1, 2, 3, 4, 5].map((i) => num(`MaxLevDam${i}`)), lvl, dmgCuts));
  }
  if (num('ELen')) out.len = bracket(num('ELen'), [1, 2, 3].map((i) => num(`ELevLen${i}`)), lvl, [8, 16]) / 25;
  if (num('mana')) {
    out.mana = Math.max(num('minmana'), ((num('mana') + num('lvlmana') * (lvl - 1)) * 2 ** num('manashift')) / 256);
  }
  return out;
}
function synergyPct(k, field) {
  return D.skills[k].b.filter((b) => b.t === 'synergy' && b.fld === field)
    .reduce((sum, b) => sum + (synergy(b, k).now || 0), 0);
}
function levelBlock(k) {
  const s = D.skills[k];
  const bonus = Number(state.bonus || 0);
  const base = ptsOf(k);
  const lvl = Math.max(1, base + (base ? bonus : 0));
  const v = valuesAt(s, lvl);
  const fmt = (x) => (Math.round(x * 10) / 10).toLocaleString();
  const rows = [];
  const esyn = synergyPct(k, 'EDmgSymPerCalc');
  const psyn = synergyPct(k, 'DmgSymPerCalc');
  if (v.emin != null) {
    const m = 1 + esyn / 100;
    rows.push([`${EL[s.element] || 'Elemental'} damage`, `${fmt(v.emin * m)}-${fmt(v.emax * m)}`,
      esyn ? `+${fmt(esyn)}% from synergies` : '']);
  }
  if (v.pmin != null) {
    const m = 1 + psyn / 100;
    rows.push(['Damage', `${fmt(v.pmin * m)}-${fmt(v.pmax * m)}`, psyn ? `+${fmt(psyn)}% from synergies` : '']);
  } else if (psyn) rows.push(['Damage', `+${fmt(psyn)}%`, 'from synergies']);
  if (v.len) rows.push(['Duration', `${fmt(v.len)} seconds`, '']);
  if (v.mana) rows.push(['Mana cost', fmt(v.mana), '']);
  if (!rows.length) return '';
  return `<div class="lvl"><p>${base ? `Level ${lvl}${bonus ? ` (${base} + ${bonus})` : ''}` : 'Level 1 (preview)'}</p>` +
    rows.map(([a, b, c]) => `<div><span>${esc(a)}</span><b>${esc(b)}</b>${c ? `<em>${esc(c)}</em>` : ''}</div>`).join('') +
    '</div>';
}

// ---------- render: classes, tabs, tree ----------
function renderClasses() {
  document.getElementById('classes').innerHTML = D.classes.map((c) =>
    `<button class="cls${c.code === cls ? ' on' : ''}" data-cls="${c.code}">${esc(c.name)}</button>`).join('');
}
function renderSummary() {
  const n = totalPoints();
  document.getElementById('summary').innerHTML =
    `<span>Points <b>${n}</b></span><span>Level <b>${n ? Math.max(charLevelNeeded(), n + 1) : 1}</b></span>` +
    `<label class="bonus">+Skills <input type="number" min="0" max="40" inputmode="numeric" data-bonus value="${Number(state.bonus || 0)}"></label>` +
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
  // Shared item groups ("kind|scope" -> rows [item, prop, param, min, max]) expand into item boosts.
  const shared = s.ig.flatMap((gk) => D.groups[gk].map(([i, p, a, lo, hi]) =>
    ({ t: 'item', k: gk.split('|')[0], i, p, a, lo, hi })));
  for (const b of [...s.b, ...shared]) {
    if (b.t === 'form' || b.t === 'formsrc') g.form.push(b);
    else if (b.t === 'synergy') g.synergy.push(b);
    else if (b.t === 'skill') g.skill.push(b);
    else if (b.t === 'grant') { if (FEATURES.grants) g.grant.push(b); }
    else if (!FEATURES.magicAffixes && ['prefix', 'suffix'].includes(D.items[b.i][0])) continue;
    else if (!itemShown(D.items[b.i][0])) continue;
    else (LEVEL_KINDS.has(b.k) ? g.levels : g.damage).push(b);
  }
  return g;
}
function bar(v, max) {
  const w = max > 0 ? Math.max(2, Math.round((Math.abs(v) / max) * 100)) : 0;
  return `<span class="bar"><span style="width:${w}%"></span></span>`;
}
// Synergy sources as icon + name links only; their effects are in the tooltip's "Receives Bonuses From" block.
function synergyRows(list) {
  const seen = new Set();
  return list.filter((b) => !seen.has(b.f) && seen.add(b.f)).map((b) => {
    const src = D.skills[b.f];
    return `<li class="row" data-jump="${esc(b.f)}">` +
      (src ? `<span class="ic sm" style="${iconStyle(src)}"></span>` : '') +
      `<span class="txt"><b>${esc(skillName(b.f))}</b></span></li>`;
  }).join('');
}
// Shapeshift form effects, valued at the form skill's level (points + gear bonus; level 1 preview with no points).
// A skill feeding a form effect through its own row (Lycanthropy's life % and duration), valued at its level.
function formSrcRow(b, lvlOf) {
  const f = D.skills[b.f];
  const v = evalFormula(b.term, {}, lvlOf, { lvl: Math.max(1, lvlOf(sel)), nums: D.skills[sel].nums || {} });
  const amount = v == null ? '' : b.st === 'form_duration' ? `+${+(v / 25).toFixed(1)} seconds`
    : `${v > 0 ? '+' : ''}${Math.round(v)}%`;
  return `<li class="row" data-jump="${esc(b.f)}"><span class="ic sm" style="${iconStyle(f)}"></span>` +
    `<span class="txt"><b>${esc(f.name)}</b>${ptsOf(sel) ? '' : ' <em>level 1 preview</em>'}<br>` +
    `<span class="v">${esc(`${amount} ${b.lb} in ${f.name} form`)}</span></span></li>`;
}
function formRows(list) {
  const lvlOf = (n) => (ptsOf(n) ? ptsOf(n) + Number(state.bonus || 0) : 0);
  return list.map((b) => {
    if (b.t === 'formsrc') return formSrcRow(b, lvlOf);
    const f = D.skills[b.f];
    const lvl = Math.max(1, lvlOf(b.f));
    const v = evalFormula(b.fx, {}, lvlOf, { lvl, nums: f.nums || {} });
    const amount = v == null ? '' : b.st === 'form_duration' ? `${+(v / 25).toFixed(1)} seconds`
      : `${v > 0 ? '+' : ''}${Math.round(v)}%`;
    const also = b.also.length ? ` (with ${b.also.map(skillName).join(', ')})` : '';
    return `<li class="row" data-jump="${esc(b.f)}"><span class="ic sm" style="${iconStyle(f)}"></span>` +
      `<span class="txt"><b>${esc(f.name)}</b>${ptsOf(b.f) ? '' : ' <em>level 1 preview</em>'}<br>` +
      `<span class="v">${esc(amount ? `${amount} ${b.lb}` : b.lb)}${esc(also)}</span></span></li>`;
  }).join('');
}
function skillRows(list) {
  const seen = new Set();
  return list.filter((b) => !seen.has(b.f + b.k) && seen.add(b.f + b.k)).map((b) => {
    const src = D.skills[b.f];
    const what = (b.k === 'enemyres' && !D.skills[sel].element ? 'lowers enemy physical resistance' : SKILL_EFFECT[b.k] || b.k) +
      (b.w && WEAPON[b.w] ? ` with ${WEAPON[b.w]}` : '');
    return `<li class="row" data-jump="${esc(b.f)}"><span class="ic sm" style="${iconStyle(src)}"></span>` +
      `<span class="txt"><b>${esc(src.name)}</b> <em>${esc(clsInfo(src.cls).name)}${b.via === 'aura' ? ' · aura/curse' : ''}</em>` +
      `<br><span class="v">${esc(what)}</span></span></li>`;
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
  const body = { form: formRows, synergy: synergyRows, skill: skillRows,
    levels: (l) => itemRows(l, sel, itemLine), damage: (l) => itemRows(l, sel, itemLine),
    grant: (l) => itemRows(l, sel, grantLine) };
  el.innerHTML =
    `<div class="head"><span class="ic big" style="${iconStyle(s)}"></span><div>` +
    `<h2>${esc(s.name)}</h2><p>${esc(s.tab)}${s.element ? ` · ${EL[s.element]}` : ''} · req. level ${s.reqlevel}` +
    `${s.req.length ? ` · needs ${s.req.map(skillName).map(esc).join(', ')}` : ''}</p></div>` +
    `<div class="alloc"><button data-add="-1">−</button><b>${p}</b><button data-add="1"${reqMet(sel) ? '' : ' disabled'}>+</button></div></div>` +
    tooltip(sel) +
    `<div class="chips">${Object.keys(ITEM_FILTER).map((c) =>
      `<button class="chip${(state.hideKinds || []).includes(c) ? '' : ' on'}" data-chip="${c}">${c}</button>`).join('')}</div>` +
    KIND_ORDER.filter((x) => g[x].length).map((x) =>
      `<details data-sec="${x}"${open[x] !== false ? ' open' : ''}><summary>${KIND_TITLE[x]} <i>${x === 'skill' ? new Set(g[x].map((b) => b.f + b.k)).size : x === 'synergy' ? new Set(g[x].map((b) => b.f)).size : g[x].length}</i></summary>` +
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
  else if (t.dataset.chip) {
    const off = new Set(state.hideKinds || []);
    off.has(t.dataset.chip) ? off.delete(t.dataset.chip) : off.add(t.dataset.chip);
    state.hideKinds = [...off];
  } else if ('reset' in t.dataset) { for (const [k] of classSkills(cls)) delete pts()[k]; }
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
document.addEventListener('change', (e) => {
  if (!e.target.matches('[data-bonus]')) return;
  state.bonus = Math.max(0, Math.min(40, Number(e.target.value) || 0));
  save(); renderDetail();
});
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (d.dataset?.sec) { state.open = { ...(state.open || {}), [d.dataset.sec]: d.open }; save(); }
}, true);

render();
