import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiResponse, apiError } from "@/lib/api-helpers"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { id } = await params
    const section = await db.section.findUnique({
      where: { id },
      include: {
        yearLevel: { include: { program: { include: { department: true } } } },
      },
    })

    if (!section) return NextResponse.json(apiError("Section not found"), { status: 404 })
    return NextResponse.json(apiResponse(section))
  } catch (error) {
    console.error("GET /api/sections/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { id } = await params
    const body = await req.json()
    const { name, capacity } = body

    const section = await db.section.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(capacity !== undefined ? { capacity: Number(capacity) } : {}),
      },
      include: {
        yearLevel: { include: { program: { include: { department: true } } } },
      },
    })

    return NextResponse.json(apiResponse(section))
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json(apiError("Section not found"), { status: 404 })
    console.error("PATCH /api/sections/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json(apiError("Unauthorized"), { status: 401 })

    const { id } = await params
    await db.section.delete({ where: { id } })
    return NextResponse.json(apiResponse({ deleted: true }))
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json(apiError("Section not found"), { status: 404 })
    console.error("DELETE /api/sections/[id] error:", error)
    return NextResponse.json(apiError("Internal server error"), { status: 500 })
  }
}
