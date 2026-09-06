import { redirect } from "next/navigation"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { createClient } from "@/lib/supabase/server"
import { ensureDbUser } from "@/lib/auth"
import { ShieldAlert } from "lucide-react"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/sign-in")
  }

  let userRole: string = "FACULTY"
  let userName = "User"
  let userEmail = user.email ?? ""
  let isApproved = false
  let defaultCollegeId: string | null = null

  try {
    const dbUser = await ensureDbUser(user)
    if (dbUser) {
      userRole = dbUser.role
      userName = `${dbUser.firstName} ${dbUser.lastName}`.trim() || "User"
      userEmail = dbUser.email ?? ""
      isApproved = dbUser.isApproved

      // Resolve the college this user belongs to for per-college filtering
      defaultCollegeId =
        (dbUser as any).department?.college?.id ??
        (dbUser as any).departmentChair?.department?.college?.id ??
        (dbUser as any).programHead?.program?.department?.college?.id ??
        (dbUser as any).faculty?.department?.college?.id ??
        null
    }
  } catch {
    // DB not connected — use Supabase user data, treat as unapproved
    userName = user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "User"
    isApproved = false
  }

  // Block unapproved users with a pending approval screen
  if (!isApproved) {
    return <PendingApprovalScreen userName={userName} userEmail={userEmail} userRole={userRole} />
  }

  return (
    <DashboardShell
      userRole={userRole}
      userName={userName}
      userEmail={userEmail}
      defaultCollegeId={defaultCollegeId}
    >
      {children}
    </DashboardShell>
  )
}

function PendingApprovalScreen({ userName, userEmail, userRole }: { userName: string; userEmail: string; userRole: string }) {
  const roleLabel: Record<string, string> = {
    SUPER_ADMIN: "Department Chair",
    ADMIN: "Program Chair",
    FACULTY: "Faculty",
  }

  return (
    <div className="min-h-screen bg-[#1B4332] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D4AF37]/20 mb-6">
          <ShieldAlert className="h-8 w-8 text-[#D4AF37]" />
        </div>
        <h1 className="text-2xl font-bold text-white">Account Pending Approval</h1>
        <p className="mt-3 text-sm text-white/60">
          Hello <strong className="text-white">{userName}</strong>, your account is registered but not yet approved.
        </p>

        <div className="mt-6 rounded-xl bg-white/10 border border-white/20 p-5 text-left space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-white/50">Email</span>
            <span className="text-white font-medium">{userEmail}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/50">Requested Role</span>
            <span className="text-[#D4AF37] font-medium">{roleLabel[userRole] ?? userRole}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/50">Status</span>
            <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-300">
              Pending Approval
            </span>
          </div>
        </div>

        <p className="mt-4 text-xs text-white/40">
          A Department Chair (Super Admin) must approve your account. Please contact your department for assistance.
        </p>

        <form action="/auth/sign-out" method="POST" className="mt-6">
          <button
            type="submit"
            className="rounded-lg bg-white/10 border border-white/20 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
          >
            Sign Out
          </button>
        </form>
      </div>
    </div>
  )
}
