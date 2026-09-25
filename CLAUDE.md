# iSched — Claude Code Project Instructions

## Project Overview

**iSched: A Web-Based Scheduling Management System With Constraint-Based Assignment Using Backtracking Algorithm**
Southern Luzon State University – Lucban Campus
Researchers: Gunay, Cherry Rose D. · Hernandez, Norilyn E. · Orbeta, Ramielle Antonette R.

This is a capstone project. All features must satisfy the panelist compliance requirements documented in the project's Compliance Report.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router (`"use client"` pages) |
| Database ORM | Prisma v7 with PrismaPg adapter |
| Prisma client output | `./prisma/generated/prisma/client/client` — always import from here |
| Auth | Supabase Auth (password + Google OAuth). Chairs only — faculty do NOT log in. |
| Data fetching | TanStack Query (React Query v5) |
| UI | shadcn/ui + Tailwind CSS |
| Brand colors | Green `#1B4332`, Gold `#D4AF37` |

---

## Role Mapping (Critical — Compliance Requirement)

The panelist required a strict workflow hierarchy. The role names in the DB do **not** match the UI labels:

| DB Role | Real-world title | Capabilities |
|---|---|---|
| `DEAN` | **Dean** (one per department) | Approves the accounts of **their own department** (User Management is Dean-only) and **approves or returns (with a note) their department's schedule** once its Program Chairpersons submit it (2026-09-26); reads **System Logs** (`/dashboard/logs`: department activity from `AuditLog`, every department schedule, every scheduled class, Subject Summary, room occupancy in their buildings). **Read-only** on every other page — the only write routes that accept DEAN are `PATCH/DELETE /api/users/[id]` and `approve`/`reject` on `/api/schedules/[id]/workflow`. |
| `SUPER_ADMIN` | **Department Chairperson (CAS)** | GEC/GEL + CAS major subjects; sees all colleges. Publishes only their **own CAS schedule** (no Program Chairpersons there); every other department's schedule is approved by its Dean (2026-09-26). May still Reset / Unpublish a published schedule. System Logs (all five tabs) across every department. No longer approves accounts or schedules and no longer touches PATHFit/NSTP. |
| `ADMIN` | **Program Chairperson** | Their own program's major subjects; **marks them done**, then submits the department's schedule for the Dean's approval once **every** Program Chairperson of the department is done. System Logs (all five tabs) for their own department. |
| `PATHFIT` | **PATHFit Director** (exactly one account) | Generates (`lib/services/pathfit-generation.ts`, TBA/GYM) and adds/edits/deletes PATHFit entries in every college's schedule. Nothing else. |
| `NSTP` | **NSTP Director** (exactly one account) | Adds/edits/deletes NSTP entries in every college's schedule (never auto-generated), including **merged classes** for two or more sections (§1d). Nothing else. |
| `FACULTY` | Faculty member | **No login.** A data record only (name on schedules, availability, specialization). Receives their schedule via the printed Teaching Load export from the DC/PC. |

**Terminology (2026-09-19):** the word "cluster" is gone from the UI and docs. A CAS Department Chairperson heads a
**department head area** (Social Sciences; Language, Communication, and Humanities; Mathematics and Natural Sciences) and
the three of them are "the three department heads". The DB/model names (`FacultyCluster`, `User.clusterId`,
`Program.clusterId`, `Faculty.clusterId`, `GecFinalization.clusterId`, `CLUSTER_GEC_CODES`) are unchanged — only
user-facing strings, comments in new code and this file say "department head".

Role vocabulary + helpers live in `lib/roles.ts` (client-safe): `ROLE_LABELS` (the exact titles shown everywhere —
Dean, Department Chairperson, Program Chairperson, PATHFit Director, NSTP Director), `isUniversityWideRole` (SUPER_ADMIN /
PATHFIT / NSTP may switch colleges; DEAN and ADMIN are locked to their own), `geUnitOwnsCode`, `SINGLETON_ROLES`.
The sign-up form lists roles by these titles only (no descriptions).

**Account approval (`resolveAutoApproval` in `lib/auth.ts`, mirrored by `/api/auth/bootstrap-status` on the sign-up
form):** the **first Dean of a department is auto-approved**, a second Dean for the same department is refused; the
**single PATHFIT and NSTP accounts are auto-approved** and a second one is refused (sign-up form blocks it up front,
`PATCH /api/users/[id]` refuses to approve / re-role into a duplicate); DC and PC sign-ups wait for **their department's
Dean** (`notifyDepartmentDeans`). The very first SUPER_ADMIN in an empty system is still bootstrapped automatically.
PATHFIT / NSTP users are placed in the CAS department (their subjects live there).
**Duplicate accounts / sign-in notices (2026-09-23):** the sign-up form asks the public `POST /api/auth/email-status`
(User table, faculty `manual-` stubs ignored) before `signUp` and shows the "Account already exists" popup. `/auth/callback`
checks whether the account existed before: Continue with Google on the sign-up page for an existing account keeps its
role (no metadata update) and lands on `/dashboard?notice=existing_account`; a first Google sign-in → `google_ready`
("You're all set!"), a password confirmation link → `email_confirmed`. `components/auth/auth-notice.tsx` (rendered by
the dashboard layout, also over the pending-approval screen) shows the popup with a Continue button.

### Organizational Structure at SLSU-Lucban

**SUPER_ADMINs = CAS Department Heads** — all linked to the single `CAS` department in the DB.
- All GEC/GEL subjects live in the `CAS` department (no SS/LLH/MNS sub-departments).
- CAS programs (BAComm, BAHist, BSBio, BSMath, BAPsych) also live in the `CAS` department.
- Multiple SUPER_ADMIN users can share the same `CAS` departmentId — they all manage the same pool.

