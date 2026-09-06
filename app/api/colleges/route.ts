import { NextResponse } from "next/server"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

// GEC/shared education subject prefixes
const GEC_PREFIXES = ["GEC", "GEL", "PATHFIT", "PATHFit", "NST"]

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(apiError("Unauthorized"), { status: 401 })
    }

    const dbUser = await getCurrentUser()
    const userDeptId = getUserDepartmentId(dbUser)
    const isSuperAdmin = dbUser?.role === "SUPER_ADMIN"

    // No semester filter — the curriculum map in the frontend handles
    // placing subjects at the correct year/semester per program.

    // Fetch ALL GEC/GEL/PATHFit/NST subjects (shared education subjects).
    // Multiple departments may have the same code (CIT + CAS both seed GEC subjects).
    // Deduplicate by code, preferring CAS records as the authoritative GEC source.
    const gecSubjectsRaw = await db.subject.findMany({
      where: {
        OR: GEC_PREFIXES.map(p => ({ code: { startsWith: p } })),
      },
      include: { yearLevel: true, department: true },
      orderBy: [{ year: "asc" }, { code: "asc" }],
    })
    const gecByCode = new Map<string, typeof gecSubjectsRaw[0]>()
    for (const g of gecSubjectsRaw) {
      const existing = gecByCode.get(g.code)
      // Prefer the authoritative CAS record; fall back to whatever copy exists (e.g. in CIT track depts)
      const isCAS = g.department?.abbreviation === "CAS"
      if (!existing || isCAS) {
        gecByCode.set(g.code, g)
      }
    }
    const gecSubjects = Array.from(gecByCode.values())

    if (isSuperAdmin) {
      // SUPER_ADMIN = Department Chair
      // - Own department (CAS): sees ALL subjects (GEC + CAS majors)
      // - Departments with subjects (CIT): sees their major subjects + GEC
      // - Departments without subjects: sees only GEC/PATHFit/NST
      const colleges = await db.college.findMany({
        include: {
          departments: {
            include: {
              programs: {
                include: {
                  yearLevels: {
                    include: { sections: true },
                    orderBy: { level: "asc" },
                  },
                },
                orderBy: { name: "asc" },
              },
              subjects: {
                include: { yearLevel: true },
                orderBy: [{ year: "asc" }, { code: "asc" }],
              },
            },
          },
        },
        orderBy: { abbreviation: "asc" },
      })

      // Department Chair: only show colleges/departments that have subjects or programs.
      // For departments WITH programs (CAS, CIT tracks), merge in GEC subjects so the
      // curriculum map can match them. Departments without programs keep only their own subjects.
      const filtered = colleges
        .map((college) => ({
          ...college,
          departments: college.departments.map((dept) => {
            const hasProg = dept.programs.length > 0
            const mergedSubjects = hasProg
              ? [...dept.subjects, ...gecSubjects.filter(g => !dept.subjects.some((s: any) => s.code === g.code))]
              : dept.subjects
            return { ...dept, subjects: mergedSubjects }
          }).filter((dept) => dept.subjects.length > 0 || dept.programs.some((p: any) => p.yearLevels.length > 0)),
        }))
        .filter((college) => college.departments.length > 0)

      return NextResponse.json(apiResponse(filtered))
    } else {
      // ADMIN = Program Chairperson
      // Sees their own department's major subjects + GEC subjects for curriculum map display
      const colleges = await db.college.findMany({
        include: {
          departments: {
            ...(userDeptId ? { where: { id: userDeptId } } : {}),
            include: {
              programs: {
                include: {
                  yearLevels: {
                    include: { sections: true },
                    orderBy: { level: "asc" },
                  },
                },
                orderBy: { name: "asc" },
              },
              subjects: {
                include: { yearLevel: true },
                orderBy: [{ year: "asc" }, { code: "asc" }],
              },
            },
          },
        },
        orderBy: { abbreviation: "asc" },
      })

      // Always merge GEC subjects into every department for display.
      // GEC subjects now live in SS/LLH/MNS sub-departments; any department with programs
      // (CAS parent, CIT, etc.) needs them merged in so the curriculum map can match them.
      const filtered = colleges
        .filter((c) => c.departments.length > 0)
        .map((c) => ({
          ...c,
          departments: c.departments.map((dept) => ({
            ...dept,
            subjects: [...dept.subjects, ...gecSubjects.filter(g => !dept.subjects.some((s: any) => s.code === g.code))],
          })),
        }))

      return NextResponse.json(apiResponse(filtered))
    }
  } catch (error) {
    console.error("GET /api/colleges error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
