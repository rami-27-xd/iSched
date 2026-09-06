"use client"

import Link from "next/link"
import { useUserRole } from "@/components/layout/dashboard-shell"
import { KPICard } from "@/components/shared/kpi-card"
import {
  CalendarDays,
  Users,
  DoorOpen,
  AlertTriangle,
  TrendingUp,
  Loader2,
  Clock,
  BookOpen,
  Building2,
  MapPin,
  Inbox,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDashboardStats } from "@/hooks/use-data"
import { useQuery } from "@tanstack/react-query"
import { useIsMobile } from "@/hooks/use-mobile"

export default function DashboardPage() {
  const contextRole = useUserRole()
  const isMobile = useIsMobile()

  const { data, isLoading } = useDashboardStats()

  const stats = data?.stats ?? {
    activeSchedules: 0,
    totalFaculty: 0,
    availableRooms: 0,
    conflictsDetected: 0,
    unassignedSubjects: 0,
  }

  const recentSchedules: any[] = data?.recentSchedules ?? []
  const userRole: string = contextRole ?? data?.userRole ?? "FACULTY"
  const isFaculty = userRole === "FACULTY"

  // Fetch personal teaching schedule for ANY user who has a faculty record
  // (Department Chair / Program Chair can also have teaching assignments)
  const { data: myScheduleData, isLoading: loadingMySchedule } = useQuery({
    queryKey: ["my-schedule"],
    queryFn: async () => {
      const res = await fetch("/api/faculty/my-schedule")
      const json = await res.json()
      if (!res.ok) return []
      return json.data ?? []
    },
  })

  const myEntries: any[] = myScheduleData ?? []
  const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]
  const DAY_LABELS: Record<string, string> = {
    MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday",
    THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday",
  }

  // Group faculty entries by day
  const byDay = DAY_ORDER.map((day) => ({
    day,
    label: DAY_LABELS[day],
    entries: myEntries
      .filter((e: any) => e.day === day)
      .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime)),
  })).filter((d) => d.entries.length > 0)

  // ─── FACULTY DASHBOARD ────────────────────────────────────────────────
  if (isFaculty) {
    return (
      <div className="space-y-6">
        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <KPICard
            title="Total Classes"
            value={loadingMySchedule ? "—" : String(myEntries.length)}
            icon={BookOpen}
            variant="default"
          />
          <KPICard
            title="Teaching Days"
            value={loadingMySchedule ? "—" : String(byDay.length)}
            icon={CalendarDays}
            variant="accent"
          />
          <KPICard
            title="This Week"
            value={loadingMySchedule ? "—" : `${myEntries.length} classes`}
            icon={Clock}
            variant="default"
          />
        </div>

        {/* Schedule overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              My Weekly Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMySchedule ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading schedule...
              </div>
            ) : byDay.length === 0 ? (
              <div className="py-10 text-center">
                <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No published schedule found for this semester.</p>
                <p className="text-xs text-muted-foreground mt-1">Your schedule will appear here once the Program Chair publishes it.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {byDay.map(({ day, label, entries: dayEntries }) => (
                  <div key={day}>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-[#1B4332]">{label}</h3>
                      <span className="text-xs text-muted-foreground">({dayEntries.length} {dayEntries.length === 1 ? "class" : "classes"})</span>
                    </div>
                    <div className="space-y-2">
                      {dayEntries.map((entry: any) => (
                        <div key={entry.id} className={`flex ${isMobile ? 'flex-col gap-1' : 'flex-col sm:flex-row sm:items-start gap-1 sm:gap-3'} rounded-lg border border-border p-3 bg-muted/40`}>
                          <div className={isMobile ? '' : 'sm:w-24 shrink-0'}>
                            <span className="text-xs sm:text-sm font-semibold text-[#1B4332]">
                              {entry.startTime}–{entry.endTime}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs sm:text-sm font-medium">{entry.subject?.code} — {entry.subject?.title}</span>
                              {entry.subject?.units && (
                                <Badge variant="outline" className="text-[10px]">{entry.subject.units} units</Badge>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {entry.room?.code}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {entry.section?.name}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── ADMIN / SUPER_ADMIN DASHBOARD ─────────────────────────────────────

  const kpiData = [
    {
      title: "Active Schedules",
      value: isLoading ? "—" : String(stats.activeSchedules),
      icon: CalendarDays,
      variant: "default" as const,
    },
    {
      title: "Total Faculty",
      value: isLoading ? "—" : String(stats.totalFaculty),
      icon: Users,
      variant: "accent" as const,
    },
    {
      title: "Rooms Available",
      value: isLoading ? "—" : String(stats.availableRooms),
      icon: DoorOpen,
      variant: "default" as const,
    },
    {
      title: "Conflicts Detected",
      value: isLoading ? "—" : String(stats.conflictsDetected),
      icon: AlertTriangle,
      variant: "error" as const,
    },
    {
      title: "Unassigned Subjects",
      value: isLoading ? "—" : String(stats.unassignedSubjects),
      icon: Inbox,
      variant: "accent" as const,
    },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {kpiData.map((kpi) => (
          <KPICard
            key={kpi.title}
            title={kpi.title}
            value={kpi.value}
            icon={kpi.icon}
            variant={kpi.variant}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Schedules */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Recent Schedules
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-24 items-center justify-center text-muted-foreground text-sm">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…
              </div>
            ) : recentSchedules.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No schedules yet.</p>
            ) : (
              <div className="space-y-3">
                {recentSchedules.map((s: any) => (
                  <Link
                    key={s.id}
                    href="/dashboard/schedules"
                    className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {s.semester?.type === "FIRST" ? "1st" : s.semester?.type === "SECOND" ? "2nd" : "Summer"} Semester{" "}
                        {s.semester?.academicYear?.label}
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">{s._count?.entries ?? 0} entries</p>
                        {s._count?.unassigned > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            <AlertTriangle className="h-3 w-3" />
                            {s._count.unassigned} unassigned
                          </span>
                        )}
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Teaching Schedule — for admins who also have teaching assignments */}
        {!isFaculty && myEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              My Teaching Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMySchedule ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…
              </div>
            ) : (
              <div className="space-y-3">
                {byDay.map(({ day, label, entries: dayEntries }) => (
                  <div key={day}>
                    <h3 className="text-sm font-semibold text-[#1B4332] mb-1">{label} <span className="font-normal text-xs text-muted-foreground">({dayEntries.length} {dayEntries.length === 1 ? "class" : "classes"})</span></h3>
                    <div className="space-y-1.5">
                      {dayEntries.map((entry: any) => (
                        <div key={entry.id} className="flex items-center gap-3 rounded-lg border p-2 bg-muted/40 text-sm">
                          <span className="font-semibold text-[#1B4332] w-28 shrink-0 text-xs">{entry.startTime}–{entry.endTime}</span>
                          <span className="flex-1 truncate">{entry.subject?.code} — {entry.section?.name}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{entry.room?.code}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Management Hub — SUPER_ADMIN (Department Chair) */}
        {userRole === "SUPER_ADMIN" && (
        <Card className="border-2 border-[#1B4332]/20 shadow-sm">
          <CardHeader className="pb-3 bg-gradient-to-r from-[#1B4332]/5 to-transparent rounded-t-lg border-b">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#1B4332]">
              <div className="flex h-7 w-7 items-center justify-center text-[#1B4332]">
                <Building2 className="h-5 w-5" />
              </div>
              Management Hub
              <span className="ml-auto text-[10px] font-normal text-muted-foreground uppercase tracking-wider">Department Chair</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <QuickActionButton
                href="/dashboard/schedules"
                icon={CalendarDays}
                label="Manage Schedules"
                description="View & publish schedules"
              />
              <QuickActionButton
                href="/dashboard/availability"
                icon={Clock}
                label="Faculty Availability"
                description="Assign time slots"
              />
              <QuickActionButton
                href="/dashboard/faculty"
                icon={Users}
                label="Faculty"
                description="View & manage faculty"
              />
              <QuickActionButton
                href="/dashboard/rooms"
                icon={Building2}
                label="Buildings"
                description="Manage rooms & labs"
              />
              <QuickActionButton
                href="/dashboard/subjects"
                icon={BookOpen}
                label="Departments"
                description="Manage departments & subjects"
              />
              <QuickActionButton
                href="/dashboard/sections"
                icon={Users}
                label="Sections"
                description="Manage sections"
              />
            </div>
          </CardContent>
        </Card>
        )}

        {/* Management Hub — ADMIN (Program Chair) */}
        {userRole === "ADMIN" && (
        <Card className="border-2 border-[#1B4332]/20 shadow-sm">
          <CardHeader className="pb-3 bg-gradient-to-r from-[#1B4332]/5 to-transparent rounded-t-lg border-b">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#1B4332]">
              <div className="flex h-7 w-7 items-center justify-center text-[#1B4332]">
                <BookOpen className="h-5 w-5" />
              </div>
              Management Hub
              <span className="ml-auto text-[10px] font-normal text-muted-foreground uppercase tracking-wider">Program Chair</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <QuickActionButton
                href="/dashboard/schedules"
                icon={CalendarDays}
                label="Manage Schedules"
                description="Add major subjects to published schedules"
              />
              <QuickActionButton
                href="/dashboard/subjects"
                icon={BookOpen}
                label="Courses"
                description="View course offerings"
              />
              <QuickActionButton
                href="/dashboard/faculty"
                icon={Users}
                label="Faculty"
                description="View faculty list"
              />
              <QuickActionButton
                href="/dashboard/sections"
                icon={Users}
                label="Sections"
                description="View program sections"
              />
            </div>
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    PENDING_APPROVAL: "bg-yellow-100 text-yellow-800",
    PUBLISHED: "bg-green-100 text-green-800",
    ARCHIVED: "bg-secondary text-secondary-foreground",
  }
  const label: Record<string, string> = {
    DRAFT: "Draft",
    PENDING_APPROVAL: "Pending",
    PUBLISHED: "Published",
    ARCHIVED: "Archived",
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? map.DRAFT}`}>
      {label[status] ?? status}
    </span>
  )
}

function QuickActionButton({
  href,
  icon: Icon,
  label,
  description,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-secondary"
    >
      <div className="p-2 text-primary transition-colors group-hover:text-primary/70">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  )
}
