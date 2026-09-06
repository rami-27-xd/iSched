import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    const userDeptId = getUserDepartmentId(dbUser)

    const { searchParams } = new URL(req.url)
    const departmentId = searchParams.get("departmentId")
    const type = searchParams.get("type")
    const semester = searchParams.get("semester") // FIRST | SECOND
    const year = searchParams.get("year") // 1-4

    const where: Record<string, unknown> = {}

    // Department filter
    if (departmentId) {
      where.departmentId = departmentId
    } else if (userDeptId) {
      where.departmentId = userDeptId
    }

    // SUPER_ADMIN (Department Chair): sees ALL subjects in their department
    // ADMIN (Program Chair) in CIT or other depts: sees ONLY major subjects (no GEC/GEL/PATHFIT/NST)
    // ADMIN in CAS: sees ALL subjects — Dept Chair handles everything in CAS directly
    const CAS_DEPT_ID = 'cmmzovtv10009qkvur7tude03'
    const isAdminInCAS = dbUser?.role === "ADMIN" && userDeptId === CAS_DEPT_ID

    if (dbUser?.role === "ADMIN" && !isAdminInCAS) {
      // Exclude general education subject codes (GEC, GEL, PATHFIT, NST)
      where.AND = [
        { code: { not: { startsWith: "GEC" } } },
        { code: { not: { startsWith: "GEL" } } },
        { code: { not: { startsWith: "PATHFIT" } } },
        { code: { not: { startsWith: "PATHFit" } } },
        { code: { not: { startsWith: "NST" } } },
      ]

      // Narrow to the program this chair heads. Without this a CIT chair saw
      // every CIT program's majors (283 subjects across 8 programs) instead of
      // their own. Department-shared subjects (programId null — already stripped
      // of GEC above) stay visible, since those are taught across the department.
      const chairProgramId = (dbUser as any).programHead?.programId ?? null
      if (chairProgramId) {
        where.OR = [{ programId: chairProgramId }, { programId: null }]
      }
    }

    // Type filter
    if (type) where.type = type

    // Semester filter
    if (semester) where.semester = semester

    // Year filter
    if (year) where.year = Number(year)

    const subjects = await db.subject.findMany({
      where: where as any,
      include: {
        // Trimmed to the fields consumers actually read (department?.id fallback
        // in the Add/Edit Entry dialogs) — see app/(dashboard)/dashboard/schedules/page.tsx.
        department: { select: { id: true } },
        // Trimmed to the fallback field consumers read (yearLevel?.level) — the
        // nested program was never accessed off a Subject row; ownership checks
        // use the direct `program` relation below instead.
        yearLevel: { select: { level: true } },
        // Direct programId relation — yearLevelId is optional and often unset on
        // major subjects, so cluster ownership can't rely on yearLevel.program alone.
        program: { select: { id: true, abbreviation: true, clusterId: true } },
      },
      orderBy: [{ year: "asc" }, { code: "asc" }],
    })

    return NextResponse.json(apiResponse(subjects))
  } catch (error) {
    console.error("GET /api/subjects error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    // Only SUPER_ADMIN and ADMIN can create subjects
    const dbUser = await getCurrentUser()
    if (!dbUser || !["SUPER_ADMIN", "ADMIN"].includes(dbUser.role)) {
      return NextResponse.json(apiError("Forbidden — insufficient permissions"), { status: 403 })
    }

    const body = await req.json()
    const { code, title, units, hoursPerWeek, type, departmentId, yearLevelId, requiredRoomType, semester, year } = body

    if (!code || !title || !units || !type || !departmentId) {
      return NextResponse.json(apiError("Missing required fields"), { status: 400 })
    }

    const subject = await db.subject.create({
      data: {
        code,
        title,
        units: Number(units),
        hoursPerWeek: hoursPerWeek ? Number(hoursPerWeek) : Number(units),
        type,
        departmentId,
        yearLevelId: yearLevelId || null,
        requiredRoomType: requiredRoomType ?? [],
        semester: semester || "FIRST",
        year: year ? Number(year) : 1,
      },
      include: {
        department: { select: { id: true } },
        yearLevel: { select: { level: true } },
        // Direct programId relation — yearLevelId is optional and often unset on
        // major subjects, so cluster ownership can't rely on yearLevel.program alone.
        program: { select: { id: true, abbreviation: true, clusterId: true } },
      },
    })

    return NextResponse.json(apiResponse(subject), { status: 201 })
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(apiError("Subject code already exists in this department"), { status: 409 })
    }
    console.error("POST /api/subjects error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
