"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function SectionsPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/dashboard/subjects")
  }, [router])

  return (
    <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
      Redirecting to Courses / Departments…
    </div>
  )
}
