/**
 * seed-cit.ts
 * -----------
 * Seeds the College of Information Technology (CIT) with:
 *   - Specialized laboratory rooms (Cisco, Multimedia, Software Dev, General Computing)
 *   - Department-to-Building mappings
 *   - BS Information Technology subjects with requiredLabSpecialization
 *   - A Department Chairperson (SUPER_ADMIN) account
 *   - A Program Chairperson (ADMIN) account for BSInfoTech
 *   - Faculty members with building availability records
 *   - Initial DepartmentWorkflowState (DRAFT) for the active semester
 *
 * Run:  npx tsx prisma/seed-cit.ts
 *
 * NOTE ON AUTH:
 *   This seed creates User rows with placeholder supabaseIds so the system has
 *   data to work with immediately. In production the supabaseId is set by
 *   ensureDbUser() on first sign-in. To promote a real Supabase-authenticated
 *   account to SUPER_ADMIN or ADMIN, run:
 *     npx tsx prisma/promote-admin.ts
 */

import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

// ─── Placeholder Supabase IDs for local dev/testing only ──────────────────────
// These are deterministic UUIDs that will never collide with real Supabase UUIDs.
const PLACEHOLDER_DEPT_CHAIR_SUPABASE_ID = "00000000-cit0-dept-0000-chair0000001"
const PLACEHOLDER_PROG_CHAIR_SUPABASE_ID = "00000000-cit0-prog-0000-chair0000002"
const PLACEHOLDER_FACULTY_1_SUPABASE_ID  = "00000000-cit0-fac1-0000-faculty00001"
const PLACEHOLDER_FACULTY_2_SUPABASE_ID  = "00000000-cit0-fac2-0000-faculty00002"
const PLACEHOLDER_FACULTY_3_SUPABASE_ID  = "00000000-cit0-fac3-0000-faculty00003"

