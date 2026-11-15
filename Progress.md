# D2R Skill Calculator — Progress

Goal (user, 2026-11-13): high-fidelity skill calculator using the game's own art; pick a skill and see every source
that boosts it (other skills, items, anything else).

## Status
- 2026-11-13: first local build. 8 classes (incl. Warlock), original HD tree panels + icons in their real slots,
  points allocation with prerequisites and required level, detail panel per skill: synergies (live value from your
  points), other skills (masteries, auras, curses), item skill levels, item damage / resistance, items that grant it.
- 2026-11-13 (2): LIVE misterwtheface-oss.github.io/d2r-build-calc (user: publish with game art + fonts). Raw formula
  tokens removed from effect rows. Added physical boosts (weapon masteries with weapon type, Might / Concentration /
  Fanaticism, Amplify Damage / Decrepify, item Enhanced Damage / Deadly Strike / Crushing Blow), values at level
  (damage with synergy bonus, duration, mana; formulas confirmed by Blizzard's DataGuide), +Skills gear input, item
  filter chips. data.js 4.6 MB -> 0.5 MB via shared item groups.
- 2026-11-13 (3): in-game tooltips from skilldesc lines + game text (per-level lines bottom-up, code 18 plain text,
  missile values), shapeshift forms (form-only skills, Lycanthropy), synergy labels fixed. User trims: Synergies =
  icon links only, no Form effects section, no +All Skills / +Class Skill Levels item rows.
- 2026-11-14: Search view (first tab): type a skill, item or effect; lists the skill, its synergy sources, other
  skills that boost it, and items (with the game's inventory art) that raise, pierce, grant or proc it. Tree detail
  panel now shows Synergies only (other sections hidden by `FEATURES.detailEffects`); item filter chips removed.
  Item art: `assets/items.webp` sheet built from `data/hd/global/ui/items` (provenance in the extract's skills.json).
- 2026-11-14 (2): Runewords codex (tab after Search): all 99 enabled runewords, rune icons in order, bases, sockets,
  level, patch / ladder window, the runeword's lines in game wording and what its runes add per base (weapon, helm /
  body armor, shield); one search box filters on any of it. Shares the search panel (one query per panel).
  Fix: skill and item names no longer come from the Chinese-region overlay strings (Critical Strike showed as
  "Dangerous Strike").
- 2026-11-15: Runewords: sort buttons Level / Sockets (tap again to flip, ties by level then name; kept in saved
  state). Weapon runewords show a fixed strip of the 15 socketable weapon classes (sword ... orb), lit where a base of
  that class takes the runeword at its socket count (weapons.txt gemsockets; e.g. 5-socket Call to Arms skips claw,
  dagger, wand, club, orb); the base text names those classes. Data: extract `build_runewords.py` (`weapons`, `other`,
  `weapon_classes.json`).

## Open
- [ ] Runeword codex: base-item filter (e.g. only 4-socket armor) and per-base totals (runeword + runes summed)
  if wanted.
- [ ] Level 3: how the engine applies masteries / pierce / -resistance (stacking, caps); D2MOO as reference.
- [ ] In-game tooltips (skilldesc lines, game text) render ~90% of lines. Still dropped: line codes 13 / 31 / 34 / 41 /
  78 / 79 (summon life and damage, curse divisor, undocumented), mastery tokens madm / math / macr / mael,
  missile-damage lines for missiles not listed in descmissile (e.g. Meteor's burning ground). Check dsc2 line order.
- [ ] Mastery / pierce / -resistance not yet applied to the damage numbers (needs the Level 3 stacking rules).
- [ ] Item proc lines with a level of 0 in the game data (Snowclash: gethit-skill Blizzard 5 / 0) show "level 0";
  find how the game resolves it.

## Build
`python tools/build_data.py --strict` (needs `_d2r_extract/data/derived/skills.json` from `_d2r_extract/tools/build_boosts.py`).
