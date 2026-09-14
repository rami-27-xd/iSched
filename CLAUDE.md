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
| `SUPER_ADMIN` | **Department Head (CAS)** | Approves / rejects schedules, sees all colleges, manages system |
| `ADMIN` | **Program Chairperson** | Inputs data (faculty, subjects, availability), submits schedule for review |
| `FACULTY` | Faculty member | **No login.** A data record only (name on schedules, availability, specialization). Receives their schedule via the printed Teaching Load export from the DC/PC. |

### Organizational Structure at SLSU-Lucban

**SUPER_ADMINs = CAS Department Heads** — all linked to the single `CAS` department in the DB.
- All GEC/GEL subjects live in the `CAS` department (no SS/LLH/MNS sub-departments).
- CAS programs (BAComm, BAHist, BSBio, BSMath, BAPsych) also live in the `CAS` department.
- Multiple SUPER_ADMIN users can share the same `CAS` departmentId — they all manage the same pool.

**NSTP is NOT auto-generated** — manually scheduled only. **PATHFit IS auto-generated** on every Dept Chair
(SUPER_ADMIN) run: placed FIRST (before GEC) for every section in the run's scope as ONE continuous block (a 2-hour
class is a single 2-hour session, never split across days), faculty defaulted to the
`TBA` placeholder (`Faculty.employeeId = "TBA"`, entry `facultyName = "TBA"`) and room fixed to the `GYM`
placeholder (`Room.code = "GYM"`, building `GYM`). GYM/TBA are shared placeholders — exempt from room/faculty
double-booking checks everywhere (engine, `entry-validation.ts`, `term-conflicts.ts`, cross-schedule checks).
Placeholder helpers: `lib/sentinels.ts` (client-safe constants) and `lib/services/sentinels.ts` (upserts;
also `prisma/seed-sentinels.ts`). Program Chair runs never touch PATHFit.

Each CAS Department Head's `User.departmentId` must point to the `CAS` parent department. Use `getUserDepartmentId()` from `lib/auth.ts` to read it (checks `User.departmentId` first).

**ADMINs = Program Chairpersons** from all colleges (e.g., CIT, CAG). They manage major subjects only — GEC is handled by the dept chairs. Automatically locked to their own college.

### Scheduling Workflow (Step-by-step) — INVERTED per updated spec (Section 2)
> The order was reversed on 2026-08-28. The Dept Chair now plots GEC **first**, before
> Program Chairs add their majors. The old "PC submits before DC generates GEC" gate
> has been removed.

1. **CIT Program Chair (ADMIN)**: pre-plots **laboratory subjects only** (labs-only is hard-blocked server-side until GEC exists — `POST /api/schedules/[id]/entries`). CIT-only stage.
2. **Dept Chair (SUPER_ADMIN)**: generates GEC/GEL for all sections — **no longer gated on Program Chair submission**. Already-plotted CIT labs are treated as locked slots (hard constraint, no override), so GEC can never be placed on a CIT lab's slot.
3. **Dept Chair**: finalizes/publishes the GEC/GEL schedule. The presence of GEC entries is the signal that unlocks Program Chairs to add their full major load.
4. **All Program Chairs (ADMIN)**: add their full major subject load (lecture + lab) on `DRAFT`, then `submit` for the Dept Chair's final approval. A CIT chair's regeneration preserves the pre-plotted labs (they are excluded from the regenerated subject scope).
   **Enforced (`lib/services/workflow-gates.ts` → `scheduleHasGec`)**: until GEC/GEL entries exist in the schedule, every
   Program Chair is blocked from Add Entry, Generate and Submit (409 + `GEC_FIRST_MESSAGE`) — except a CIT chair, who may
   add/generate LABORATORY subjects only (step 1). The schedules page mirrors this with a "Waiting for GEC" banner and
   disabled actions (`waitingForGec`, `gecReady` → `WorkflowActions`).
5. **Dept Chair**: `approve` → `PUBLISHED` → visible to faculty.

> **Compliance rule:** Department Chairperson (SUPER_ADMIN) plots GEC/GEL **first**; there is no PC-submission precondition. Only the owning **CIT Program Chairperson** may add/edit/move/delete CIT **laboratory** subjects — not the Dept Chair, not another program's chair (enforced in `lib/services/subject-permissions.ts`). The Dept Chair may view but not edit any non-CAS major subject.

---

## Architecture Pillars

### 1. Multi-College / Per-College Isolation
- `College → Department → Program → YearLevel → Section` hierarchy
- Two primary colleges: **CAS** (managed by the 3 CAS Dept Heads / SUPER_ADMINs) and **CIT** (and other colleges, managed by their Program Chairs / ADMINs)
- `CollegeContext` (`lib/college-context.tsx`) provides `selectedCollegeId` globally
- All data-fetching hooks and API routes **must** accept and apply `collegeId` as a filter
- Non-SUPER_ADMIN users (Program Chairs, Faculty) are **locked to their own college** automatically
- SUPER_ADMIN (CAS Dept Heads) can switch colleges via the topbar filter; `null` = "All Colleges"

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
DRAFT  ──(ADMIN submits)──►  PENDING_APPROVAL  ──(SUPER_ADMIN approves)──►  PUBLISHED
                                                ──(SUPER_ADMIN rejects) ──►  DRAFT