**NSTP is NOT auto-generated** — the NSTP Director account schedules it by hand. **PATHFit is generated by the
PATHFIT Director account's own Generate** (`POST /api/schedules/[id]/generate` → `runPathfitGeneration`): for
every section of the schedule's department, ONE continuous block (a 2-hour class is a single 2-hour session, never
split across days), faculty defaulted to the `TBA` placeholder (`Faculty.employeeId = "TBA"`, entry
`facultyName = "TBA"`) and room fixed to the `GYM` placeholder (`Room.code = "GYM"`, building `GYM`). Dept Chair
and Program Chair runs never touch PATHFit or NSTP (`EXCLUDED_AUTO`). GYM/TBA are shared placeholders — exempt from
room/faculty double-booking checks everywhere (engine, `entry-validation.ts`, `term-conflicts.ts`, cross-schedule
checks). Placeholder helpers: `lib/sentinels.ts` (client-safe constants) and `lib/services/sentinels.ts` (upserts;
also `prisma/seed-sentinels.ts`). Only the matching Director may add/edit/delete PATHFit or NSTP entries
(`lib/services/subject-permissions.ts`). **TBA is hidden from the UI (2026-09-23)**: `GET /api/faculty` returns the
TBA faculty to the PATHFit Director only (for the PATHFit default); `GET /api/rooms` and `GET /api/buildings` never
return the TBA room/building (GYM still is). The rows still exist for PATHFit generation.

Each CAS Department Head's `User.departmentId` must point to the `CAS` parent department. Use `getUserDepartmentId()` from `lib/auth.ts` to read it (checks `User.departmentId` first).

**ADMINs = Program Chairpersons** from all colleges (e.g., CIT, CAG). They manage major subjects only — GEC is handled by the dept chairs. Automatically locked to their own college.

### Scheduling Workflow (Step-by-step) — INVERTED per updated spec (Section 2)
> The order was reversed on 2026-08-28. The Dept Chair now plots GEC **first**, before
> Program Chairs add their majors. The old "PC submits before DC generates GEC" gate
> has been removed.

1. **CIT Program Chair (ADMIN)**: pre-plots **laboratory subjects only** (labs-only is hard-blocked server-side until GEC exists — `POST /api/schedules/[id]/entries`). CIT-only stage.
2. **Dept Chair (SUPER_ADMIN)**: generates GEC/GEL for all sections — **no longer gated on Program Chair submission**. Already-plotted CIT labs are treated as locked slots (hard constraint, no override), so GEC can never be placed on a CIT lab's slot.
3. **Dept Chair**: finalizes/publishes the GEC/GEL schedule. The presence of GEC entries is the signal that unlocks Program Chairs to add their full major load.
4. **All Program Chairs (ADMIN)**: add their full major subject load (lecture + lab) on `DRAFT`, click **Mark my subjects as done**, and — once every Program Chairperson of the department is done — **Submit for Approval** to their **Dean** (see "Program Chairperson done → Dean approval" below). A CIT chair's regeneration preserves the pre-plotted labs (they are excluded from the regenerated subject scope).
   **Enforced (`lib/services/workflow-gates.ts` → `isGecFinalized`, updated 2026-09-17)**: a Program Chair is blocked
   from Add Entry, Generate and Submit (409 + `GEC_FIRST_MESSAGE`) until **all three CAS department heads** have
   explicitly finalized GEC/GEL for THIS schedule — not merely "some GEC entry exists" — except a CIT chair, who may
   add/generate LABORATORY subjects only in the meantime (step 1). The schedules page mirrors this with a
   "Waiting for GEC" banner listing per-department-head status (`waitingForGec`, `gecReady`/`gecClusters` from
   `GET /api/schedules/[id]/gec-finalize`).
5. **Dean** (of that department): `approve` → `PUBLISHED` (blocked while the term-wide conflict check finds a
   double-booking), or `reject` with a note → back to `DRAFT`. The Dept Chair publishes only the CAS schedule itself.

### Program Chairperson done → Dean approval (spec, 2026-09-26)
- **Model**: `ProgramFinalization` — one row per (scheduleId, programId): that program's Program Chairperson declared
  their subjects DONE for this schedule (who, when). Like `GecFinalization` it is a deliberate declaration, and it
  **auto-reopens**: `reopenProgramIfStale` (`workflow-gates.ts`) deletes the actor's row whenever a Program Chairperson
  adds / edits / deletes a class (`entries` POST, `entries/[entryId]` PATCH/DELETE) or regenerates (`generate`).
- **"Everyone"** = every program of the schedule's department that has an approved, active Program Chairperson
  (`getProgramFinalizationStatus`); a program nobody chairs is not counted. `allFinalized` needs ≥ 1 program.
- **Route** `/api/schedules/[id]/program-finalize`: `GET` per-program status (department's Dean / PCs, university-wide
  roles); `POST { action: "finalize" | "unfinalize" }` — ADMIN only, own program, own department, `DRAFT` only;
  finalize also needs GEC/GEL finalized. The last one in notifies every PC ("Everyone Is Done — Ready to Submit").
- **Submit gate** (`workflow` route, `submit`): ADMIN of the schedule's own department, GEC finalized, **all programs
  done**, and the department must have an approved Dean. Notifies the Dean(s) and the other PCs.
- **Approve / reject**: DEAN of the schedule's department only, from `PENDING_APPROVAL`. Approve re-runs
  `detectTermConflicts` (same as `/publish`): ERROR conflicts are written to `ConflictLog` and the call fails (422) —
  the Dean returns the schedule instead; on success the log is replaced by the warnings. Reject requires a note.
