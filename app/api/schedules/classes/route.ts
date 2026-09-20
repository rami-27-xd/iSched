import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { apiResponse, apiError } from "@/lib/api-helpers"

const PAGE_SIZE = 20
const EXPORT_LIMIT = 5000
const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]

// GET /api/schedules/classes?semesterId=[&page&search&departmentId&programId&day&status][&format=csv]
// "Scheduled classes" (System Logs → Classes): every class row of the term's
// non-archived schedules — section, course (program), subject, faculty, room,
// day and time — for the roles that read System Logs:
//   DEAN / ADMIN — their own department's sections
//   SUPER_ADMIN  — every department; `departmentId` narrows to one
// Merged NSTP rows (one per section) collapse into one line listing every
// section. Server-paginated (20/page) since a term holds thousands of rows;
// `format=csv` downloads the filtered list (≤ EXPORT_LIMIT rows). The response
// also carries totals (classes, sections, programs, subjects) and the
// departments present, for the header line and the colour key.
const CLASS_ROLES = ["DEAN", "SUPER_ADMIN", "ADMIN"]

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || !CLASS_ROLES.includes(dbUser.role)) {
      return NextResponse.json(apiError("Only the Dean, Department Chairpersons and Program Chairpersons can view scheduled classes"), { status: 403 })
    }
    const { searchParams } = new URL(req.url)
    const isUniversityWide = dbUser.role === "SUPER_ADMIN"
    const ownDeptId = getUserDepartmentId(dbUser)
    const deptId = isUniversityWide ? (searchParams.get("departmentId") || null) : ownDeptId
    const empty = { items: [], total: 0, page: 1, pageSize: PAGE_SIZE, totals: { classes: 0, sections: 0, programs: 0, subjects: 0 }, departments: [], programs: [] }
    if (!isUniversityWide && !deptId) return NextResponse.json(apiResponse(empty))

    let semesterId = searchParams.get("semesterId")
    if (!semesterId) {
      const active =
        (await db.semester.findFirst({ where: { isActive: true }, select: { id: true } })) ??
        (await db.semester.findFirst({ orderBy: { academicYear: { startYear: "desc" } }, select: { id: true } }))
      semesterId = active?.id ?? null
    }
    if (!semesterId) return NextResponse.json(apiResponse(empty))

    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1)
    const search = (searchParams.get("search") ?? "").trim()
    const programId = searchParams.get("programId") || null
    const day = searchParams.get("day") || null
    const status = searchParams.get("status") || null
    const wantCsv = searchParams.get("format") === "csv"

    const where: any = {
      schedule: { semesterId, isArchived: false, ...(status ? { status } : {}) },
      ...(deptId ? { section: { yearLevel: { program: { departmentId: deptId } } } } : {}),
      ...(day ? { day } : {}),
    }
    if (programId) {
      where.section = { yearLevel: { program: { id: programId, ...(deptId ? { departmentId: deptId } : {}) } } }
    }
    if (search) {
      where.OR = [
        { subject: { code: { contains: search, mode: "insensitive" } } },
        { subject: { title: { contains: search, mode: "insensitive" } } },
        { section: { name: { contains: search, mode: "insensitive" } } },
        { room: { code: { contains: search, mode: "insensitive" } } },
        { facultyName: { contains: search, mode: "insensitive" } },
        { faculty: { user: { firstName: { contains: search, mode: "insensitive" } } } },
        { faculty: { user: { lastName: { contains: search, mode: "insensitive" } } } },
        { section: { yearLevel: { program: { abbreviation: { contains: search, mode: "insensitive" } } } } },
      ]
    }

    // Everything matching, ordered like a timetable; merged NSTP rows are
    // collapsed in memory (one line per merge group + session), then paged.
    const rows = await db.scheduleEntry.findMany({
      where,
      select: {
        id: true,
        day: true,
        startTime: true,
        endTime: true,
        set: true,
        mergeGroupId: true,
        facultyName: true,
        subject: { select: { code: true, title: true, type: true, units: true } },
        faculty: { select: { employeeId: true, user: { select: { firstName: true, lastName: true } } } },
        room: { select: { code: true, building: { select: { code: true } } } },
        section: {
          select: {
            id: true,
            name: true,
            yearLevel: { select: { level: true, program: { select: { id: true, abbreviation: true, name: true } } } },
          },
        },
        schedule: {
          select: {
            id: true,
            status: true,
            department: { select: { id: true, abbreviation: true, name: true, college: { select: { abbreviation: true } } } },
          },
        },
      },
      orderBy: [{ day: "asc" }, { startTime: "asc" }, { subject: { code: "asc" } }],
    })

    const merged = new Map<string, any>()
    const items: any[] = []
    const sectionIds = new Set<string>()
    const programIds = new Set<string>()
    const subjectCodes = new Set<string>()
    const departments = new Map<string, { id: string; abbreviation: string; name: string; college: string }>()
    const programs = new Map<string, { id: string; abbreviation: string; name: string; department: string }>()
    for (const e of rows) {
      const dept = e.schedule.department
      const prog = e.section?.yearLevel?.program
      sectionIds.add(e.section?.id ?? e.id)
      if (prog) {
        programIds.add(prog.id)
        programs.set(prog.id, { id: prog.id, abbreviation: prog.abbreviation, name: prog.name, department: dept?.abbreviation ?? "" })
      }
      if (e.subject?.code) subjectCodes.add(e.subject.code)
      if (dept) departments.set(dept.id, { id: dept.id, abbreviation: dept.abbreviation, name: dept.name, college: dept.college?.abbreviation ?? "" })

      const mergeKey = e.mergeGroupId ? `${e.mergeGroupId}|${e.day}|${e.startTime}|${e.endTime}` : null
      if (mergeKey && merged.has(mergeKey)) {
        const line = merged.get(mergeKey)
        if (e.section?.name && !line.sections.includes(e.section.name)) line.sections.push(e.section.name)
        continue
      }
      const line = {
        id: e.id,
        day: e.day,
        startTime: e.startTime,
        endTime: e.endTime,
        set: e.set,
        merged: !!e.mergeGroupId,
        subjectCode: e.subject?.code ?? "",
        subjectTitle: e.subject?.title ?? "",
        subjectType: e.subject?.type ?? "LECTURE",
        units: e.subject?.units ?? null,
        sections: e.section?.name ? [e.section.name] : [],
        yearLevel: e.section?.yearLevel?.level ?? null,
        program: prog?.abbreviation ?? "",
        programName: prog?.name ?? "",
        faculty:
          e.facultyName ??
          (e.faculty?.user ? `${e.faculty.user.firstName} ${e.faculty.user.lastName}`.trim() : e.faculty?.employeeId ?? "—"),
        room: e.room?.code ?? "",
        building: e.room?.building?.code ?? "",
        scheduleId: e.schedule.id,
        scheduleStatus: e.schedule.status,
        department: dept?.abbreviation ?? "",
        departmentName: dept?.name ?? "",
      }
      if (mergeKey) merged.set(mergeKey, line)
      items.push(line)
    }
    // Merged lines carry the combined section label.
    for (const line of items) line.section = line.sections.join(" + ")
    items.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.startTime.localeCompare(b.startTime) || a.subjectCode.localeCompare(b.subjectCode) || a.section.localeCompare(b.section))

    const totals = { classes: items.length, sections: sectionIds.size, programs: programIds.size, subjects: subjectCodes.size }

    if (wantCsv) {
      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const header = ["Department", "Course", "Year", "Section", "Subject", "Title", "Type", "Set", "Faculty", "Room", "Building", "Day", "Start", "End", "Schedule status"]
      const lines = items.slice(0, EXPORT_LIMIT).map((l) =>
        [l.department, l.program, l.yearLevel ?? "", l.section, l.subjectCode, l.subjectTitle, l.subjectType, l.set ?? "", l.faculty, l.room, l.building, l.day, l.startTime, l.endTime, l.scheduleStatus].map(esc).join(",")
      )
      const csv = [header.join(","), ...lines].join("\r\n")
      const stamp = new Date().toISOString().slice(0, 10)
      return new NextResponse(csv, {
        status: 200,
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="scheduled-classes-${stamp}.csv"` },
      })
    }

    const start = (page - 1) * PAGE_SIZE
    return NextResponse.json(
      apiResponse({
        items: items.slice(start, start + PAGE_SIZE),
        total: items.length,
        page,
        pageSize: PAGE_SIZE,
        totals,
        departments: [...departments.values()].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation)),
        programs: [...programs.values()].sort((a, b) => a.department.localeCompare(b.department) || a.abbreviation.localeCompare(b.abbreviation)),
      })
    )
  } catch (error) {
    console.error("GET /api/schedules/classes error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
