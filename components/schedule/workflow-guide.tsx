"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Workflow, FlaskConical, GraduationCap, Users, ShieldCheck, ArrowDown } from "lucide-react"

type RoleKey = "PC_CIT" | "DC" | "PC_ALL" | "FACULTY"

const ROLE_META: Record<RoleKey, { label: string; badge: string; dot: string }> = {
  PC_CIT: { label: "CIT Program Chair", badge: "bg-[#D4AF37]/15 text-[#8a6d1a] border-[#D4AF37]/40", dot: "bg-[#D4AF37]" },
  DC: { label: "Dept Chairperson", badge: "bg-[#1B4332]/10 text-[#1B4332] border-[#1B4332]/30", dot: "bg-[#1B4332]" },
  PC_ALL: { label: "All Program Chairs", badge: "bg-[#D4AF37]/15 text-[#8a6d1a] border-[#D4AF37]/40", dot: "bg-[#D4AF37]" },
  FACULTY: { label: "Faculty", badge: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
}

interface Step {
  n: number
  role: RoleKey
  title: string
  body: string
  hard?: boolean
}

const STEPS: Step[] = [
  {
    n: 1,
    role: "PC_CIT",
    title: "CIT pre-plots laboratory subjects only",
    body: "Before anything else, the CIT Program Chair plots CIT lab subjects. No lecture/major subjects yet — labs are locked in first. (CIT only.)",
    hard: true,
  },
  {
    n: 2,
    role: "DC",
    title: "Dept Chair generates GEC/GEL for all colleges",
    body: "The DC plots minor/general-education subjects university-wide. Hard-blocked from any slot a CIT lab already occupies — no override, no bypass.",
    hard: true,
  },
  {
    n: 3,
    role: "DC",
    title: "Lab conflict? DC requests the CIT chair to move it",
    body: "The DC can't edit CIT labs. If a lab blocks a GEC placement, the DC sends a tracked request to the owning CIT Program Chair to move it.",
  },
  {
    n: 4,
    role: "DC",
    title: "Dept Chair finalizes / publishes the GEC/GEL schedule",
    body: "Once GEC/GEL is in place it becomes the fixed backbone. This unlocks the Program Chairs to add their majors.",
  },
  {
    n: 5,
    role: "PC_ALL",
    title: "Program Chairs add their full major load",
    body: "Every Program Chair (including CIT) now adds their majors — lecture and lab — built around the already-placed GEC/GEL.",
  },
  {
    n: 6,
    role: "DC",
    title: "Combined schedule published to faculty",
    body: "The Dept Chair approves and publishes the finalized, combined schedule.",
  },
  {
    n: 7,
    role: "FACULTY",
    title: "Faculty view / print their schedule",
    body: "Faculty access the finalized, published schedule (view and print only).",
  },
]

const RULES = [
  "Only the owning CIT Program Chair may add, edit, move, or delete a CIT laboratory subject — not the Dept Chair, not another program's chair.",
  "The Dept Chair may view a Program Chair's major-subject schedule but cannot edit it (except in CAS, where the DC holds delegated PC-level access).",
  "Program Chairs edit only within their own college; each sees only their own college's schedule.",
  "Both DC and PC are bound by faculty availability, specialization, maximum unit load, and room/building availability.",
  "GEC/GEL faculty may be assigned across departments (not specialized); PC assignments stay within their own majors.",
]

export function WorkflowGuideButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Workflow className="mr-2 h-4 w-4" />
        <span className="hidden sm:inline">Workflow Guide</span>
        <span className="sm:hidden">Workflow</span>
      </Button>
      <WorkflowGuideDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export function WorkflowGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-[#1B4332]" />
            Scheduling Workflow
          </DialogTitle>
          <DialogDescription>
            The sequential process for building a semester schedule. The Department Chair plots GEC/GEL first;
            Program Chairs add their majors afterward.
          </DialogDescription>
        </DialogHeader>

        {/* Legend */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ROLE_META) as RoleKey[])
            .filter((k) => k !== "PC_ALL")
            .map((k) => (
              <span key={k} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${ROLE_META[k].badge}`}>
                <span className={`h-2 w-2 rounded-full ${ROLE_META[k].dot}`} />
                {ROLE_META[k].label}
              </span>
            ))}
        </div>

        {/* Steps */}
        <ol className="mt-2 space-y-0">
          {STEPS.map((step, i) => {
            const meta = ROLE_META[step.role]
            return (
              <li key={step.n} className="relative">
                <div className="flex gap-3">
                  {/* number + connector */}
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${meta.dot === "bg-muted-foreground" ? "bg-muted-foreground" : meta.dot}`}>
                      {step.n}
                    </div>
                    {i < STEPS.length - 1 && <div className="my-1 w-px flex-1 bg-border" />}
                  </div>
                  {/* content */}
                  <div className={`flex-1 rounded-lg border p-3 ${i < STEPS.length - 1 ? "mb-3" : ""} ${step.hard ? "border-[#1B4332]/30 bg-[#1B4332]/[0.03]" : "bg-card"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{step.title}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${meta.badge}`}>
                        {step.role === "PC_CIT" && <FlaskConical className="h-3 w-3" />}
                        {step.role === "FACULTY" && <Users className="h-3 w-3" />}
                        {(step.role === "DC" || step.role === "PC_ALL") && <GraduationCap className="h-3 w-3" />}
                        {meta.label}
                      </span>
                      {step.hard && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                          hard constraint
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{step.body}</p>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>

        {/* Rules */}
        <div className="mt-2 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/[0.06] p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1B4332]">
            <ShieldCheck className="h-4 w-4" />
            Permissions &amp; restrictions
          </div>
          <ul className="space-y-1.5">
            {RULES.map((r, i) => (
              <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                <ArrowDown className="mt-0.5 h-3 w-3 shrink-0 rotate-[-90deg] text-[#D4AF37]" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Special cases */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs font-semibold text-[#1B4332]">CAS — delegated</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The Program Chair delegates all duties to the Dept Chair, who holds full PC-level access for the CAS
              department.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs font-semibold text-[#1B4332]">CIT — labs first</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The CIT chair may add only laboratory subjects, and only before the Dept Chair generates GEC/GEL
              (Step 1).
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
