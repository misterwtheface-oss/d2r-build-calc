# D2R Skill Calculator — Progress

Goal (user, 2026-11-13): high-fidelity skill calculator using the game's own art; pick a skill and see every source
that boosts it (other skills, items, anything else).

## Status
- 2026-11-13: first local build. 8 classes (incl. Warlock), original HD tree panels + icons in their real slots,
  points allocation with prerequisites and required level, detail panel per skill: synergies (live value from your
  points), other skills (masteries, auras, curses), item skill levels, item damage / resistance, items that grant it.
- Not deployed. Public release waits on the user's call about shipping Blizzard art and fonts (see Open).

## Open
- [ ] User decision: deploy publicly (GitHub Pages) with game art + fonts, or keep local only.
- [ ] Level 3: how the engine applies masteries / pierce / -resistance (stacking, caps); D2MOO reference, user approved? 
- [ ] Physical-damage boosters (weapon masteries, Enhanced Damage, auras like Might / Fanaticism) not yet tagged.
- [ ] Skill tooltips (damage at level N) not built; formulas use lnXY / dmXY level tables still unparsed.
- [ ] Item filters (class-only items, ladder-only runewords, spawnable).

## Build
`python tools/build_data.py --strict` (needs `_d2r_extract/data/derived/skills.json` from `_d2r_extract/tools/build_boosts.py`).
