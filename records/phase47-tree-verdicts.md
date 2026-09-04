# Phase 47 — calm task tree: name + one status + clearer nesting — verdicts

Evidence in `records/evidence/phase47/`. Presentation only — the tree ROW and the
indent guides. No task data, status, gate logic, or detail-panel content changed.

## Change 1 — calm rows (name + ONE status)
The default row is now **`[completion checkbox] task name … [one status]`** and nothing
else. Moved OFF the row (still fully present + editable in the DETAIL PANEL): the
%-progress count, the priority flag, the due-date pill, the gate cluster / Verified tag,
the deliverable + comment (content) icons, tags, the schedule warning, the assignee chip,
the blocked-below dot, the personal-colour dot.

**The ONE status, and how the redundancy collapsed:**
- The **checkbox glyph** carries done-ness (and encodes blocked = dashed-red, in-progress =
  filled ring, backlog = hollow) — it is the completion control, unchanged.
- **Dev / lead**: the single status label is the **work-status pill** (In progress / On hold /
  Blocked / Planned / Cancelled). Backlog and Done show no pill — the checkbox already says
  so. The team's build gates (incl. Verified) left the row for the panel.
- **Manager** (phase-20 rule): the single status is their **Verified sign-off** chip (● amber =
  signed off, ○ = awaiting) — "Verified-as-their-status." The read-only checkbox glyph still
  carries the work state, so the manager sees work-state (glyph) + their concern (Verified)
  with no third signal. The redundant work pill + separate Verified tag collapsed into one.

**Subtle hints kept (bias minimal):**
- **Overdue**: a small red dot (6px, `--danger`) — NOT the whole date pill — so late work still
  catches the eye. Confirmed rendering `rgb(239,68,68)`.
- **Priority**: OMITTED from the row (it's in the panel). No P0 marker on the row — minimal per
  the owner.
- **Assignee, tags, progress, gates, dates, links, notes**: all OMITTED from the row, all in
  the panel.

Mobile has no hover toolbar, so every row keeps one calm, always-visible **Open-details**
icon (`sm:hidden`) into the full detail; desktop uses the hover toolbar's Open-details.

## Change 2 — clearer nesting
- **Guide rails**: a soft vertical rail per ancestor level in a new `--guide` token (`#bcc9e2`,
  a touch stronger than `--line` so the structure reads), continuous down the tree
  (`self-stretch`). The **innermost** level draws a short horizontal **elbow tick** (an ├), so
  a child visibly hangs off its parent.
- **More indent per level**: `INDENT_WIDTH` 20 → **24px**.
- **Vertical breathing**: `py-0.5` per row; rails stay continuous.
- **Parents read heavier**: a parent's title is `font-medium` vs a leaf's normal weight.
- **Colour noise down**: the row's competing pills are gone, so the checkbox + one status are
  what read.
- **Deep + mobile**: at depth 4 the nesting reads clearly; at 390 titles truncate and there is
  **no horizontal scroll** (`documentElement.scrollWidth === clientWidth` asserted).

## Per-screen verdicts
| Screen | File | Verdict |
|---|---|---|
| Dev/lead tree @1440 (+ a 4-level branch) | `p47-tree-lead-1440.png` | **PASS.** Genuinely calm: `[✓] name [status]`, one signal each. Nesting obvious via rails + elbows. Duplicate names (`Signature verification` ×2, `Add replay-window check` ×2) sit in different branches and read fine. |
| Dev/lead tree @390 | `p47-tree-lead-390.png` | **PASS.** Same calm rows; rails/elbows clear at depth 4; titles truncate, no h-scroll; the mobile Open-details icon gives panel access. |
| Manager tree @1440 | `p47-tree-manager-1440.png` | **PASS.** One status = Verified (● signed off / ○ awaiting); checkbox glyph still carries work-state; read-only rail intact (Edit toggle). Verified-as-their-status per the manager rule. |
| Detail panel @1440 | `p47-panel-1440.png` | **PASS (nothing lost).** Status, Priority, Assignee, Est. completion, Tags, Colour, Group colour, Gates (2/5 incl. Verified), Description all present + editable. |
| Detail panel @390 | `p47-panel-390.png` | **PASS.** Full detail as a bottom sheet. |

## Function re-check
Presentation only; handlers unchanged. Verified live (`scripts/_viz_tree_interact.ts`):
expand/collapse toggles children, complete via checkbox persists DONE, open panel from a
row, add subtask creates a child — ALL PASS.

## Judgment
**Genuinely simpler** — the eye lands on the name, then the one status. **Nesting is clear**
— rails + elbows + more indent + parent weight make parent→child obvious at depth. **Nothing
critical is lost** — every removed signal is in the panel (one click), and overdue keeps a
subtle dot on the row. Manager verification and dev/lead gates are unaffected in the panel.
