# ARSENAL — Game Design for profile-router

The theme layer over the profile-router OMP extension. Every mechanic maps to
a real OMP knob; nothing changes agent behavior for flavor reasons — **gear
changes behavior, theme never does.**

**Build status legend:** ✅ shipped · ⏸ deferred (no read surface) · 💤 not built (dessert)

For *how* each shipped mechanic works, see `MANUAL.md` §8; for the *verified
API evidence* behind each, see `API-FINDINGS.md` §(f); for the *design
trade-offs*, see `DECISIONS.md` Phase 5.

---

## The Frame

You are a Hunter. Tasks are Gates. Models are your cultivation rank. Tokens are
mana. The terminal is the dungeon. Builds are classes. Subagents are summons.

---

## Class Roster (builds — the gear axis)

Classes are **keyword-less profiles** in `bundles.json`: never auto-classified,
equipped deliberately via `/equip <name>`.

| Class | Status | Loadout | Real config |
|---|---|---|---|
| 🕳 **Wretch** | ✅ | Haiku, low; `read`/`grep`/`glob`; subagents off | The "deprived" SL1 run — least possible spend |
| 🛡 **Vanguard** | ✅ | Sonnet, medium; full tools; subagents off | The daily driver, ~80% of sessions |
| 🔮 **Archmage** | ✅ | Opus, high; full tools; subagents off | Architecture/design boss fights; delegates to no one |
| 👑 **Monarch** | ✅ | Sonnet, low; `read`/`grep`/`glob`+`task`; **subagents on, `maxMinions: 3`** | Thin cheap orchestrator commanding expensive soldiers |
| ⚖ **Sentinel** | ✅ | Sonnet, high; `read`/`grep`/`glob`; **`edit`/`write`/`bash` hard-blocked** | A reviewer that physically cannot modify files |
| 🗡 **Berserker** | ✅ | Sonnet, medium; full tools; **`noConfirm: true`** | Long unattended runs; skips model-switch dialogs |

---

## Mechanics (cross-class systems)

- 🔥 **Hollowing & Embers** — ✅ Built first. On `session.compacting`, the active
  profile's rules are re-injected into the compaction summary so guardrails
  survive it (`🔥 Ember restored`). The most-critical integration gap, wearing
  a costume.
- ⚖ **Sentinel oath** — ✅ `disabledTools` hard-blocks mutating tools at
  `tool_call` (union merge — a co-matched profile can't dilute the oath).
- 👑 **Summon Cap** — ✅ `maxMinions` blocks the (cap+1)-th live `task`:
  *"Your army is at its limit, Monarch."*
- 🩸 **Poison** — ✅ `credential_disabled` sets a persistent `☠ fallback`
  marker so you never unknowingly run on the backup model.
- 🗡 **Shadow Extraction (`/arise`)** — ✅ `/arise [profile]` asks the model to
  distill one rule and **auto-captures** its answer (via `message_end`) for
  your approval; `/arise <profile> <rule>` persists one directly. The rule
  library grows from experience. One rule per extraction, manual approval always.
- 🃏 **The Deck** — ✅ (discipline) Keep each build's `skills` ≤ 8 — every loaded
  skill costs context tokens, so deck-building is token budgeting.
- 🏆 **Hunter Rank (`/rank`)** — ✅ **Persistent** tracker (`hunter-rank.json`):
  gates cleared per class, bosses (high-thinking gates) fought, bonfires
  (commits) lit. Survives across sessions.
- 🩸 **Bleed** (context-fill meter) — ⏸ No live token/context-size read surface.
- ⚡ **Elixir** (rate-limit headroom) — ⏸ Rate-limit state is only observable
  reactively on a 429; no headroom read.

---

## What NOT to build (honesty)

- ❌ XP-gated features — self-imposed friction on your own tools.
- ❌ Matchmaking/leaderboards — you're solo.
- ❌ Any mechanic that changes agent behavior for flavor reasons.
- ❌ Elaborate lore injected into prompts — every flavor token in a system
  prompt is money spent on vibes the model doesn't need. (Class `rules` are
  kept functional, not decorative.)

---

## Build order (by real value)

1. ✅ Hollowing/Embers — critical correctness
2. ✅ Sentinel — real safety property
3. ✅ Monarch + summon cap — real cost architecture
4. ✅ Poison marker — real UX
5. ✅ /arise — novel, contained
6. ✅ Classes, /equip, /rank, Deck discipline — dessert
7. ⏸ Bleed, Elixir — deferred: no read surface exists
