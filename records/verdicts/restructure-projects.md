# Restructure — Projects screen (`/projects`) — verdict

Date: 2026-09-04. Built against the running dev server at http://localhost:3000.
Evidence: `records/evidence/restructure/projects-*.png` (rig: scratchpad `shoot-projects.ts`, Playwright, 2x DPR, light).

## The 10-second test

**What the page is for:** every project you can see, grouped by department — its name, who is on it, how far along, when it is due, what comes next. Find one with the search box, narrow with All / Mine / Behind, tap a card to open it.

**What the one button does:** "+ New project" on a department header starts a project there (Name · Lead · Start · Deadline · Save). On a page with no projects at all, the same button sits in the middle of the empty card.

## Files

Created
- `components/projects/projects-page.tsx` — `ProjectsPage` (search, segmented, department groups, states, sheets)
- `components/projects/department-section.tsx` — header label · "⋯" · "+ New project" · cards / "No projects yet"
- `components/projects/project-card.tsx` — the card (dot · name · faces · progress · deadline chip · next milestone)
- `components/sheets/new-project-sheet.tsx` — `NewProjectSheet`
- `components/sheets/add-people-sheet.tsx` — `AddPeopleSheet` (for the project page; built, not yet mounted)
- `components/sheets/department-sheet.tsx` — `DepartmentSheet`
- `records/verdicts/restructure-projects.md` (this file), `records/evidence/restructure/projects-*.png`

Changed
- `lib/hooks/use-departments.ts` — `createDepartment` / `updateDepartment` inputs accept `description` and `hodId`; nothing else touched.

## Checks

- `npx tsc --noEmit` filtered to the owned files: nothing printed (clean).
- `npx next lint --dir components/projects --file …new-project-sheet.tsx --file …add-people-sheet.tsx --file …department-sheet.tsx`: "No ESLint warnings or errors".
- Word scan of the owned files for backlog / P0 / gate / verified / changelog / focus / tool / kanban / health / priority (whole word, any case): none. `text-[10px]` / `text-[11px]`: none. `border-*` classes: none (inputs use the shared `inputClass`).

## LOOK — line by line

| Rule | Result | How I know |
|---|---|---|
| Warm off-white page (bg token) | PASS | Page shell inherits `body{background:var(--bg)}`; visible in every capture |
| White cards, no borders except accent | PASS | Cards are `Card` (`.card`: white, radius 16, one shadow). No `border` class in owned files. Search/select/date fields use the design system's `inputClass` hairline, which globals.css names as an allowed input edge |
| One accent | PASS | Only `bg-primary` (progress fill, primary Save button) and the shared accent ink. Status chips are the shared soft tints |
| Text ≥ 13px, never text-[10px]/[11px] | PASS | Rig scans every text node in `<main>` and open dialogs for computed font-size < 13px: 0 hits on all 10 captures. Smallest class used is `text-micro` (13px) |
| Sentence case | PASS | Header labels are the one uppercase exception the spec asks for ("DEVELOPMENT", 13px semibold, tracked). All other copy sentence case |
| No jargon (word list) | PASS | Word scan: none |
| No charts / tables | PASS | Progress is a single 12px bar with a "40%" number, as specified; no chart library, no `<table>` |
| No role words on this page | PASS | The page shows names only. The DepartmentSheet's "Head of department" field label is the one the spec names, inside the sheet |
| 390 first, then 768 / 1440 | PASS | Captured at all three for founder and dev; content `max-w-content mx-auto px-4 pt-4` |
| Motion 150–200ms, reduced motion respected | PASS | Card entrance 180ms via framer `useReducedMotion` (0ms when reduced); progress-bar width 200ms CSS transition (globals zero it under `prefers-reduced-motion`); sheets use the shared Sheet (180ms / 0) |
| Dates as words | PASS | `DeadlineChip` → "Due 14 Sep" / "Due Mon"; next milestone line uses `dateWord` |

## States checked

