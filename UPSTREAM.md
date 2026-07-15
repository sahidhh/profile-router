# Upstream (OMP) — tracked items

These belong to `@oh-my-pi/pi-coding-agent` (the OMP config/base prompt), **not**
to this repo's router logic. They are recorded here because GitHub access is
scoped to `sahidhh/profile-router` and an issue could not be filed on the OMP
repository directly. Move each to an OMP issue when that repo is reachable.

| # | Item | Notes |
|---|------|-------|
| 1 | `<critical>` tag duplication | Same directive emitted twice in the base prompt. |
| 2 | "NEVER consider token budgets" vs. token-saving skills | Base directive contradicts the token-saving skills OMP also ships. |
| 3 | LaTeX / mermaid permissions on lite tiers | Rendering permissions granted on tiers that can't use them. |
| 4 | `grep`-not-`grep` typo | Self-referential typo in the tool-guidance text. |
| 5 | Tone-directive duplication | Tone instruction repeated across sections. |
| 6 | `GPU: Sharing Monitor` | Malformed / mislabeled status-line entry. |

Status: not patched in this repo by design (OMP-owned prompt text). See
DECISIONS.md "Bug → Task Map / Not in scope" for the original triage.