async function main() {
  console.log("=== CIT Seed — iSched ===\n")

  // ─── 1. Resolve CIT College ────────────────────────────────────────────────
  const citCollege = await db.college.upsert({
    where: { abbreviation: "CIT" },
    update: {},
    create: {
      name: "College of Information Technology",
      abbreviation: "CIT",
    },
  })
  console.log(`[1] College: ${citCollege.name}`)

  // ─── 2. Resolve CIT Department ────────────────────────────────────────────
  const citDept = await db.department.upsert({
    where: { abbreviation_collegeId: { abbreviation: "CIT", collegeId: citCollege.id } },
    update: {},
    create: {
      name: "College of Information Technology",
      abbreviation: "CIT",
      collegeId: citCollege.id,
    },
  })
  console.log(`[2] Department: ${citDept.name} (id: ${citDept.id})`)

  // ─── 3. Resolve BSInfoTech Program ────────────────────────────────────────
  const bsInfoTechProgram = await db.program.upsert({
    where: { abbreviation_departmentId: { abbreviation: "BSInfoTech", departmentId: citDept.id } },
    update: {},
    create: {
      name: "BS Information Technology",
      abbreviation: "BSInfoTech",
      departmentId: citDept.id,
    },
  })
  console.log(`[3] Program: ${bsInfoTechProgram.name}`)

  // ─── 4. Year Levels + Sections ────────────────────────────────────────────
  const yearLevelRecords: Record<number, any> = {}
  for (let level = 1; level <= 4; level++) {
    const yl = await db.yearLevel.upsert({
      where: { level_programId: { level, programId: bsInfoTechProgram.id } },
      update: {},
      create: { level, programId: bsInfoTechProgram.id },
    })
    yearLevelRecords[level] = yl

    // Create sections A and B for each year level
    for (const section of ["A", "B"]) {
      const sectionName = `BSInfoTech ${level}-${section}`
      const existing = await db.section.findFirst({
        where: { name: sectionName, yearLevelId: yl.id },
      })
      if (!existing) {
        await db.section.create({
          data: { name: sectionName, yearLevelId: yl.id, capacity: 40 },
        })
      }
    }
  }
  console.log(`[4] Year levels 1–4 with sections A & B created`)

  // ─── 5. Buildings ─────────────────────────────────────────────────────────
  const citBuilding = await db.building.upsert({
    where: { code: "CIT-BLDG" },
    update: {},
    create: { name: "CIT Building", code: "CIT-BLDG" },
  })

  // CIT also uses the HP Building for lecture overflow
  const hpBuilding = await db.building.upsert({
    where: { code: "HP" },
    update: {},
    create: { name: "HP Building", code: "HP" },
  })

  console.log(`[5] Buildings: CIT-BLDG, HP`)

  // ─── 6. Department–Building Mappings ──────────────────────────────────────
  // CIT has access to CIT-BLDG (primary) and HP (shared lecture overflow).
  // Scheduling UI will filter available buildings from this mapping.
  for (const buildingId of [citBuilding.id, hpBuilding.id]) {
    await db.departmentBuilding.upsert({
      where: { departmentId_buildingId: { departmentId: citDept.id, buildingId } },
      update: {},
      create: { departmentId: citDept.id, buildingId },
    })
  }
  console.log(`[6] DepartmentBuilding mappings: CIT → [CIT-BLDG, HP]`)

  // ─── 7. Specialized Labs + Lecture Rooms ──────────────────────────────────
  // labSpecialization enforces Hard Constraint in the backtracking engine.
  const roomsData = [
    // ── CIT-BLDG Lecture rooms ──
    {
      name: "CIT Lecture Hall 101",
      code: "CIT-LH101",
      buildingId: citBuilding.id,
      type: "LECTURE_ROOM" as const,
      labSpecialization: null,
      equipment: ["Projector", "Whiteboard", "AC"],
    },
    {
      name: "CIT Lecture Hall 102",
      code: "CIT-LH102",
      buildingId: citBuilding.id,
      type: "LECTURE_ROOM" as const,
      labSpecialization: null,
      equipment: ["Projector", "Whiteboard", "AC"],
    },

    // ── Cisco Networking Lab ──
    // Subjects tagged CISCO_NETWORKING can ONLY be assigned here.
    {
      name: "CIT Cisco Networking Lab",
      code: "CIT-CISCO1",
      buildingId: citBuilding.id,
      type: "COMPUTER_LAB" as const,
      labSpecialization: "CISCO_NETWORKING" as const,
      equipment: ["Cisco Routers", "Switches", "Patch Panels", "Network Racks", "PCs", "AC"],
    },
    {
      name: "CIT Cisco Lab 2",
      code: "CIT-CISCO2",
      buildingId: citBuilding.id,
      type: "COMPUTER_LAB" as const,
      labSpecialization: "CISCO_NETWORKING" as const,
      equipment: ["Cisco Routers", "Switches", "Firewalls", "PCs", "AC"],
    },

    // ── Multimedia / Design Lab ──
    {
      name: "CIT Multimedia Lab",
      code: "CIT-MMLAB1",
      buildingId: citBuilding.id,
      type: "COMPUTER_LAB" as const,
      labSpecialization: "MULTIMEDIA_DESIGN" as const,
      equipment: ["iMac Workstations", "Wacom Tablets", "Adobe CC", "Projector", "AC"],
    },

    // ── Software Development Lab ──
    {
      name: "CIT Software Development Lab",
      code: "CIT-SWLAB1",
      buildingId: citBuilding.id,
      type: "COMPUTER_LAB" as const,
      labSpecialization: "SOFTWARE_DEVELOPMENT" as const,
      equipment: ["Developer Workstations", "Dual Monitors", "Git Servers", "AC"],
    },
    {
      name: "CIT Software Dev Lab 2",
      code: "CIT-SWLAB2",
      buildingId: citBuilding.id,
      type: "COMPUTER_LAB" as const,
      labSpecialization: "SOFTWARE_DEVELOPMENT" as const,
      equipment: ["Developer Workstations", "Dual Monitors", "AC"],
    },

    // ── General Computing Lab (no specialization restriction) ──
    {
      name: "CIT General Computing Lab",
      code: "CIT-GCLAB1",
      buildingId: citBuilding.id,
      type: "COMPUTER_LAB" as const,
      labSpecialization: "GENERAL_COMPUTING" as const,
      equipment: ["PCs", "Projector", "AC"],
    },

    // ── Network Security Lab ──
    {
      name: "CIT Network Security Lab",
      code: "CIT-SECLAB1",
      buildingId: citBuilding.id,
      type: "COMPUTER_LAB" as const,
      labSpecialization: "NETWORK_SECURITY" as const,
      equipment: ["Security Workstations", "Firewalls", "IDS/IPS Equipment", "AC"],
    },

    // ── Database Administration Lab ──
    {
      name: "CIT Database Lab",
      code: "CIT-DBLAB1",
      buildingId: citBuilding.id,
      type: "COMPUTER_LAB" as const,
      labSpecialization: "DATABASE_ADMINISTRATION" as const,
      equipment: ["DB Server Workstations", "Oracle License", "MySQL/PostgreSQL Cluster", "AC"],
    },

    // ── Web Development Lab ──
    {
      name: "CIT Web Development Lab",
      code: "CIT-WEBLAB1",
      buildingId: citBuilding.id,
      type: "COMPUTER_LAB" as const,
      labSpecialization: "WEB_DEVELOPMENT" as const,
      equipment: ["Developer Workstations", "High-Speed Internet", "AC"],
    },

    // ── HP Building shared lecture rooms ──
    {
      name: "HP Room 201",
      code: "HP-201",
      buildingId: hpBuilding.id,
      type: "LECTURE_ROOM" as const,
      labSpecialization: null,
      equipment: ["Projector", "Whiteboard", "AC"],
    },
    {
      name: "HP Room 202",
      code: "HP-202",
      buildingId: hpBuilding.id,
      type: "LECTURE_ROOM" as const,
      labSpecialization: null,
      equipment: ["Projector", "Whiteboard"],
    },
  ]

  const roomRecords: Record<string, any> = {}
  for (const r of roomsData) {
    roomRecords[r.code] = await db.room.upsert({
      where: { code: r.code },
      update: { labSpecialization: r.labSpecialization },
      create: r,
    })
  }
  console.log(`[7] Rooms/Labs created: ${roomsData.length} rooms (${roomsData.filter(r => r.labSpecialization).length} specialized labs)`)

  // ─── 8. Academic Year + Semester ──────────────────────────────────────────
  const ay = await db.academicYear.upsert({
    where: { label: "2025-2026" },
    update: {},
    create: { label: "2025-2026", startYear: 2025, endYear: 2026, isCurrent: true },
  })

  const activeSemester = await db.semester.upsert({
    where: { type_academicYearId: { type: "FIRST", academicYearId: ay.id } },
    update: {},
    create: {
      type: "FIRST",
      academicYearId: ay.id,
      startDate: new Date("2025-08-01"),
      endDate: new Date("2025-12-15"),
      isActive: true,
    },
  })
  console.log(`[8] Semester: ${activeSemester.type} ${ay.label} (active)`)

  // ─── 9. User Accounts ─────────────────────────────────────────────────────
  // Department Chairperson — SUPER_ADMIN — final approval + algorithm execution
  const deptChairUser = await db.user.upsert({
    where: { email: "cit.chair@isched.edu.ph" },
    update: { role: "SUPER_ADMIN", isApproved: true, departmentId: citDept.id },
    create: {
      supabaseId: PLACEHOLDER_DEPT_CHAIR_SUPABASE_ID,
      email: "cit.chair@isched.edu.ph",
      firstName: "Maria",
      lastName: "Reyes",
      role: "SUPER_ADMIN",
      isApproved: true,
      isActive: true,
      departmentId: citDept.id,
    },
  })

  // Link as DepartmentChair record
  await db.departmentChair.upsert({
    where: { userId: deptChairUser.id },
    update: {},
    create: { userId: deptChairUser.id, departmentId: citDept.id },
  })

  // Program Chairperson — ADMIN — data submission for BSInfoTech
  const progChairUser = await db.user.upsert({
    where: { email: "bsit.chair@isched.edu.ph" },
    update: { role: "ADMIN", isApproved: true, departmentId: citDept.id },
    create: {
      supabaseId: PLACEHOLDER_PROG_CHAIR_SUPABASE_ID,
      email: "bsit.chair@isched.edu.ph",
      firstName: "Juan",
      lastName: "Santos",
      role: "ADMIN",
      isApproved: true,
      isActive: true,
      departmentId: citDept.id,
    },
  })

  // Link as ProgramHead record
  await db.programHead.upsert({
    where: { userId: progChairUser.id },
    update: {},
    create: { userId: progChairUser.id, programId: bsInfoTechProgram.id },
  })

  console.log(`[9] Users:`)
  console.log(`    Dept Chair  : ${deptChairUser.email} (SUPER_ADMIN)`)
  console.log(`    Prog Chair  : ${progChairUser.email} (ADMIN)`)

  // ─── 10. Faculty ──────────────────────────────────────────────────────────
  const facultyData = [
    {
      supabaseId: PLACEHOLDER_FACULTY_1_SUPABASE_ID,
      email: "faculty.cisco@isched.edu.ph",
      firstName: "Ricardo",
      lastName: "Dela Cruz",
      employeeId: "CIT-F001",
      specializations: ["Cisco Networking", "Network Security", "CCNA", "Computer Networks"],
      maxUnitsPerWeek: 21,
    },
    {
      supabaseId: PLACEHOLDER_FACULTY_2_SUPABASE_ID,
      email: "faculty.multimedia@isched.edu.ph",
      firstName: "Anna",
      lastName: "Garcia",
      employeeId: "CIT-F002",
      specializations: ["Multimedia Design", "Web Development", "UI/UX Design", "Digital Arts"],
      maxUnitsPerWeek: 21,
    },
    {
      supabaseId: PLACEHOLDER_FACULTY_3_SUPABASE_ID,
      email: "faculty.software@isched.edu.ph",
      firstName: "Carlos",
      lastName: "Lim",
      employeeId: "CIT-F003",
      specializations: ["Software Development", "Database Administration", "Web Development", "Object-Oriented Programming", "Data Structures"],
      maxUnitsPerWeek: 21,
    },
  ]

  const facultyRecords: any[] = []
  for (const f of facultyData) {
    const userRecord = await db.user.upsert({
      where: { email: f.email },
      update: { isApproved: true, departmentId: citDept.id },
      create: {
        supabaseId: f.supabaseId,
        email: f.email,
        firstName: f.firstName,
        lastName: f.lastName,
        role: "FACULTY",
        isApproved: true,
        isActive: true,
        departmentId: citDept.id,
      },
    })

    const facultyRecord = await db.faculty.upsert({
      where: { employeeId: f.employeeId },
      update: { specializations: f.specializations, maxUnitsPerWeek: f.maxUnitsPerWeek },
      create: {
        userId: userRecord.id,
        departmentId: citDept.id,
        employeeId: f.employeeId,
        specializations: f.specializations,
        maxUnitsPerWeek: f.maxUnitsPerWeek,
      },
    })

    facultyRecords.push({ ...facultyRecord, user: userRecord })
    console.log(`    Faculty     : ${f.firstName} ${f.lastName} — ${f.specializations[0]}`)
  }
  console.log(`[10] ${facultyRecords.length} faculty created`)

  // ─── 11. Faculty Availability (timeslots) ─────────────────────────────────
  const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const
  for (const fac of facultyRecords) {
    for (const day of weekdays) {
      await db.facultyAvailability.upsert({
        where: {
          facultyId_day_startTime_semesterId: {
            facultyId: fac.id,
            day,
            startTime: "07:00",
            semesterId: activeSemester.id,
          },
        },
        update: {},
        create: {
          facultyId: fac.id,
          day,
          startTime: "07:00",
          endTime: "21:00",
          semesterId: activeSemester.id,
        },
      })
    }
  }
  console.log(`[11] Faculty timeslot availability set (Mon–Fri, 07:00–21:00)`)

  // ─── 12. Faculty Building Availability ────────────────────────────────────
  // Hard Constraint: faculty can only be scheduled in buildings listed here.
  // All CIT faculty are available in CIT-BLDG.
  // Faculty 1 (Cisco) and 3 (Software) also cover HP for overflow lectures.
  const buildingAvailability = [
    { facultyId: facultyRecords[0].id, buildingId: citBuilding.id }, // Cisco fac — CIT only
    { facultyId: facultyRecords[0].id, buildingId: hpBuilding.id },  // Cisco fac — HP overflow
    { facultyId: facultyRecords[1].id, buildingId: citBuilding.id }, // Multimedia fac — CIT only
    { facultyId: facultyRecords[2].id, buildingId: citBuilding.id }, // Software fac — CIT only
    { facultyId: facultyRecords[2].id, buildingId: hpBuilding.id },  // Software fac — HP overflow
  ]

  for (const ba of buildingAvailability) {
    await db.facultyBuildingAvailability.upsert({
      where: {
        facultyId_buildingId_semesterId: {
          facultyId: ba.facultyId,
          buildingId: ba.buildingId,
          semesterId: activeSemester.id,
        },
      },
      update: {},
      create: {
        facultyId: ba.facultyId,
        buildingId: ba.buildingId,
        semesterId: activeSemester.id,
      },
    })
  }
  console.log(`[12] Faculty building availability set`)

  // ─── 13. BS Information Technology Subjects ───────────────────────────────
  // requiredLabSpecialization drives Hard Constraint 2 in the scheduler.
  // A subject with CISCO_NETWORKING can ONLY be placed in a CISCO_NETWORKING room.
  const bsitSubjects = [
    // ── YEAR 1 — 1st Semester ──
    { code: "BSIT-CC101", title: "Introduction to Computing", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 1, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },
    { code: "BSIT-CC101L", title: "Introduction to Computing Laboratory", units: 1, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 1, requiredRoomType: ["COMPUTER_LAB" as const], requiredLabSpecialization: "GENERAL_COMPUTING" as const },
    { code: "BSIT-CC102", title: "Computer Programming 1", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 1, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },
    { code: "BSIT-CC102L", title: "Computer Programming 1 Laboratory", units: 1, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 1, requiredRoomType: ["COMPUTER_LAB" as const], requiredLabSpecialization: "SOFTWARE_DEVELOPMENT" as const },
    { code: "BSIT-GEC01", title: "Purposive Communication", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 1, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },
    { code: "BSIT-MATH01", title: "Mathematics in the Modern World", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 1, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },

    // ── YEAR 2 — 1st Semester ──
    { code: "BSIT-CC201", title: "Data Structures and Algorithms", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 2, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },
    { code: "BSIT-CC201L", title: "Data Structures Laboratory", units: 1, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 2, requiredRoomType: ["COMPUTER_LAB" as const], requiredLabSpecialization: "SOFTWARE_DEVELOPMENT" as const },
    { code: "BSIT-CC202", title: "Object-Oriented Programming", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 2, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },
    { code: "BSIT-CC202L", title: "Object-Oriented Programming Laboratory", units: 1, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 2, requiredRoomType: ["COMPUTER_LAB" as const], requiredLabSpecialization: "SOFTWARE_DEVELOPMENT" as const },
    { code: "BSIT-NET101", title: "Fundamentals of Networking", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 2, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },
    { code: "BSIT-NET101L", title: "Fundamentals of Networking Laboratory", units: 1, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 2, requiredRoomType: ["COMPUTER_LAB" as const], requiredLabSpecialization: "CISCO_NETWORKING" as const },
    { code: "BSIT-MMD101", title: "Digital Arts and Multimedia", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 2, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },
    { code: "BSIT-MMD101L", title: "Digital Arts and Multimedia Laboratory", units: 1, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 2, requiredRoomType: ["COMPUTER_LAB" as const], requiredLabSpecialization: "MULTIMEDIA_DESIGN" as const },

    // ── YEAR 3 — 1st Semester ──
    { code: "BSIT-CC301", title: "Web Systems and Technologies", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 3, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },
    { code: "BSIT-CC301L", title: "Web Systems Laboratory", units: 1, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 3, requiredRoomType: ["COMPUTER_LAB" as const], requiredLabSpecialization: "WEB_DEVELOPMENT" as const },
    { code: "BSIT-CC302", title: "Database Management Systems", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 3, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },
    { code: "BSIT-CC302L", title: "Database Management Systems Laboratory", units: 1, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 3, requiredRoomType: ["COMPUTER_LAB" as const], requiredLabSpecialization: "DATABASE_ADMINISTRATION" as const },
    { code: "BSIT-NET201", title: "Routing and Switching (CCNA)", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 3, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },
    { code: "BSIT-NET201L", title: "Routing and Switching Laboratory", units: 1, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 3, requiredRoomType: ["COMPUTER_LAB" as const], requiredLabSpecialization: "CISCO_NETWORKING" as const },
    { code: "BSIT-SEC101", title: "Information Assurance and Security", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 3, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },
    { code: "BSIT-SEC101L", title: "Information Assurance Laboratory", units: 1, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 3, requiredRoomType: ["COMPUTER_LAB" as const], requiredLabSpecialization: "NETWORK_SECURITY" as const },

    // ── YEAR 4 — 1st Semester ──
    { code: "BSIT-CC401", title: "Software Engineering", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 4, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },
    { code: "BSIT-CC401L", title: "Software Engineering Laboratory", units: 1, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 4, requiredRoomType: ["COMPUTER_LAB" as const], requiredLabSpecialization: "SOFTWARE_DEVELOPMENT" as const },
    { code: "BSIT-NET301", title: "Advanced Network Technologies", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 4, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },
    { code: "BSIT-NET301L", title: "Advanced Networking Laboratory", units: 1, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 4, requiredRoomType: ["COMPUTER_LAB" as const], requiredLabSpecialization: "CISCO_NETWORKING" as const },
    { code: "BSIT-CAP401", title: "Capstone Project 1", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 4, requiredRoomType: ["LECTURE_ROOM" as const], requiredLabSpecialization: null },
    { code: "BSIT-CAP401L", title: "Capstone Project 1 Laboratory", units: 1, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 4, requiredRoomType: ["COMPUTER_LAB" as const], requiredLabSpecialization: "SOFTWARE_DEVELOPMENT" as const },
  ]

  for (const s of bsitSubjects) {
    await db.subject.upsert({
      where: { code_departmentId: { code: s.code, departmentId: citDept.id } },
      update: { requiredLabSpecialization: s.requiredLabSpecialization },
      create: { ...s, departmentId: citDept.id },
    })
  }
  console.log(`[13] ${bsitSubjects.length} BSIT subjects created (${bsitSubjects.filter(s => s.requiredLabSpecialization).length} with lab specialization)`)

  // ─── 14. Initial Workflow State (DRAFT) ───────────────────────────────────
  // The Program Chair must submit (→ SUBMITTED_TO_CHAIR) before the Dept Chair
  // can run the backtracking algorithm.
  await db.departmentWorkflowState.upsert({
    where: {
      departmentId_semesterId: {
        departmentId: citDept.id,
        semesterId: activeSemester.id,
      },
    },
    update: {},
    create: {
      departmentId: citDept.id,
      semesterId: activeSemester.id,
      status: "DRAFT",
    },
  })
  console.log(`[14] Workflow state initialized: DRAFT (Program Chair must submit before generation)`)

  // ─── 15. Create a Draft Schedule for CIT ──────────────────────────────────
  await db.schedule.upsert({
    where: {
      // schedules don't have a unique constraint — findFirst + update/create
      id: "seed-cit-schedule-2025-first",
    },
    update: {},
    create: {
      id: "seed-cit-schedule-2025-first",
      semesterId: activeSemester.id,
      departmentId: citDept.id,
      status: "DRAFT",
      createdBy: deptChairUser.id,
    },
  })
  console.log(`[15] Draft schedule created for CIT — First Semester 2025-2026`)

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`
=== CIT Seed Complete ===

Test credentials (login via Supabase Auth — sign up with these emails):
  Dept Chair  : cit.chair@isched.edu.ph      role: SUPER_ADMIN
  Prog Chair  : bsit.chair@isched.edu.ph     role: ADMIN
  Faculty 1   : faculty.cisco@isched.edu.ph   specialization: Cisco Networking
  Faculty 2   : faculty.multimedia@isched.edu.ph  specialization: Multimedia Design
  Faculty 3   : faculty.software@isched.edu.ph    specialization: Software Development

Workflow to test end-to-end:
  1. Sign in as bsit.chair@isched.edu.ph (Program Chair)
     → PATCH /api/workflow/${citDept.id}  { action: "submit" }
  2. Sign in as cit.chair@isched.edu.ph (Dept Chair)
     → POST  /api/schedules/seed-cit-schedule-2025-first/generate
  3. Review generated schedule at /dashboard/schedules

Hard Constraints active:
  ✓ CISCO_NETWORKING subjects → CIT-CISCO1, CIT-CISCO2 only
  ✓ MULTIMEDIA_DESIGN subjects → CIT-MMLAB1 only
  ✓ SOFTWARE_DEVELOPMENT subjects → CIT-SWLAB1, CIT-SWLAB2 only
  ✓ Faculty 2 (Multimedia) cannot be scheduled in HP Building
`)
}

main()
  .catch((e) => {
    console.error("CIT seed error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