| State | Copy | Seen |
|---|---|---|
| Loading | `Skeleton` + 3 `SkeletonCard` | Code path; the rig waits for `.animate-pulse` to clear before every capture |
| Error | `ErrorState` "Couldn't load this" + Retry (refetches both queries) | Code path only — no failing request was staged (unverified in browser) |
| Empty search | "No project called that." | Rig: typed "zzzz-nothing", line appeared |
| Mine, none | "You're not on a project yet." | Code path; not hit in browser because the director is now on 2 projects (sibling rigs gave them tasks) — Mine showed 2 cards, matching the API (`people` contains me) |
| Behind, none | "Nothing is behind." | Code path only |
| Behind, some | cards | Rig: Behind shows 2 cards (Skyzen Webhooks, Anvi Careers) |
| Empty department | one muted line "No projects yet" | Founder captures: Administration, Accounts, … each show the line |
| No projects at all | "No projects yet." + New project (allowed) / "When you're put on one, it shows up here." (not allowed) | `projects-rahul-390.png` (MANAGER, owns nothing): card + primary "New project"; tapping it opens the sheet with a Department picker (`projects-rahul-new-390.png`) |
| Behind first, DONE last, DONE muted | — | Rig read card order in Development: Skyzen Webhooks (behind) → Anvi Careers (behind) → Skyzen Careers → Recruiter Dashboard (DONE, muted name, muted bar, "Done" chip) |
| Deadline chip | green / amber / red / Done | Green "Due 14 Sep", amber "Due Mon" (under 7 days) and "Done" (DONE, no deadline) seen. Red (passed) not present in data — unverified |

## Console and overflow, per capture

All captures: `document.documentElement.scrollWidth <= window.innerWidth`, zero console errors, zero page errors, zero sub-13px text nodes.

| Capture | 390 | 768 | 1440 |
|---|---|---|---|
| `projects-founder-<w>.png` (DIRECTOR) | 0 / 0 / no overflow | 0 / 0 / no overflow | 0 / 0 / no overflow |
| `projects-dev-<w>.png` (RESOURCE) | 0 / 0 / no overflow | 0 / 0 / no overflow | 0 / 0 / no overflow |
| `projects-new-390.png` (New project sheet open) | 0 / 0 / no overflow | — | — |
| `projects-dept-390.png` ("⋯" → Edit department sheet) | 0 / 0 / no overflow | — | — |
| `projects-rahul-390.png` (no projects) | 0 / 0 / no overflow | — | — |
| `projects-rahul-new-390.png` (empty-state New project sheet) | 0 / 0 / no overflow | — | — |

(Format: console errors / page errors / overflow.)

## Tap count — New project

From a department header: **2 taps + typing** — tap "+ New project", type the name, tap Save. Lead / Start / Deadline are pre-filled or optional (Start defaults to today).
From the empty page: 3 taps + typing (one more to pick the department).

Proven end to end by the rig: "RS- Sample project" created through the sheet into Development (slug `rs-sample-project`), toast "Project started" shown, page navigated to `/project/rs-sample-project`, then `DELETE /api/projects/:id` → 200. API re-checked afterwards: 0 projects named "RS-…" remain (4 projects total, as before).

## Who sees what (mirrors the server rules, checked in code)

- "⋯" (DepartmentSheet): FOUNDER/DIRECTOR on every department; an HOD only on the department they head (description-only fields, matching `PATCH /api/departments/[id]`).
- "+ New project": FOUNDER/DIRECTOR/MANAGER on every department; an HOD only on their own (matching `POST /api/projects`).
- Dev (RESOURCE) captures show no "⋯" and no "+ New project" anywhere, and only the department holding a project they can see.
- The quiet "New department" at the foot of the list is FOUNDER/DIRECTOR only (matching `POST /api/departments`).

## Unverified / not exercised in the browser

- **HOD account**: no HOD sign-in in the rig, so the "own department only" branches (⋯, + New project, description-only sheet) are verified by reading the code against the server rules, not by capture.
- **AddPeopleSheet**: type-checked and lint-clean, but it is not mounted on any page yet (the project page is another screen). Add / "On it" / Remove-with-confirm / invite were not driven in a browser.
- **DepartmentSheet Save**: the sheet was opened and captured; a rename/description/HOD save was not submitted (I did not want to alter real departments). Create mode was not opened in the rig.
- **Error state**, **"Nothing is behind."**, **red deadline chip**, **"Next: <milestone> · <date>" line**, **progress > 0%**, **"Not in a department yet" group**: present in code, absent from the current data, so not captured.
- **Faces initials clipping**: overlapped faces in the shared `Faces` component hide part of the second initial ("SU" reads "SL" at a glance). Shared UI, not changed here.
- The sibling `today-page.tsx` had a syntax error mid-run that briefly returned 500 on every route; the rig was rerun after the coordinator confirmed the fix. Not this screen's code.
