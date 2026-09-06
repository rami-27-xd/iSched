import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

type UserRole = "SUPER_ADMIN" | "ADMIN" | "FACULTY"

/**
 * Server-side role guard for pages.
 * Call at the top of a server component or in generateMetadata.
 * Redirects to the appropriate page if the user lacks access.
 */
export async function requirePageRole(...allowedRoles: UserRole[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/sign-in")
  }

  const dbUser = await getCurrentUser()
  const role = (dbUser?.role ?? "FACULTY") as UserRole

  if (!allowedRoles.includes(role)) {
    redirect("/dashboard")
  }

  return { user, dbUser, role }
}