- `/publish` (and the raw `status` PATCH on `/api/schedules/[id]`) refuse a SUPER_ADMIN on any schedule but their own
  department's, so nothing skips the Dean.
- **UI**: `components/schedule/workflow-actions.tsx` — ADMIN on DRAFT: "Program Chairpersons — done plotting" card
  (per-program ✓ / still plotting, `n of m done`), **Mark my subjects as done** / **Reopen**, **Submit for Approval**
  (disabled until everyone is done). DEAN on DRAFT: the same list read-only; on PENDING: **Approve** / **Return for
  Revision**. SUPER_ADMIN on PENDING: "waiting for the Dean". The status query is keyed `["schedules", id,
  "program-finalization"]` so every entry mutation refreshes it. Notifications link to
  `/dashboard/schedules?schedule=<id>` (the page opens that schedule — `ScheduleDeepLink`). The Dean's dashboard
  lists "Schedules awaiting your approval" with **Review & approve** links.

> **Compliance rule (updated 2026-09-17):** Every course code other than GEC/GEL, PATHFit and NSTP is a major
> subject under its own program's Program Chairperson (enforced in `lib/services/subject-permissions.ts` and the
> Add/Edit subject-pool filters). A department's schedule becomes actionable for its Program Chairpersons only once
> **all three** CAS department heads handling GEC/GEL have **finalized** their scheduling for that schedule — see
> "GEC/GEL Finalization" below. Only the owning **CIT Program Chairperson** may add/edit/move/delete CIT
> **laboratory** subjects — not the Dept Chair, not another program's chair. The Dept Chair may view but not edit
> any non-CAS major subject.

### GEC/GEL Finalization (spec, 2026-09-17)
- **Model**: `GecFinalization` — one row per (scheduleId, clusterId) recording which CAS department head declared
  their GEC/GEL scheduling COMPLETE for that specific schedule, and when. Finalization is per schedule, not global —
  each department's schedule (CIT, CTE, CEN, CAM, CABHA, CAG, plus CAS's own) is finalized independently, and all
  three department heads must finalize each one separately.
- **Not inferred from entries** — a department head placing a few GEC classes does not unlock Program Chairs; they must
  explicitly click **Finalize my GEC/GEL** (`POST /api/schedules/[id]/gec-finalize { action: "finalize" }`, SUPER_ADMIN
  only — their own area, or any area by `clusterId` for a full-access chair with no area). `GET` on the same route
  returns per-area status (name, finalized, finalizedBy, finalizedAt) for the UI.
- **Auto-reopens on further edits** (`reopenGecIfStale` in `workflow-gates.ts`): creating, editing, or deleting a
  GEC/GEL entry for an area that already finalized this schedule deletes that area's `GecFinalization` row again
  — wired into `entries/route.ts` POST, `entries/[entryId]/route.ts` PATCH/DELETE, and the SUPER_ADMIN branch of
  `generate/route.ts` (a full regeneration always reopens). The declaration must reflect the entries actually placed.
- **Notification**: the moment the last of the three department heads finalizes a schedule, every approved Program
  Chairperson of that department is notified ("GEC/GEL Finalized — You May Proceed"). CAS's own schedule has no
  Program Chairpersons, so finalizing it is harmless bookkeeping that gates nothing.
