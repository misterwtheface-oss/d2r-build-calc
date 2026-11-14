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

## Open
- [ ] Level 3: how the engine applies masteries / pierce / -resistance (stacking, caps); D2MOO as reference.
- [ ] Values at level cover skill-row damage only; skills whose damage lives on their missile show none yet.
- [ ] Mastery / pierce / -resistance not yet applied to the damage numbers (needs the Level 3 stacking rules).
- [ ] Item filters still missing: class-only items, ladder-only runewords, unspawnable items.

## Build
`python tools/build_data.py --strict` (needs `_d2r_extract/data/derived/skills.json` from `_d2r_extract/tools/build_boosts.py`).
