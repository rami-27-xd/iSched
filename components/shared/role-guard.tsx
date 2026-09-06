"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useUserRole } from "@/components/layout/dashboard-shell"
import { ShieldAlert } from "lucide-react"

type UserRole = "SUPER_ADMIN" | "ADMIN" | "FACULTY"

interface RoleGuardProps {
  allowedRoles: UserRole[]
  children: React.ReactNode
}

/**
 * Client-side role guard. Wraps page content and redirects unauthorized users.
 * Usage: <RoleGuard allowedRoles={["SUPER_ADMIN", "ADMIN"]}>...page content...</RoleGuard>
 */
export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const userRole = useUserRole()
  const router = useRouter()
  const hasAccess = allowedRoles.includes(userRole as UserRole)

  useEffect(() => {
    if (!hasAccess) {
      router.replace("/dashboard")
    }
  }, [hasAccess, userRole, router])

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <ShieldAlert className="h-12 w-12 mb-4" />
        <p className="text-lg font-medium">Access Denied</p>
        <p className="text-sm">Redirecting...</p>
      </div>
    )
  }

  return <>{children}</>
}
