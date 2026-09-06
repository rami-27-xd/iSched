import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { id } = await params
    const subject = await db.subject.findUnique({
      where: { id },
      include: { department: true },
    })

    if (!subject) return NextResponse.json(apiError("Subject not found"), { status: 404 })
    return NextResponse.json(apiResponse(subject))
  } catch (error) {
    console.error("GET /api/subjects/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { id } = await params
    const body = await req.json()
    const { code, title, units, hoursPerWeek, type, departmentId, yearLevelId, requiredRoomType, semester, year } = body

    const subject = await db.subject.update({
      where: { id },
      data: {
        ...(code !== undefined ? { code } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(units !== undefined ? { units: Number(units), hoursPerWeek: hoursPerWeek ? Number(hoursPerWeek) : Number(units) } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(departmentId !== undefined ? { departmentId } : {}),
        ...(yearLevelId !== undefined ? { yearLevelId: yearLevelId || null } : {}),
        ...(requiredRoomType !== undefined ? { requiredRoomType } : {}),
        ...(semester !== undefined ? { semester } : {}),
        ...(year !== undefined ? { year: Number(year) } : {}),
      },
      include: { department: true, yearLevel: true },
    })

    return NextResponse.json(apiResponse(subject))
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json(apiError("Subject not found"), { status: 404 })
    console.error("PATCH /api/subjects/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { id } = await params

    // Check for related schedule entries
    const entryCount = await db.scheduleEntry.count({ where: { subjectId: id } })
    if (entryCount > 0) {
      return NextResponse.json(
        apiError(`Cannot delete: this subject is used in ${entryCount} schedule ${entryCount === 1 ? "entry" : "entries"}. Remove those entries first.`),
        { status: 409 }
      )
    }

    // Delete related teaching loads first, then the subject
    await db.teachingLoad.deleteMany({ where: { subjectId: id } })
    await db.subject.delete({ where: { id } })
    return NextResponse.json(apiResponse({ deleted: true }))
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json(apiError("Subject not found"), { status: 404 })
    if (error?.code === "P2003") return NextResponse.json(apiError("Cannot delete: this subject is referenced by other records."), { status: 409 })
    console.error("DELETE /api/subjects/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