```
- Route: `POST /api/schedules/[id]/workflow` with `{ action: "submit"|"approve"|"reject" }`
- `submit` is **ADMIN-only**; `approve`/`reject` are **SUPER_ADMIN-only**
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
- User Management has **Delete** (permanent; `DELETE /api/users/[id]`, also removes the Supabase Auth user) instead
  of "Revoke Approval".
- Manage Schedules day tabs — **All days** (default) or one weekday (Mon–Sat, with per-day counts) — under the entry
  filter bar drive the List, Table and Calendar views (Calendar hides the other weekday columns via `visibleDay`; it is
  remounted with `key={selectedDay}` because FullCalendar went blank when only `hiddenDays` changed in place).
  Multi-day (MWF/TTh) classes appear on each of their days with a pattern badge. Faculty/Section/Room filters keep "All".
- Calendar view colours events **per subject** (`subjectColor()` in `schedule-calendar.tsx`, golden-angle hues) with
  a subject colour key; conflicts stay red.
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
- CIT test data: every CIT faculty has program-matched specializations, Mon–Fri availability, and building access to
  CIT/ICT/HPB (`FacultyBuildingAvailability`) — except exactly one (Efren Zulueta, BSInfoTech) who has no
  specializations. Run `prisma/seed-cit-specs-availability.ts` then `prisma/seed-cit-one-unassigned.ts`, in that
  order (both re-runnable; `UNASSIGNED="Last, First"` to pick another). Each targets whatever `DATABASE_URL` is
  set — point it at the Supabase session-pooler URL to seed production.
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
| `/api/faculty/availability` | GET/POST | Faculty time availability (requires active `semesterId`); POST rejects totals over `maxHoursPerWeek` |
| `/api/faculty/workload` | GET | `?semesterId=` → per-faculty scheduled minutes/classes across non-archived schedules (live workload bar) |
| `/api/schedules/[id]/workflow` | POST | State transitions (submit / approve / reject) |
| `/api/schedules/[id]/generate` | POST | Runs backtracking scheduler. DC generates PATHFit (priority, GYM/TBA) then GEC (no PC-submission gate); CIT labs are locked slots |
| `/api/users/[id]` | DELETE | SUPER_ADMIN: permanently deletes a chair account (DB rows + Supabase Auth); 409 if their faculty record still has entries |
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

- Semester dropdown was intentionally removed — active semester is auto-selected
- The `Add Faculty` button in the availability page creates faculty records (email optional, record-only — faculty do not log in)
- `useFacultyList` now accepts `{ collegeId? }` — always pass `selectedCollegeId` from `useCollege()` so only the selected college's faculty appear

---

## Compliance Checklist (Panelist Requirements — All Implemented)

| Requirement | Feature | Location |
|---|---|---|
| CIT + all departments scheduling | Multi-college architecture | `CollegeContext`, `/api/faculty?collegeId=` |
| All labs integrated | Room types: LABORATORY, COMPUTER_LAB, LECTURE_LAB | Prisma schema, rooms page |
| Labs categorized by academic specialization | `LabSpecialization` enum | `components/rooms/lab-inventory.tsx` |
| Per-college data organization | `selectedCollegeId` filter on all pages (one dept per college, so per-dept schedules are per-college) | `lib/college-context.tsx` |
| Dept Chair plots GEC first → Program Chairs add majors → approve | Inverted workflow (Section 2) | `/api/schedules/[id]/generate`, `/workflow` |
| CIT labs pre-plotted; only CIT PC edits them | Labs-only pre-plot + exclusive edit lock | `entries/route.ts`, `subject-permissions.ts` |
| DC requests CIT PC to move a blocking lab | Tracked request + notification | `lab-requests` routes, `components/schedule/lab-requests-panel.tsx` |
| ISO "Schedule of Subjects" + "Teaching Load" exports | Two on-demand exports from published data | `lib/exports/schedule-format.ts`, `components/schedule/export-dialog.tsx` |
| Faculty receive their schedule | Printed Teaching Load export from DC/PC (faculty do not log in) | `lib/exports/schedule-format.ts` |

---

## Prisma Notes

- Always import from `./prisma/generated/prisma/client/client` (custom output path)
- No `prisma/migrations` folder exists — this project syncs the schema with `npx prisma db push` (local dev DB at `localhost:5432`), then `npx prisma generate`
- Seed scripts are in `prisma/` (e.g., `prisma/seed-subjects.ts`) — run with `npx tsx --env-file=.env prisma/<file>.ts`
