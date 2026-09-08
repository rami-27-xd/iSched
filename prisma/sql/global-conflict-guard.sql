-- ============================================================================
-- iSched — Institution-wide (cross-department) resource conflict guard
-- ============================================================================
-- Run once against the target database:
--
--   psql "$DATABASE_URL" -f prisma/sql/global-conflict-guard.sql
--
-- Prisma cannot express this in schema.prisma (it has no syntax for triggers,
-- advisory locks, or EXCLUDE constraints), and this project syncs with
-- `prisma db push` rather than migrations — so it lives here as a script and
-- must be re-applied after a `db push` that recreates the table.
--
-- ---------------------------------------------------------------------------
-- WHY A TRIGGER RATHER THAN AN EXCLUDE CONSTRAINT
-- ---------------------------------------------------------------------------
-- The natural choice would be:
--
--   ALTER TABLE "ScheduleEntry" ADD CONSTRAINT ... EXCLUDE USING gist (
--     "facultyId" WITH =, "day" WITH =, <time range> WITH && );
--
-- but an EXCLUDE constraint may only reference columns of its OWN table, and
-- the scope of a conflict is defined on Schedule, not ScheduleEntry:
--
--   * same semester      -> "Schedule"."semesterId"
--   * not archived       -> "Schedule"."isArchived"
--
-- Using EXCLUDE would therefore require denormalising both columns onto
-- ScheduleEntry and keeping them in sync with a trigger on Schedule (isArchived
-- flips over the life of a schedule). That is strictly more machinery than the
-- trigger below, for the same guarantee, so the trigger is the simpler design.
--
-- ---------------------------------------------------------------------------
-- WHY ADVISORY LOCKS
-- ---------------------------------------------------------------------------
-- A plain check-then-insert is not atomic under Postgres' default READ
-- COMMITTED isolation: two concurrent transactions inserting the same faculty
-- at the same hour each run the SELECT before either COMMITs, both see no
-- conflict, and both succeed. pg_advisory_xact_lock serialises writers that
-- touch the same (resource, day) pair for the remainder of the transaction, so
-- the second one blocks, then sees the first one's committed row. The lock is
-- released automatically at COMMIT or ROLLBACK.
-- ============================================================================

-- ── Supporting indexes ──────────────────────────────────────────────────────
-- The model already declares @@index([facultyId, day]) and @@index([roomId, day]).
-- These add the join column the guard filters on, so the lookup below does not
-- widen into a scan as entries accumulate across semesters.
CREATE INDEX IF NOT EXISTS "ScheduleEntry_scheduleId_facultyId_day_idx"
  ON "ScheduleEntry" ("scheduleId", "facultyId", "day");

CREATE INDEX IF NOT EXISTS "ScheduleEntry_scheduleId_roomId_day_idx"
  ON "ScheduleEntry" ("scheduleId", "roomId", "day");

-- Drives the "same semester, not archived" narrowing.
CREATE INDEX IF NOT EXISTS "Schedule_semesterId_isArchived_idx"
  ON "Schedule" ("semesterId", "isArchived");


-- ── The guard ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION isched_check_global_resource_conflict()
RETURNS TRIGGER AS $$
DECLARE
  v_semester_id  TEXT;
  v_is_archived  BOOLEAN;
  v_is_tba_fac   BOOLEAN;
  v_is_tba_room  BOOLEAN;
  v_clash        RECORD;
