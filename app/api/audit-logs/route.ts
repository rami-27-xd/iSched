import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAuthenticatedUser, getCurrentUser, getUserDepartmentId } from "@/lib/auth"
import { apiResponse, apiError } from "@/lib/api-helpers"
import { AUDIT_ACTION_LABELS } from "@/lib/audit-labels"
import { formatRole } from "@/lib/roles"

const PAGE_SIZE = 20
const EXPORT_LIMIT = 5000

// GET /api/audit-logs?page=&action=&search=&from=&to=&role=[&format=csv]
// Dean only (RBAC spec §1 — "System Logs"). Returns the actions taken within the
// Dean's department: rows whose subject department is theirs OR whose actor
// belongs to their department, newest first. Each row is enriched with the
// schedule it concerns (term · department · status) so the log reads on its own.
//
//   from / to  — inclusive calendar dates (YYYY-MM-DD) in the server's timezone
//   role       — actor role (SUPER_ADMIN, ADMIN, …)
//   format=csv — the whole filtered log (up to EXPORT_LIMIT rows) as a download
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const dbUser = await getCurrentUser()
    if (!dbUser || dbUser.role !== "DEAN") {
      return NextResponse.json(apiError("Only the Dean can view system logs"), { status: 403 })
    }
    const deptId = getUserDepartmentId(dbUser)
    if (!deptId) {
      return NextResponse.json(apiResponse({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE }))
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1)
    const action = searchParams.get("action") ?? ""
    const search = (searchParams.get("search") ?? "").trim()
    const role = searchParams.get("role") ?? ""
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const wantCsv = searchParams.get("format") === "csv"

    const where: any = {
      OR: [{ departmentId: deptId }, { actorDepartmentId: deptId }],
    }
    const and: any[] = []
    if (action && action !== "all") {
      // "schedule" matches every schedule.* action; "entry.created" matches exactly.
      and.push({ action: action.includes(".") ? action : { startsWith: `${action}.` } })
    }
    if (role && role !== "all") and.push({ actorRole: role })
    if (search) {
      and.push({
        OR: [
          { summary: { contains: search, mode: "insensitive" } },
          { actorName: { contains: search, mode: "insensitive" } },
        ],
      })
    }
    const createdAt: any = {}
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) createdAt.gte = new Date(`${from}T00:00:00`)
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) createdAt.lte = new Date(`${to}T23:59:59.999`)
    if (Object.keys(createdAt).length) and.push({ createdAt })
    if (and.length) where.AND = and

    const [total, rows] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: wantCsv ? 0 : (page - 1) * PAGE_SIZE,
        take: wantCsv ? EXPORT_LIMIT : PAGE_SIZE,
      }),
    ])

    // Schedule context for the rows that concern one (term · department · status).
    const scheduleIds = [...new Set(rows.map((r) => r.scheduleId).filter((id): id is string => !!id))]
    const schedules = scheduleIds.length
      ? await db.schedule.findMany({
          where: { id: { in: scheduleIds } },
          select: {
            id: true,
            status: true,
            semester: { select: { type: true, academicYear: { select: { label: true } } } },
            department: { select: { abbreviation: true, name: true } },
          },
        })
      : []
    const scheduleById = new Map(
      schedules.map((s) => [
        s.id,
        {
          term: `${s.semester?.type === "FIRST" ? "1st" : s.semester?.type === "SECOND" ? "2nd" : "Summer"} Semester ${s.semester?.academicYear?.label ?? ""}`.trim(),
          department: s.department?.abbreviation ?? "",
          departmentName: s.department?.name ?? "",
          status: s.status,
        },
      ])
    )
    const items = rows.map((r) => ({
      ...r,
      schedule: r.scheduleId ? (scheduleById.get(r.scheduleId) ?? null) : null,
    }))

    if (wantCsv) {
      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const header = ["Date", "Time", "Action", "Details", "By", "Role", "Schedule", "Schedule status", "More"]
      const lines = items.map((r) => {
        const d = new Date(r.createdAt)
        return [
          d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" }),
          d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          (AUDIT_ACTION_LABELS as Record<string, string>)[r.action] ?? r.action,
          r.summary,
          r.actorName,
          formatRole(r.actorRole),
          r.schedule ? `${r.schedule.term} · ${r.schedule.department}` : "",
          r.schedule?.status ?? "",
          r.metadata ? JSON.stringify(r.metadata) : "",
        ].map(esc).join(",")
      })
      const csv = [header.join(","), ...lines].join("\r\n")
      const stamp = new Date().toISOString().slice(0, 10)
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="system-logs-${stamp}.csv"`,
        },
      })
    }

    return NextResponse.json(apiResponse({ items, total, page, pageSize: PAGE_SIZE }))
  } catch (error) {
    console.error("GET /api/audit-logs error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