- **UI** (`app/(dashboard)/dashboard/schedules/page.tsx`): a "GEC/GEL finalization — by department head" card above
  the entry list for SUPER_ADMIN (their own Finalize / Reopen my GEC/GEL button + all three areas' status); the
  "Waiting for GEC" banner for ADMIN lists the same breakdown so a Program Chair can see who they're waiting on.

---

## Architecture Pillars

### 1. Multi-College / Per-College Isolation
- `College → Department → Program → YearLevel → Section` hierarchy
- Two primary colleges: **CAS** (managed by the 3 CAS Dept Heads / SUPER_ADMINs) and **CIT** (and other colleges, managed by their Program Chairs / ADMINs)
- `CollegeContext` (`lib/college-context.tsx`) provides `selectedCollegeId` globally
- All data-fetching hooks and API routes **must** accept and apply `collegeId` as a filter
- Non-SUPER_ADMIN users (Program Chairs, Faculty) are **locked to their own college** automatically
- SUPER_ADMIN (CAS Dept Heads) can switch colleges via the topbar filter; `null` = "All Colleges"

### 1b. Generator ↔ manual-entry parity (one rule set)
- **Specialization — no exemptions.** Every subject, GEC/GEL/PATHFit/NSTP included, needs a faculty member tagged
  for it. One matcher for the engine, `entry-validation.ts` and the Add/Edit pickers:
  `specializationsCoverSubject(specs, title, code)` in `lib/specialization-match.ts` — a tag may be the subject
  title (abbreviation-tolerant) or its **code** ("GEC01", "GEC01 - Understanding the Self"). CAS faculty must be tagged
  per GEC (`prisma/seed-cas-gec-specializations.ts` tags each active CAS faculty with their area's GEC/GEL codes for
  test data). The TBA placeholder is exempt (PATHFit generation).
- **Faculty pool for a Program Chairperson run** = own program + department-wide faculty **+ instructors allocated to
  that program for that term** (approved `FacultyRequest` rows with `programId`, `semesterId`, `facultyId`). A
  request is raised from the Faculty page (or Departments page) with the term; the Department Chairperson's approval
  **allocates** a faculty member (`PATCH /api/faculty/request` requires `facultyId`). `/api/faculty?scope=schedulable
  &semesterId=` includes the allocated instructors so the picker offers exactly who the generator may assign.
- **Rooms** — union semantics everywhere: a room's building is usable when it has NO department links (shared) or is
  linked to the department (`roomBuildingOpenToDepartment` in `entry-validation.ts`, used by entries POST/PATCH;
  `/api/rooms?departmentId=` applies the same rule). Previously manual entry only accepted mapped buildings.
- **Faculty may teach in any building (2026-09-19).** The per-faculty, per-term building access list was removed: no
  chips on Faculty Availability, no `/api/faculty/building-availability` route, `enforceBuildingAvailability: false`
  in the engine (`allowedBuildingIds: []` from the generate route) and no rule 0f in `validateEntry`. The
  `FacultyBuildingAvailability` model still exists (old rows are inert; `prisma/seed-cit-specs-availability.ts` still
  writes them harmlessly).
- **Faculty employment type (2026-09-19)**: `FacultyType { REGULAR, COSI }` on `Faculty.employmentType`
  (default REGULAR). `lib/faculty-types.ts` (client-safe): **Regular = 21 units/week, COSI = 40** (`MAX_UNITS_BY_TYPE`),
  default hours 30 / 40. `Faculty.maxUnitsPerWeek` is **derived from the type on every write** (`POST /api/faculty`,
  `PATCH /api/faculty/[id]` — clients send `employmentType`, never a unit number; a type change lifts
  `maxHoursPerWeek` to the type default when it is lower). Forms on the Faculty and Faculty Availability pages have an
  "Employment type" select instead of a Max Units input; the table/cards show "Regular · max 21u". Engine ceiling
  `maxWeeklyUnits` = 40 (`MAX_UNITS_ANY_TYPE`); `validateEntryCapacity` names the type in its warning.
  `prisma/seed-faculty-type-caps.ts` re-derives every existing faculty's cap (run after `db push`; done locally).
- **Year check** in `validateEntry` consults the curriculum map first (a shared subject's year differs per program),
  falling back to `Subject.year` only for unmapped programs / off-curriculum subjects.
- **Deleting a class removes every session of a multi-day (`groupId`) class** (`DELETE /entries/[entryId]`), so the
  subject becomes addable again for that section.

### 1c. GEC/GEL per-day session cap (2026-09-19)
- `Subject.maxMinutesPerDay Int?` + `lib/session-rules.ts` (client-safe): `resolveMaxMinutesPerDay(subject)` = the
  explicit value, else **90 for GEC/GEL** (`DEFAULT_GEC_MAX_MINUTES_PER_DAY`), else null (no cap). The Subjects form
  shows "Longest session per day" (1 hour / 1 hour 30 minutes) for GEC/GEL codes only; the table shows a
  "max 1 hour 30 minutes/day" badge. `POST/PATCH /api/subjects` accept 60 / 90 / null.
- **Engine**: `SubjectInput.maxMinutesPerDay` → `getSessionDayGroups` drops every day pattern whose per-day session
  exceeds the cap — including the single-block fallback. A 3-hour GEC therefore meets 1h×3 (MWF/TThS) or 1.5h×2
  (TTh/MW/…), never as one 3-hour block (that fallback was being chosen at random by the greedy shuffle before).
  Cap 60 leaves only the 1h×3 patterns. `diagnoseEmptyDomain` names the cap when no pattern can carry the hours.
- **Manual entry**: `validateEntry` rule 0a returns a `[HARD]` error (never overridable with Save Anyway) when a
  session is longer than the cap; the Add/Edit Entry End Time pickers only offer times within it and show a hint.

### 1d. Merged NSTP sections (2026-09-19)
- `ScheduleEntry.mergeGroupId String?` (+ index): a merged NSTP class is **one row per (section, day)**, all sharing
  the id, with identical subject/faculty/room/time. Only NSTP may be merged (`isNstpCode`) — the API refuses others.
- `POST /entries` takes `sectionIds: string[]` (the primary section + the extras the NSTP Director ticked under
  "Merge with other sections"); every section's row is validated (its own timetable must be free), capacity is
  checked once, rows are created in one transaction (multi-day patterns still share `groupId` too).
- `PATCH /entries/[entryId]` on a merged row applies field changes to every section's row of that **session**
  (same day/time) and accepts `sectionIds` to add / drop sections (adds get a row per existing session; dropping to
  one section clears `mergeGroupId`). It can also merge a plain single-section NSTP class by sending `sectionIds`
  with 2+ ids. `DELETE` removes the whole merge group.
- **Same class, not a double-booking**: rows of one merge group are exempt from faculty/room overlap checks against each
  other in `entry-validation.ts`, `conflicts.ts` (`sameMergedClass`) and `term-conflicts.ts`; section overlap
  still applies per section. Their minutes/units count **once** in `validateEntryCapacity`, the engine's locked-slot
  preload, `/api/faculty/workload`, `syncFacultySpecializations` and the Teaching Load export (one row
  "NSTP01 … (BSIT 1-A + BSIT 1-B)").
- **UI** (`schedules/page.tsx`): `collapsedEntries` folds the rows of one session into a single display row
  (`__mergedSections`, `__mergedIds`) shown with a "Merged · n" badge in List/Table/Calendar; the Section filter
  matches any member. The Edit dialog replaces the section combobox with chips + "Merge another section…" for NSTP;
  the delete dialog says the whole merged class goes. `GET /api/schedules/[id]` now selects `groupId` and
  `mergeGroupId` (the multi-day pattern badge never worked before because `groupId` was not selected).

### 2. Lab Specialization & Room Type
- `LabSpecialization` enum on `Room.labSpecialization` and `Subject.requiredLabSpecialization`
- Scheduling engine checks this as a **hard constraint** in `initializeCandidates()` before backtracking
- UI: LabInventory component (`components/rooms/lab-inventory.tsx`) with `LAB_SPEC_META`
- **Room type is always enforced** (`lib/room-type-rules.ts` — single source for the engine via the generate
  route, `entry-validation.ts`, and the Add/Edit Entry room pickers): explicit `Subject.requiredRoomType`
  wins (Subject form "Room needed"); otherwise LABORATORY subjects need `LABORATORY`/`LECTURE_LAB`, computer-based
  labs (ITE/COM/IIT codes, or titles with programming/database/web/networking/CAD/… keywords) need `COMPUTER_LAB`
  only, and LECTURE subjects need `LECTURE_ROOM`/`LECTURE_LAB`. Placeholder rooms (TBA/GYM) are exempt and are
  excluded from the engine's room pool.

### 3. Schedule Workflow State Machine
```
DRAFT  ──(ADMIN submits, everyone done)──►  PENDING_APPROVAL  ──(DEAN approves)──►  PUBLISHED
                                                               ──(DEAN returns) ──►  DRAFT
PUBLISHED ──(SUPER_ADMIN reset / unpublish)──► DRAFT        CAS schedule: SUPER_ADMIN publishes directly (/publish)
```
- Route: `POST /api/schedules/[id]/workflow` with `{ action: "submit"|"approve"|"reject"|"reset" }`
- `submit` is **ADMIN-only** (own department, all programs done); `approve`/`reject` are **DEAN-only** (own
  department); `reset` is SUPER_ADMIN
- SUPER_ADMIN GEC generation is **no longer gated** on ADMIN submission (order inverted — DC goes first). CIT labs already plotted act as locked slots during GEC generation.
- ADMIN generation runs on `DRAFT` status only
- UI: `components/schedule/workflow-actions.tsx`

### 4. Building & Room Access Restrictions
- `DepartmentBuilding` junction table: `@@unique([departmentId, buildingId])`
- Buildings can be restricted to specific departments (zero entries = unrestricted)
- UI badge on building cards shows the restriction (lock icon + dept abbreviations)
- API: `GET/POST/PATCH /api/buildings` handles `restrictedDepartmentIds[]`
- **Room-level**: `DepartmentRoom` (dept access) + `ProgramRoom` (program/course access)
  - Union semantics: a room is open to a section when it has NO dept AND NO program
    entries, OR its departments include the section's dept, OR its programs include
    the section's program
  - API: `POST /api/rooms` + `PATCH /api/rooms/[id]` handle `restrictedProgramIds[]`
  - Engine: `RoomInput.allowedProgramIds` — hard constraint in `initializeCandidates`/`rescueTask`
  - Manual entries: enforced in `lib/services/entry-validation.ts`

### 5. Saturday Restriction (Hard Constraint)
- **Only CAM (College of Allied Medicine) sections and NSTP subjects may be scheduled on Saturdays**
- Engine: `SectionInput.allowSaturday` (computed from section → program → dept → college) +
  NSTP code prefix; Saturday day-patterns are pruned in `getPatternsForTask`
- Manual entries: blocked in `entry-validation.ts`; NOT force-overridable (entries PATCH route)
- UI: Add/Edit Entry day dropdowns hide Saturday for non-CAM/non-NSTP sections

### 6. UI conventions
- **Lists are paginated at 10 rows** (`components/shared/pagination.tsx` — `usePagination` + `PaginationControls`,
  `PAGE_SIZE = 10`): users, faculty, availability cards, subject tables, buildings + rooms, lab inventory,
  schedule list, schedule entries (List/Table views), request panels, approval board.
- **Every Delete / Deactivate / Set Inactive confirms first** via `components/shared/confirm-dialog.tsx`.
- User Management is **Dean-only** (sidebar item, page `RoleGuard`, and `PATCH/DELETE /api/users/[id]`; accounts
  of their own department only) and has **Delete** (permanent; `DELETE /api/users/[id]`, also removes the Supabase
  Auth user) instead of "Revoke Approval". A Program Chairperson's program is assigned by the Dean (Change Department
  dialog); `GET /api/users` stays readable (own department) for the Faculty page's "link an existing account" picker.
- **Dashboard**: no quick-action / Management Hub cards (removed 2026-09-16 as redundant with the sidebar). Chairs and
  Directors see the KPI row + Recent Schedules (+ their own teaching schedule). The **Dean** gets
  `components/dashboard/dean-dashboard.tsx`: schedules awaiting their approval (**Review & approve** →
  `/dashboard/schedules?schedule=<id>`), accounts awaiting approval (approve inline), department schedules with
  status/unassigned/conflict badges, and the latest audit rows — each linking to User Management / System Logs.
- **User Manual** (`/dashboard/manual`, all login roles; sidebar item + the ⋯ menu / "Waiting for GEC" banner on
  Manage Schedules) is **one visual manual per role** (2026-09-19): `lib/manual-workflows.ts` holds a `RoleManual`
  per role (flowchart nodes on a col/row grid + edges, "where each step happens" cards, one-line rules) and
  `components/manual/workflow-diagram.tsx` renders it as an SVG flowchart (steps / decisions / "another role — you
  wait" / start-finish, "Enforced" badges, dashed loops back). The signed-in role's manual opens first; a role switcher
  shows the others. Page titles come from `PAGE_TITLES` in `components/layout/dashboard-shell.tsx`. Manual "places"
  point at `/dashboard/logs` for occupancy / summary / classes.
- **System Logs** (`/dashboard/logs`, 2026-09-19) is the ONE oversight page for the **Dean, Department Chairperson
  and Program Chairperson** — five tabs, every one colouring departments/colleges the same way via
  `lib/department-colors.ts` (`departmentColor(abbr)`: fixed slots for CAS/CIT/CTE/CEN/CAM/CABHA/CAG/CAHM, hashed
  otherwise; `DepartmentChip` / `DepartmentLegend` in `components/shared/department-legend.tsx`). Scope: DEAN/ADMIN
  = their department; SUPER_ADMIN = every department (department filter where it makes sense). No separate sidebar
  pages for Room Occupancy / Subject Summary any more (they were briefly `/dashboard/occupancy` and
  `/dashboard/subject-summary`; both removed the same day).
  - **Activity** — `GET /api/audit-logs` (DEAN/ADMIN own dept by subject-or-actor; SUPER_ADMIN all, `?departmentId=`).
    Collapsible colour key (`lib/log-legend.ts`: one colour per actor role — same as User Management's role badges —
    and one per kind of action); "By" column shows a role dot + badge; the schedule context line carries a department chip.
  - **Schedules** — every schedule in scope (Department column + legend for the DC).
  - **Classes** — `GET /api/schedules/classes?semesterId[&page&search&departmentId&programId&day&status][&format=csv]`:
    **every scheduled class of the term** (section · course/program · subject · faculty · room · day/time · status)
    across draft/pending/published non-archived schedules, merged NSTP rows collapsed to one line, server-paginated
    (20/page), totals line (classes · sections · courses · subjects), CSV export. This is the "everything being
    scheduled" list the panel asked for.
  - **Subject Summary** — `components/schedule/subject-summary-view.tsx`, `GET /api/subjects/summary?academicYearId
    &departmentId`: for every subject, which programs (grouped by department) take it in which semester — "1st
    Semester: GEC05 | CAS — BSBio, BAPsych | CIT — BSIT". Merges **planned** (curriculum map, else Subject rows by
    semester) with **scheduled** (non-archived schedules of that year). **By subject** matrix (dept chip | program chips:
    filled = scheduled with section count, outlined = planned only, amber = scheduled off-curriculum) and **By program**
    pivot; filters: academic year, department (DC), kind, scheduled only, search; 10 rows per page.
  - **Room Occupancy** — `components/rooms/room-occupancy-view.tsx`, `GET /api/rooms/occupancy?semesterId[&buildingId]`
    (replaces `/api/dean/room-occupancy`): a **room × time grid** per building (rows = rooms, 30-min columns
    07:00–21:00, one colour per department, dashed border = not yet published, users icon = merged sections), day tabs
    with counts, click a block for details, plus a List view. Buildings: DEAN → assigned to their department; ADMIN →
    open to their department (shared or linked); SUPER_ADMIN → all buildings (no department filter — removed on request).
- Pagination summaries read "1–10 out of 42 faculty"; the Faculty page's department headers read "9 out of 50 members"
  (rows on this page out of the department's total in the current search).
- **Audit trail**: every write route calls `recordAudit()` (`lib/audit.ts`; labels in the client-safe
  `lib/audit-labels.ts`) → `AuditLog` rows tagged with the department the action was about and the actor's
  department. `GET /api/audit-logs` and `GET /api/rooms/occupancy` feed the System Logs page.
  Key actions also record structured `metadata` (generation: mode, classes placed/unplaced, conflicts, duration;
  classes: subject, section, faculty, room, days, time; workflow: from/to status + note; accounts: email, role) — the
  Activity tab shows full date + time, the schedule context line, and expands a row into those details; it has
  action / role / date-range filters and an Export CSV button.
- Manage Schedules day tabs — **All days** (default) or one weekday (Mon–Sat, with per-day counts) — under the entry
  filter bar drive the List, Table and Calendar views (Calendar hides the other weekday columns via `visibleDay`; it is
  remounted with `key={selectedDay}` because FullCalendar went blank when only `hiddenDays` changed in place).
  Multi-day (MWF/TTh) classes appear on each of their days with a pattern badge. Faculty/Section/Room filters keep "All".
- Calendar view colours events **per subject** (`subjectColor()` in `schedule-calendar.tsx`, golden-angle hues) with
  a subject colour key; conflicts stay red. The time axis is labelled **every 30 minutes** (`slotLabelInterval`
  00:30, half-hour labels lighter and dotted).
- `/dashboard/schedules` has a route `loading.tsx` skeleton, and sidebar / dashboard links show a pending spinner
  (`components/shared/link-pending.tsx`, `useLinkStatus`).
- Copy: plain verbs ("Generate", "Generating…", "Save Anyway", "Ready to Publish") — avoid algorithm/constraint jargon
  in user-facing text.
- **Faculty max hours (`Faculty.maxHoursPerWeek`, default 30)**: a single "Max hours / week" input in each Faculty
  Availability card's header (also on the Add/Edit dialogs) — no workload panel. It caps (a) the availability a chair
  may mark — the timeline shows hatched "over max hours" cells on hover/drag past the cap, presets/resizes are clamped,
  and `POST /api/faculty/availability` rejects saves that would ADD hours beyond the cap (reductions are always
  accepted, so a faculty already over the cap can be trimmed) — and (b) scheduled load: a hard constraint in the engine
  (`facultyWeeklyMinutes`, locked entries included) and an override-able warning in `validateEntryCapacity`.
  `GET /api/faculty/workload?semesterId=` (per-faculty scheduled minutes) exists but is not currently rendered.
- **Loading states are skeletons, never text** (`components/shared/loading-skeletons.tsx`): every dashboard route has a
  `loading.tsx` built from the same pieces its page uses in-page (`TableSkeleton`, `CardListSkeleton`,
  `CardGridSkeleton`, `ScheduleListSkeleton`/`ScheduleDetailSkeleton`, `CalendarSkeleton`, `StatTilesSkeleton`,
  `LinesSkeleton`, `PageSkeleton`).
- Availability timeline: green runs render as blocks with drag-to-resize end handles; hovering a block expands it
  (range + duration label). A "Saving availability…" overlay covers the timeline from mouse-up until the save AND the
  refetch finish (`savingFacultyId`); new drags are ignored meanwhile. The "Schedule" summary below is an aligned
  day | ranges | hours grid (no pipe-delimited text). Legend shows Available / Unavailable only.
- **CIT faculty = the real roster (2026-09-21)**, 23 people across 9 shops, from `prisma/seed-cit-faculty.ts`
  (shop → program map inside: CPT→BIT-Comp, IT→BSInfoTech, AT→BIT-Auto, ELX→BIT-Eltx, ELT→BIT-Elec, IDT→BIT-ID,
  GT→BIT-Garm, FT→BIT-Culi, MT→BIT-Mech; BIT-Print has nobody on the list). Each shop's "PC" is the existing ADMIN
  account heading that program, RENAMED to the real Program Chairperson (email/login unchanged) and given the faculty
  record; everyone else is a record-only stub. The script wipes every other CIT faculty first (refuses if any has
  schedule entries; `--dry-run` previews). Then run `prisma/seed-cit-specs-availability.ts` for program-matched
  specializations + Mon–Fri availability (AY 2026-2027). `seed-cit-one-unassigned.ts` is obsolete. Each script
  targets whatever `DATABASE_URL` is set — point it at the Supabase session-pooler URL to do the same on production.
- Nav links swap their icon for a spinner while a navigation is pending (`LinkPendingIcon`).

### 7. Personal teaching schedule (chairs only)
- The `/dashboard/my-schedule` page and faculty login were **removed** — faculty are not app users.
- `/api/faculty/my-schedule` still exists as the data source for the signed-in **chair's own**
  teaching-schedule widget on the dashboard (a DC/PC can also hold teaching assignments).
  Returns **PUBLISHED entries only** — drafts never appear in a personal timetable.

---

## Key API Routes

| Route | Method | Description |
|---|---|---|
| `/api/faculty` | GET | Accepts `departmentId` or `collegeId` filter |
| `/api/faculty` | POST | Creates faculty; email optional (stub vs. real auth user) |
| `/api/faculty/availability` | GET/POST | Faculty time availability for a `semesterId`; POST rejects totals over `maxHoursPerWeek` and 409s without a non-archived schedule for that term |
| `/api/faculty/request` | GET/POST/PATCH | PC raises a request (term + reason); DC approves by allocating a `facultyId` → joins the program's pool for that term |
| `/api/faculty/workload` | GET | `?semesterId=` → per-faculty scheduled minutes/classes across non-archived schedules (live workload bar) |
| `/api/schedules/[id]/workflow` | POST | State transitions: submit (PC, everyone done) / approve · reject (Dean) / reset (DC) |
| `/api/schedules/[id]/program-finalize` | GET/POST | Program Chairpersons' "done plotting" status for the schedule's department; POST finalize / unfinalize (own program, DRAFT) |
| `/api/schedules/[id]/generate` | POST | Runs backtracking scheduler. DC generates PATHFit (priority, GYM/TBA) then GEC (no PC-submission gate); CIT labs are locked slots |
| `/api/users/[id]` | PATCH/DELETE | DEAN (own department only): approve, re-role, (de)activate, permanently delete (DB rows + Supabase Auth; 409 if their faculty record still has entries). Refuses a second Dean per department / second PATHFIT or NSTP account |
| `/api/audit-logs` | GET | DEAN / ADMIN (own department) / SUPER_ADMIN (all, `?departmentId=`): paginated activity (`?page&action&search&role&from&to`), each row resolved to its schedule (term · dept · status); `format=csv` downloads the filtered log (≤5000 rows) |
| `/api/rooms/occupancy` | GET | DEAN / ADMIN / SUPER_ADMIN: every class held this semester in the rooms they may see (`?semesterId&buildingId`), merged NSTP rows collapsed, plus the departments present (colour key) |
| `/api/schedules/classes` | GET | DEAN / ADMIN (own dept) / SUPER_ADMIN (all, `?departmentId=`): every scheduled class of a term, paginated (`?semesterId&page&search&programId&day&status`), `format=csv` |
| `/api/faculty` · `/api/faculty/[id]` | POST · PATCH | Accept `employmentType` (REGULAR / COSI); `maxUnitsPerWeek` is derived (21 / 40) — a client-sent unit number is ignored |
| `/api/subjects/summary` | GET | DEAN / ADMIN (own dept) / SUPER_ADMIN (all, `?departmentId=`): per subject × semester × department → program cells (planned / scheduled / sections / classes / years) for `?academicYearId=` |
| `/api/schedules/[id]/entries` | POST | Add a class; `days[]` for MWF/TTh patterns, `sectionIds[]` to merge NSTP sections (one row per section sharing `mergeGroupId`) |
| `/api/schedules/[id]/entries/[entryId]` | PATCH/DELETE | Edit applies to every section row of a merged session and accepts `sectionIds[]` (add/drop sections); delete removes the whole multi-day group / merge group |
| `/api/auth/bootstrap-status` | GET | Public: which singleton accounts already exist (drives sign-up auto-approve / blocked messages) |
| `/api/schedules/[id]/export-data` | GET | Enriched flat entries + header for the ISO / Teaching-Load exports (Section 6) |
| `/api/schedules/[id]/lab-requests` \| `/[reqId]` | GET/POST/PATCH | DC→CIT-PC lab-change requests (Section 2), on `ScheduleSwapRequest` (`kind:"LAB_CHANGE"`) |
| `/api/buildings` | GET/POST/PATCH | Includes `departments` relation; accepts `restrictedDepartmentIds` |
| `/api/semesters` | GET | Returns all semesters including `academicYear`; `isActive` marks the current one |

---

## Semester Handling

- `Semester.isActive = true` marks the active semester for scheduling
- If no semester is marked active, the system auto-falls back to the most recent semester (ordered by `academicYear.startYear DESC`)
- Faculty availability is always stored with a `semesterId` — the active semester is auto-selected silently (no dropdown shown to the user)

---

## Auth & Security Rules

- **Never** expose `SUPABASE_SERVICE_ROLE_KEY` in `NEXT_PUBLIC_*` variables
- Admin client: `lib/supabase/admin.ts` — server-only, never import in client components
- `.env` must stay in `.gitignore` — never commit it
- Faculty are always **stub users** (`supabaseId` starts with `"manual-"`, no Supabase auth account) — they cannot log in at all. Email, if given, is a record/contact field only.

---

## Faculty Availability Page Notes

- **Per-term.** Availability (`FacultyAvailability.semesterId`) is recorded for a specific Academic Year + Semester.
  The page has a **Term** selector listing only the **1st and 2nd semesters** (never Summer, 2026-09-19) that have a
  non-archived schedule the user's faculty take part in (own department; for a CAS Department Chairperson any
  department's schedule — CAS faculty teach GEC/GEL everywhere), default: the active semester when listed, else the
  newest; no college dropdown — `/api/faculty` scopes everyone to their own department server-side, so the page calls
  `useFacultyList()` with no params. The card header shows the faculty's employment type and unit cap.
- **Strict term isolation.** The generator (`generate/route.ts`) and manual entry (`entry-validation.ts`) read the
  schedule's own semester's availability rows ONLY — the old "fall back to the active semester" rule is gone on both
  sides (it was how 1st- and 2nd-semester data bled together and why generated entries failed manual validation).
  Generation without any availability for that term fails up front with a message naming the term.
- Building access per faculty no longer exists (faculty may teach in any building — see pillar 1b).
- `POST /api/faculty/availability` returns 409 unless a non-archived schedule exists for that term that the faculty's
  department takes part in (`departmentHasScheduleForTerm` in `lib/services/term-scope.ts`: own department, or any
  department for CAS). Archived schedules never count — here, in `syncFacultySpecializations` (load from non-archived
  schedules only), the workload route and the engine's locked entries.
- The Dean sees the page read-only (`FacultyCard readOnly`: no drag, presets, max-hours edits, Add/Edit/Deactivate).
- The `Add Faculty` button in the availability page creates faculty records (email optional, record-only — faculty do not
  log in) with an Employment type (Regular / COSI) that fixes the unit cap; Max hours stays editable.

---

## Compliance Checklist (Panelist Requirements — All Implemented)

| Requirement | Feature | Location |
|---|---|---|
| CIT + all departments scheduling | Multi-college architecture | `CollegeContext`, `/api/faculty?collegeId=` |
| All labs integrated | Room types: LABORATORY, COMPUTER_LAB, LECTURE_LAB | Prisma schema, rooms page |
| Labs categorized by academic specialization | `LabSpecialization` enum | `components/rooms/lab-inventory.tsx` |
| Per-college data organization | `selectedCollegeId` filter on all pages (one dept per college, so per-dept schedules are per-college) | `lib/college-context.tsx` |
| Dept Chair plots GEC first → Program Chairs add majors → approve | Inverted workflow (Section 2) | `/api/schedules/[id]/generate`, `/workflow` |
| PCs mark their subjects done; submit only when the whole department is done; the Dean approves | `ProgramFinalization` + submit gate + Dean approve | `/program-finalize`, `/workflow`, `workflow-actions.tsx` |
| CIT labs pre-plotted; only CIT PC edits them | Labs-only pre-plot + exclusive edit lock | `entries/route.ts`, `subject-permissions.ts` |
| DC requests CIT PC to move a blocking lab | Tracked request + notification | `lab-requests` routes, `components/schedule/lab-requests-panel.tsx` |
| ISO "Schedule of Subjects" + "Teaching Load" exports | Two on-demand exports from published data | `lib/exports/schedule-format.ts`, `components/schedule/export-dialog.tsx` |
| Faculty receive their schedule | Printed Teaching Load export from DC/PC (faculty do not log in) | `lib/exports/schedule-format.ts` |

---

## Prisma Notes

- Always import from `./prisma/generated/prisma/client/client` (custom output path)
- No `prisma/migrations` folder exists — this project syncs the schema with `npx prisma db push` (local dev DB at `localhost:5432`), then `npx prisma generate`
- Seed scripts are in `prisma/` (e.g., `prisma/seed-subjects.ts`) — run with `npx tsx --env-file=.env prisma/<file>.ts`
- **CTE / CEN / CAM / CABHA curricula** live as data modules in `prisma/curricula/*.ts` (transcribed from the official
  curriculum .docx files; each header lists the few code normalisations) and are written by
  `prisma/seed-curriculum-colleges.ts` (idempotent; `--dry-run`; optional college args). A code used by several programs of
  one department becomes a dept-wide subject (`programId = null`) whose per-program placement is the matching block in
  `lib/curriculum-map.ts` — those blocks are generated from the same data, so edit the data module and regenerate rather
  than hand-editing the map. GEC/GEL/PATHFit/NSTP are never created outside CAS; the three GE electives these curricula
  introduced (GEL04 Living in the IT Era, GEL05 The Entrepreneurial Mind, GEL08 Human Reproduction) are upserted into CAS
  and owned by the MNS department head. CEN and CAM documents cover the 2nd semester only.
