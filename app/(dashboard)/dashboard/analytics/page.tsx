"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { PageHeader } from "@/components/shared/page-header"
import { KPICard } from "@/components/shared/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DoorOpen,
  Users,
  CalendarDays,
  AlertTriangle,
  TrendingUp,
  BookOpen,
  Loader2,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts"

// Total schedulable hours per week per room: 7:30 AM – 9:00 PM × 6 days = 81 h
const TOTAL_WEEKLY_ROOM_HOURS = 81

function toMins(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

function getDurationHours(startTime: string, endTime: string) {
  return (toMins(endTime) - toMins(startTime)) / 60
}

const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]
const DAY_SHORT: Record<string, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
  SATURDAY: "Sat",
}

export default function AnalyticsPage() {
  const [selectedScheduleId, setSelectedScheduleId] = useState("")

  // Fetch all active schedules for the selector
  const { data: schedules = [], isLoading: loadingSchedules } = useQuery<any[]>({
    queryKey: ["schedules", { isArchived: false }],
    queryFn: async () => {
      const res = await fetch("/api/schedules")
      const json = await res.json()
      if (!res.ok) return []
      return json.data ?? []
    },
  })

  // Fetch full schedule detail (with entries) for analytics
  const { data: scheduleDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ["schedule-analytics-detail", selectedScheduleId],
    queryFn: async () => {
      const res = await fetch(`/api/schedules/${selectedScheduleId}`)
      const json = await res.json()
      if (!res.ok) return null
      return json.data ?? null
    },
    enabled: !!selectedScheduleId,
  })

  const entries: any[] = scheduleDetail?.entries ?? []

  // ── Room utilization ───────────────────────────────────────────────────
  const roomUtilization = useMemo(() => {
    const map = new Map<string, { code: string; hours: number }>()
    for (const e of entries) {
      const rid = e.roomId ?? e.room?.id ?? ""
      if (!rid) continue
      const code = e.room?.code ?? rid
      if (!map.has(rid)) map.set(rid, { code, hours: 0 })
      map.get(rid)!.hours += getDurationHours(e.startTime, e.endTime)
    }
    return Array.from(map.values())
      .map(({ code, hours }) => ({
        room: code,
        utilization: Math.min(Math.round((hours / TOTAL_WEEKLY_ROOM_HOURS) * 100), 100),
      }))
      .sort((a, b) => b.utilization - a.utilization)
      .slice(0, 8)
  }, [entries])

  // ── Faculty teaching load (hours / week) ──────────────────────────────
  const facultyLoad = useMemo(() => {
    const map = new Map<string, { name: string; hours: number }>()
    for (const e of entries) {
      const fid = e.facultyId ?? e.faculty?.id ?? ""
      if (!fid) continue
      const first = e.faculty?.user?.firstName ?? ""
      const last = e.faculty?.user?.lastName ?? ""
      const name = `${first} ${last}`.trim() || "Unknown"
      if (!map.has(fid)) map.set(fid, { name, hours: 0 })
      map.get(fid)!.hours += getDurationHours(e.startTime, e.endTime)
    }
    return Array.from(map.values())
      .map(({ name, hours }) => ({
        name,
        current: Math.round(hours * 10) / 10,
        max: 21,
      }))
      .sort((a, b) => b.current - a.current)
      .slice(0, 8)
  }, [entries])

  // ── Subject type distribution ─────────────────────────────────────────
  const subjectDistribution = useMemo(() => {
    let lecture = 0
    let lab = 0
    for (const e of entries) {
      if ((e.subject?.type ?? "") === "LABORATORY") lab++
      else lecture++
    }
    const total = lecture + lab || 1
    return [
      { name: "Lecture", value: Math.round((lecture / total) * 100), color: "#1B4332" },
      { name: "Laboratory", value: Math.round((lab / total) * 100), color: "#52B788" },
    ].filter((d) => d.value > 0)
  }, [entries])

  // ── Weekly class distribution + conflict count ────────────────────────
  const weeklyTrend = useMemo(() => {
    const dayMap = new Map<string, { classes: number; conflicts: number }>()
    for (const d of DAY_ORDER) dayMap.set(d, { classes: 0, conflicts: 0 })

    for (const e of entries) {
      if (dayMap.has(e.day)) dayMap.get(e.day)!.classes++
    }

    for (const day of DAY_ORDER) {
      const dayEntries = entries.filter((e: any) => e.day === day)
      let conflicts = 0
      for (let i = 0; i < dayEntries.length; i++) {
        for (let j = i + 1; j < dayEntries.length; j++) {
          const a = dayEntries[i]
          const b = dayEntries[j]
          const overlaps =
            toMins(a.startTime) < toMins(b.endTime) &&
            toMins(b.startTime) < toMins(a.endTime)
          if (overlaps) {
            const sameRoom =
              (a.roomId ?? a.room?.id) &&
              (a.roomId ?? a.room?.id) === (b.roomId ?? b.room?.id)
            const sameFaculty =
              (a.facultyId ?? a.faculty?.id) &&
              (a.facultyId ?? a.faculty?.id) === (b.facultyId ?? b.faculty?.id)
            if (sameRoom || sameFaculty) conflicts++
          }
        }
      }
      dayMap.get(day)!.conflicts = conflicts
    }

    return DAY_ORDER.map((d) => ({ day: DAY_SHORT[d], ...dayMap.get(d)! }))
  }, [entries])

  // ── KPI summary values ────────────────────────────────────────────────
  const avgRoomUtil =
    roomUtilization.length > 0
      ? Math.round(
          roomUtilization.reduce((s, r) => s + r.utilization, 0) /
            roomUtilization.length
        )
      : 0

  const avgFacultyLoad =
    facultyLoad.length > 0
      ? Math.round(
          (facultyLoad.reduce((s, f) => s + f.current, 0) / facultyLoad.length) * 10
        ) / 10
      : 0

  const totalConflicts = weeklyTrend.reduce((s, d) => s + d.conflicts, 0)

  function scheduleLabel(s: any) {
    const sem =
      s.semester?.type === "FIRST"
        ? "1st Semester"
        : s.semester?.type === "SECOND"
        ? "2nd Semester"
        : "Summer"
    const ay = s.semester?.academicYear?.label ?? ""
    const dept = s.department?.abbreviation ?? s.department?.name ?? ""
    return `${sem} ${ay}${dept ? ` — ${dept}` : ""}`
  }

  return (
    <div className="space-y-6">
      <PageHeader
        action={
          <Select value={selectedScheduleId} onValueChange={(v) => setSelectedScheduleId(v ?? "")}>
            <SelectTrigger className="w-64">
              <SelectValue
                placeholder={loadingSchedules ? "Loading…" : "Select a schedule…"}
              />
            </SelectTrigger>
            <SelectContent>
              {schedules.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {scheduleLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {!selectedScheduleId ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
          Select a schedule to view analytics
        </div>
      ) : loadingDetail ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading analytics…
        </div>
      ) : entries.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
          No entries found for this schedule
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Avg Room Utilization"
              value={`${avgRoomUtil}%`}
              icon={DoorOpen}
              variant="default"
            />
            <KPICard
              title="Avg Faculty Load"
              value={`${avgFacultyLoad}h / wk`}
              icon={Users}
              variant="accent"
            />
            <KPICard
              title="Total Entries"
              value={String(entries.length)}
              icon={CalendarDays}
              variant="default"
            />
            <KPICard
              title="Conflicts Detected"
              value={String(totalConflicts)}
              icon={AlertTriangle}
              variant={totalConflicts > 0 ? "error" : "default"}
            />
          </div>

          {/* Charts Row 1 */}
          <div className="grid gap-6 lg:grid-cols-2">
            {roomUtilization.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DoorOpen className="h-4 w-4 text-muted-foreground" />
                    Room Utilization
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={roomUtilization}
                      margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#E2E8F0"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="room"
                        tick={{ fontSize: 11, fill: "#64748B" }}
                      />
                      <YAxis
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 11, fill: "#64748B" }}
                        domain={[0, 100]}
                      />
                      <Tooltip
                        formatter={(value) => [`${value}%`, "Utilization"]}
                        contentStyle={{
                          background: "#fff",
                          border: "1px solid #E2E8F0",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="utilization" radius={[4, 4, 0, 0]}>
                        {roomUtilization.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={
                              entry.utilization >= 80
                                ? "#1B4332"
                                : entry.utilization >= 50
                                ? "#52B788"
                                : "#CBD5E1"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {facultyLoad.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Faculty Teaching Load (hrs / wk)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={facultyLoad}
                      layout="vertical"
                      margin={{ top: 4, right: 16, bottom: 4, left: 80 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#E2E8F0"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        domain={[0, 24]}
                        tick={{ fontSize: 11, fill: "#64748B" }}
                        tickFormatter={(v) => `${v}h`}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        width={75}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#fff",
                          border: "1px solid #E2E8F0",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        formatter={(v) => [`${v}h`, "Load"]}
                      />
                      <Bar
                        dataKey="current"
                        name="Hours"
                        fill="#1B4332"
                        radius={[0, 4, 4, 0]}
                        barSize={14}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Charts Row 2 */}
          <div className="grid gap-6 lg:grid-cols-3">
            {subjectDistribution.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    Subject Types
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={subjectDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value }) => `${name} ${value}%`}
                        labelLine={false}
                      >
                        {subjectDistribution.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => [`${v}%`, ""]}
                        contentStyle={{
                          background: "#fff",
                          border: "1px solid #E2E8F0",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Weekly Class Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={weeklyTrend}
                    margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#64748B" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#64748B" }} />
                    <Tooltip
                      contentStyle={{
                        background: "#fff",
                        border: "1px solid #E2E8F0",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="classes"
                      name="Classes"
                      stroke="#1B4332"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "#1B4332" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="conflicts"
                      name="Conflicts"
                      stroke="#DC2626"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "#DC2626" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