BEGIN
  -- Scope of THIS entry. An entry on an archived schedule reserves nothing, so
  -- it neither claims a resource nor needs checking.
  SELECT s."semesterId", s."isArchived"
    INTO v_semester_id, v_is_archived
    FROM "Schedule" s
   WHERE s.id = NEW."scheduleId";

  IF v_is_archived IS TRUE OR v_semester_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- "TBA" is a placeholder Faculty/Room row (prisma/seed-tba.ts), deliberately
  -- shared by every unresolved assignment. It is not a scarce real resource, so
  -- it is exempt here exactly as it is in lib/services/entry-validation.ts.
  SELECT (f."employeeId" = 'TBA') INTO v_is_tba_fac
    FROM "Faculty" f WHERE f.id = NEW."facultyId";
  SELECT (r.code = 'TBA') INTO v_is_tba_room
    FROM "Room" r WHERE r.id = NEW."roomId";

  -- Serialise concurrent writers touching the same resource+day. Without this
  -- the SELECTs below can both run before either COMMITs and both see a free
  -- slot. hashtextextended keeps the two lock namespaces from colliding.
  IF v_is_tba_fac IS NOT TRUE THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('isched:faculty:' || NEW."facultyId" || ':' || NEW."day", 0)
    );
  END IF;
  IF v_is_tba_room IS NOT TRUE THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('isched:room:' || NEW."roomId" || ':' || NEW."day", 1)
    );
  END IF;

  -- ── Faculty: one person, one place ────────────────────────────────────────
  -- startTime/endTime are zero-padded 'HH:MM', so lexicographic comparison is
  -- already chronological — no parsing or casting needed, which also keeps the
  -- predicate index-friendly.
  IF v_is_tba_fac IS NOT TRUE THEN
    SELECT e.id, e."startTime", e."endTime", sub.code AS subject_code,
           d.abbreviation AS dept
      INTO v_clash
      FROM "ScheduleEntry" e
      JOIN "Schedule"   s   ON s.id = e."scheduleId"
      LEFT JOIN "Subject"    sub ON sub.id = e."subjectId"
      LEFT JOIN "Department" d   ON d.id  = s."departmentId"
     WHERE e.id <> NEW.id
       AND e."facultyId" = NEW."facultyId"
       AND e.day = NEW.day
       AND s."semesterId" = v_semester_id
       AND s."isArchived" = FALSE
       AND e."startTime" < NEW."endTime"
       AND NEW."startTime" < e."endTime"
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'Faculty conflict: this faculty member is already assigned to "%" (%-%) on % in the % schedule',
        v_clash.subject_code, v_clash."startTime", v_clash."endTime",
        NEW.day, COALESCE(v_clash.dept, 'another department')
        USING ERRCODE = '23P01';  -- exclusion_violation
    END IF;
  END IF;

  -- ── Room: one room, one class ─────────────────────────────────────────────
  IF v_is_tba_room IS NOT TRUE THEN
    SELECT e.id, e."startTime", e."endTime", sub.code AS subject_code,
           d.abbreviation AS dept
      INTO v_clash
      FROM "ScheduleEntry" e
      JOIN "Schedule"   s   ON s.id = e."scheduleId"
      LEFT JOIN "Subject"    sub ON sub.id = e."subjectId"
      LEFT JOIN "Department" d   ON d.id  = s."departmentId"
     WHERE e.id <> NEW.id
       AND e."roomId" = NEW."roomId"
       AND e.day = NEW.day
       AND s."semesterId" = v_semester_id
       AND s."isArchived" = FALSE
       AND e."startTime" < NEW."endTime"
       AND NEW."startTime" < e."endTime"
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'Room conflict: this room is already booked for "%" (%-%) on % in the % schedule',
        v_clash.subject_code, v_clash."startTime", v_clash."endTime",
        NEW.day, COALESCE(v_clash.dept, 'another department')
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS "ScheduleEntry_global_conflict_guard" ON "ScheduleEntry";

CREATE TRIGGER "ScheduleEntry_global_conflict_guard"
  BEFORE INSERT OR UPDATE OF
    "facultyId", "roomId", "day", "startTime", "endTime", "scheduleId"
  ON "ScheduleEntry"
  FOR EACH ROW
  EXECUTE FUNCTION isched_check_global_resource_conflict();


-- ============================================================================
-- Verification — should return zero rows on a healthy database.
-- Run this to audit for conflicts that predate the guard.
-- ============================================================================
--
--   SELECT a.id AS entry_a, b.id AS entry_b, a.day,
--          a."startTime", a."endTime",
--          da.abbreviation AS dept_a, db_.abbreviation AS dept_b,
--          CASE WHEN a."facultyId" = b."facultyId" THEN 'FACULTY' ELSE 'ROOM' END AS kind
--     FROM "ScheduleEntry" a
--     JOIN "ScheduleEntry" b ON b.id > a.id
--     JOIN "Schedule" sa ON sa.id = a."scheduleId"
--     JOIN "Schedule" sb ON sb.id = b."scheduleId"
--     LEFT JOIN "Department" da  ON da.id  = sa."departmentId"
--     LEFT JOIN "Department" db_ ON db_.id = sb."departmentId"
--    WHERE sa."semesterId" = sb."semesterId"
--      AND sa."isArchived" = FALSE AND sb."isArchived" = FALSE
--      AND a.day = b.day
--      AND a."startTime" < b."endTime" AND b."startTime" < a."endTime"
--      AND (a."facultyId" = b."facultyId" OR a."roomId" = b."roomId");
--
-- ============================================================================
