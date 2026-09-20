import { db } from "../lib/db"

async function main() {
  const chairs = await db.user.findMany({ where: { role: "SUPER_ADMIN" }, select: { firstName: true, lastName: true, departmentId: true, clusterId: true, isApproved: true } })
  console.log("SUPER_ADMIN chairs:", chairs)

  const casCollegeDepts = await db.department.findMany({ where: { college: { abbreviation: "CAS" } }, select: { id: true, abbreviation: true, name: true } })
  console.log("Departments in CAS college:", casCollegeDepts)

  const semesters = await db.semester.findMany({ include: { academicYear: true }, orderBy: [{ academicYear: { startYear: "desc" } }] })
  console.log("Semesters:", semesters.map((s) => `${s.id.slice(-6)} ${s.type} ${s.academicYear.label} active=${s.isActive}`))

  const schedules = await db.schedule.findMany({ include: { department: { select: { abbreviation: true } }, semester: { include: { academicYear: true } }, _count: { select: { entries: true } } }, orderBy: { createdAt: "desc" } })
  console.log("Schedules:")
  for (const s of schedules) console.log(`  ${s.department?.abbreviation?.padEnd(6)} ${s.semester.type} ${s.semester.academicYear.label} sem=${s.semesterId.slice(-6)} status=${s.status} archived=${s.isArchived} entries=${s._count.entries} generatedAt=${s.generatedAt?.toISOString().slice(0, 10) ?? "-"}`)

  // Faculty per CAS-college department, cluster distribution, and availability per semester
  for (const d of casCollegeDepts) {
    const fac = await db.faculty.findMany({ where: { departmentId: d.id }, select: { id: true, clusterId: true, isActive: true, availability: { select: { semesterId: true } }, user: { select: { lastName: true } } } })
    const byCluster = new Map<string, number>()
    for (const f of fac) byCluster.set(f.clusterId ?? "null", (byCluster.get(f.clusterId ?? "null") ?? 0) + 1)
    console.log(`\nDept ${d.abbreviation}: ${fac.length} faculty; clusterId distribution:`, Object.fromEntries(byCluster))
    const availBySem = new Map<string, number>()
    for (const f of fac) for (const a of f.availability) availBySem.set(a.semesterId.slice(-6), (availBySem.get(a.semesterId.slice(-6)) ?? 0) + 1)
    console.log("  availability rows by semester:", Object.fromEntries(availBySem))
    const facWithAvail = fac.filter((f) => f.availability.length > 0).length
    console.log(`  faculty with any availability: ${facWithAvail}/${fac.length}`)
  }

  const clusters = await db.facultyCluster.findMany({ select: { id: true, name: true } })
  console.log("\nClusters:", clusters.map((c) => `${c.id.slice(-6)}=${c.name}`))

  // Entries in generated schedules by faculty dept + whether those faculty have availability for the schedule's semester
  for (const s of schedules.filter((x) => x._count.entries > 0)) {
    const entries = await db.scheduleEntry.findMany({ where: { scheduleId: s.id }, select: { facultyId: true, faculty: { select: { departmentId: true, clusterId: true, availability: { where: { semesterId: s.semesterId }, select: { id: true } } } } } })
    const distinct = new Map<string, { dept: string; cluster: string; hasAvail: boolean }>()
    for (const e of entries) {
      if (!e.facultyId) continue
      distinct.set(e.facultyId, { dept: e.faculty?.departmentId?.slice(-6) ?? "?", cluster: e.faculty?.clusterId?.slice(-6) ?? "null", hasAvail: (e.faculty?.availability.length ?? 0) > 0 })
    }
    const noAvail = [...distinct.values()].filter((v) => !v.hasAvail).length
    console.log(`\nSchedule ${s.department?.abbreviation} ${s.semester.type} ${s.semester.academicYear.label}: ${entries.length} entries, ${distinct.size} distinct faculty, ${noAvail} of them have NO availability for this semester`)
  }
}
main().catch(console.error).finally(() => db.$disconnect())
