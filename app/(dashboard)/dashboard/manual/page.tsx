"use client"

import { useState } from "react"
import Link from "next/link"
import { BookOpen, Workflow, MapPin, ShieldCheck, ChevronDown, ChevronRight, UserCheck, ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useUserRole } from "@/components/layout/dashboard-shell"
import { WorkflowDiagram, DiagramLegend } from "@/components/manual/workflow-diagram"
import { ROLE_MANUALS, manualForRole, type RoleManual } from "@/lib/manual-workflows"
import { ROLE_LABELS, type UserRole } from "@/lib/roles"

/**
 * User Manual — one visual manual per role. The signed-in role's manual opens
 * first: a workflow diagram of the steps THEY perform (with the points where
 * they wait on someone else and the rules the app enforces), then where each
 * step lives in the app, then the rules in one line each. The other roles'
 * manuals are one click away, so a chairperson can see what the Dean or the
 * NSTP Director does without reading a wall of text.
 */
export default function UserManualPage() {
  const role = useUserRole() as UserRole
  const own = manualForRole(role)
  const [selected, setSelected] = useState<UserRole>(own?.role ?? "SUPER_ADMIN")
  const manual = manualForRole(selected) ?? own ?? ROLE_MANUALS.SUPER_ADMIN
  const roles = Object.values(ROLE_MANUALS)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Hero + role switcher */}
      <Card className="border-[#1B4332]/20 bg-gradient-to-r from-[#1B4332]/5 to-transparent">
        <CardContent className="flex flex-col gap-4 p-5">
          <div>
            <p className="flex items-center gap-2 text-base font-semibold text-[#1B4332]">
              <BookOpen className="h-5 w-5" />
              How to use iSched
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              You are signed in as <strong className="text-foreground">{ROLE_LABELS[role] ?? role}</strong>. Your manual is
              below — one diagram of what you do, in order. Switch roles to see what the others do.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Manual for role">
            {roles.map((m) => {
              const active = m.role === selected
              const mine = m.role === role
              return (
                <button
                  key={m.role}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelected(m.role)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active ? "border-[#1B4332] bg-[#1B4332] text-white" : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {ROLE_LABELS[m.role]}
                  {mine && <span className={`rounded-full px-1.5 text-[9px] font-semibold ${active ? "bg-white/25" : "bg-[#D4AF37]/20 text-[#7A5A0E]"}`}>you</span>}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <RoleManualView manual={manual} isOwn={manual.role === role} />

      <AccountsSection />

      <p className="text-center text-xs text-muted-foreground">
        Need something that isn&apos;t here? Ask your Dean, or open{" "}
        <Link href="/dashboard/schedules" className="underline underline-offset-2">Manage Schedules</Link> to get started.
      </p>
    </div>
  )
}

function RoleManualView({ manual, isOwn }: { manual: RoleManual; isOwn: boolean }) {
  return (
    <div className="space-y-6">
      {/* Workflow diagram */}
      <Card id="workflow" className="scroll-mt-24">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Workflow className="h-4 w-4 text-[#1B4332]" />
            {manual.heading}
            {isOwn && <span className="rounded-full bg-[#D4AF37]/20 px-2 py-0.5 text-[10px] font-semibold text-[#7A5A0E]">your workflow</span>}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{manual.summary}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <DiagramLegend />
          <div className="rounded-lg border bg-white p-2 sm:p-4">
            <WorkflowDiagram nodes={manual.nodes} edges={manual.edges} title={`${ROLE_LABELS[manual.role]} workflow`} />
          </div>
        </CardContent>
      </Card>

      {/* Where things are */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-[#1B4332]" />
            Where each step happens
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {manual.places.map((p) => (
              <Link
                key={p.title}
                href={p.href}
                className="group flex flex-col gap-1 rounded-lg border p-3 transition-colors hover:border-[#1B4332]/40 hover:bg-[#1B4332]/5"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-[#1B4332]">
                  {p.title}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="text-xs text-muted-foreground">{p.body}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rules */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-[#1B4332]" />
            Rules the app enforces for the {ROLE_LABELS[manual.role]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {manual.rules.map((r) => (
              <li key={r} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D4AF37]" />
                <span className="leading-relaxed">{r}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

/** Accounts and approval — the one part that is the same for everyone, collapsed. */
function AccountsSection() {
  const [open, setOpen] = useState(false)
  return (
    <Card id="accounts" className="scroll-mt-24">
      <CardHeader className="pb-3">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left" aria-expanded={open}>
          <UserCheck className="h-4 w-4 text-[#1B4332]" />
          <CardTitle className="text-base">Accounts and approval</CardTitle>
          {open ? <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" /> : <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />}
        </button>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Register with your exact title", body: "Dean, Department Chairperson, Program Chairperson, PATHFit Director or NSTP Director." },
              { title: "Chairpersons wait for their Dean", body: "The Dean of your department approves Department and Program Chairperson accounts in User Management. Until then you see a Pending Approval screen." },
              { title: "Deans are approved automatically", body: "The first Dean of a department is approved on sign-up; the app refuses a second Dean for the same department." },
              { title: "One Director each", body: "Exactly one PATHFit Director and one NSTP Director exist for the whole university, approved automatically; a second sign-up is refused." },
              { title: "Faculty do not sign in", body: "They are records kept by their chairperson and receive their schedule as a printed Teaching Load." },
              { title: "Each term is separate", body: "Availability and bookings are per Academic Year + Semester (1st and 2nd semester); archived schedules are ignored everywhere." },
            ].map((c) => (
              <div key={c.title} className="rounded-lg border p-3">
                <p className="text-sm font-semibold">{c.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.body}</p>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
