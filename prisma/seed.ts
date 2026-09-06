import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  console.log("Seeding iSched database...")

  // ─── Colleges ─────────────────────────────────────────────────────────────

  const colleges = [
    { name: "College of Industrial Technology", abbreviation: "CIT" },
    { name: "College of Arts and Sciences", abbreviation: "CAS" },
    { name: "College of Teacher Education", abbreviation: "CTE" },
    { name: "College of Engineering", abbreviation: "CEN" },
    { name: "College of Allied Medicine", abbreviation: "CAM" },
    { name: "College of Accountancy, Business, Hospitality and Agribusiness", abbreviation: "CABHA" },
    { name: "College of Agriculture", abbreviation: "CAG" },
    { name: "Graduate School", abbreviation: "GS" },
  ]

  const collegeRecords: Record<string, any> = {}
  for (const c of colleges) {
    collegeRecords[c.abbreviation] = await db.college.upsert({
      where: { abbreviation: c.abbreviation },
      update: {},
      create: c,
    })
  }
  console.log("  Colleges created:", Object.keys(collegeRecords).join(", "))

  // ─── Departments (one per college for simplicity) ─────────────────────────

  const departments = [
    { name: "Industrial Technology", abbreviation: "CIT", collegeId: collegeRecords.CIT.id },
    { name: "Arts and Sciences", abbreviation: "CAS", collegeId: collegeRecords.CAS.id },
    { name: "Teacher Education", abbreviation: "CTE", collegeId: collegeRecords.CTE.id },
    { name: "Engineering", abbreviation: "CEN", collegeId: collegeRecords.CEN.id },
    { name: "Allied Medicine", abbreviation: "CAM", collegeId: collegeRecords.CAM.id },
    { name: "Business and Hospitality", abbreviation: "CABHA", collegeId: collegeRecords.CABHA.id },
    { name: "Agriculture", abbreviation: "CAG", collegeId: collegeRecords.CAG.id },
    { name: "Graduate Studies", abbreviation: "GS", collegeId: collegeRecords.GS.id },
  ]

  const deptRecords: Record<string, any> = {}
  for (const d of departments) {
    deptRecords[d.abbreviation] = await db.department.upsert({
      where: { abbreviation_collegeId: { abbreviation: d.abbreviation, collegeId: d.collegeId } },
      update: {},
      create: d,
    })
  }
  console.log("  Departments created:", Object.keys(deptRecords).join(", "))

  // ─── Programs ─────────────────────────────────────────────────────────────

  const programs = [
    // CIT
    { name: "BS Industrial Technology – Automotive", abbreviation: "BSIT-Auto", departmentId: deptRecords.CIT.id },
    { name: "BS Industrial Technology – Computer", abbreviation: "BSIT-Comp", departmentId: deptRecords.CIT.id },
    { name: "BS Industrial Technology – Electrical", abbreviation: "BSIT-Elec", departmentId: deptRecords.CIT.id },
    { name: "BS Industrial Technology – Electronics", abbreviation: "BSIT-Eltx", departmentId: deptRecords.CIT.id },
    { name: "BS Industrial Technology – Food", abbreviation: "BSIT-Food", departmentId: deptRecords.CIT.id },
    { name: "BS Industrial Technology – Garments", abbreviation: "BSIT-Garm", departmentId: deptRecords.CIT.id },
    { name: "BS Industrial Technology – Industrial Design", abbreviation: "BSIT-ID", departmentId: deptRecords.CIT.id },
    { name: "BS Industrial Technology – Mechanical", abbreviation: "BSIT-Mech", departmentId: deptRecords.CIT.id },
    { name: "BS Information Technology", abbreviation: "BSInfoTech", departmentId: deptRecords.CIT.id },

    // CAS
    { name: "BA Communication", abbreviation: "BAComm", departmentId: deptRecords.CAS.id },
    { name: "BA History", abbreviation: "BAHist", departmentId: deptRecords.CAS.id },
    { name: "BA Psychology", abbreviation: "BAPsych", departmentId: deptRecords.CAS.id },
    { name: "BS Biology", abbreviation: "BSBio", departmentId: deptRecords.CAS.id },
    { name: "BS Mathematics", abbreviation: "BSMath", departmentId: deptRecords.CAS.id },

    // CTE
    { name: "Bachelor of Elementary Education", abbreviation: "BEEd", departmentId: deptRecords.CTE.id },
    { name: "Bachelor of Culture and Arts Education", abbreviation: "BCAEd", departmentId: deptRecords.CTE.id },
    { name: "Bachelor of Secondary Education – English", abbreviation: "BSEd-Eng", departmentId: deptRecords.CTE.id },
    { name: "Bachelor of Secondary Education – Filipino", abbreviation: "BSEd-Fil", departmentId: deptRecords.CTE.id },
    { name: "Bachelor of Secondary Education – Mathematics", abbreviation: "BSEd-Math", departmentId: deptRecords.CTE.id },
    { name: "Bachelor of Secondary Education – Sciences", abbreviation: "BSEd-Sci", departmentId: deptRecords.CTE.id },
    { name: "Bachelor of Secondary Education – Social Studies", abbreviation: "BSEd-SS", departmentId: deptRecords.CTE.id },
    { name: "Bachelor of Technical Livelihood Education – Home Economics", abbreviation: "BTLEd-HE", departmentId: deptRecords.CTE.id },
    { name: "Bachelor of Technical Livelihood Education – ICT", abbreviation: "BTLEd-ICT", departmentId: deptRecords.CTE.id },
    { name: "Bachelor of Technical Livelihood Education – Industrial Arts", abbreviation: "BTLEd-IA", departmentId: deptRecords.CTE.id },
    { name: "Bachelor of Science in Exercise and Sports Science", abbreviation: "BSESS", departmentId: deptRecords.CTE.id },

    // CEN
    { name: "BS Civil Engineering", abbreviation: "BSCE", departmentId: deptRecords.CEN.id },
    { name: "BS Computer Engineering", abbreviation: "BSCpE", departmentId: deptRecords.CEN.id },
    { name: "BS Electrical Engineering", abbreviation: "BSEE", departmentId: deptRecords.CEN.id },
    { name: "BS Electronics Engineering", abbreviation: "BSECE", departmentId: deptRecords.CEN.id },
    { name: "BS Industrial Engineering", abbreviation: "BSIE", departmentId: deptRecords.CEN.id },
    { name: "BS Mechanical Engineering", abbreviation: "BSME", departmentId: deptRecords.CEN.id },

    // CAM
    { name: "BS Nursing", abbreviation: "BSN", departmentId: deptRecords.CAM.id },
    { name: "BS Radiologic Technology", abbreviation: "BSRT", departmentId: deptRecords.CAM.id },
    { name: "BS Midwifery", abbreviation: "BSMid", departmentId: deptRecords.CAM.id },

    // CABHA
    { name: "BS Accountancy", abbreviation: "BSA", departmentId: deptRecords.CABHA.id },
    { name: "BS Business Administration – Financial Management", abbreviation: "BSBA-FM", departmentId: deptRecords.CABHA.id },
    { name: "BS Business Administration – Marketing Management", abbreviation: "BSBA-MM", departmentId: deptRecords.CABHA.id },
    { name: "BS Business Administration – Human Resource Management", abbreviation: "BSBA-HRM", departmentId: deptRecords.CABHA.id },
    { name: "Bachelor of Public Administration", abbreviation: "BPA", departmentId: deptRecords.CABHA.id },
    { name: "BS Hospitality Management", abbreviation: "BSHM", departmentId: deptRecords.CABHA.id },

    // CAG
    { name: "BS Agriculture – Animal Science", abbreviation: "BSAgri-AS", departmentId: deptRecords.CAG.id },
    { name: "BS Agriculture – Crop Science", abbreviation: "BSAgri-CS", departmentId: deptRecords.CAG.id },
    { name: "BS Agriculture – Organic Agriculture", abbreviation: "BSAgri-OA", departmentId: deptRecords.CAG.id },
    { name: "BS Environmental Science", abbreviation: "BSEnvSci", departmentId: deptRecords.CAG.id },
    { name: "BS Forestry", abbreviation: "BSFor", departmentId: deptRecords.CAG.id },

    // Graduate School
    { name: "Doctor of Business Administration", abbreviation: "DBA", departmentId: deptRecords.GS.id },
    { name: "Doctor of Philosophy in Development Education", abbreviation: "PhDDevEd", departmentId: deptRecords.GS.id },
    { name: "Doctor of Philosophy in Educational Management", abbreviation: "PhDEdMgt", departmentId: deptRecords.GS.id },
    { name: "Doctor of Philosophy in Science Education", abbreviation: "PhDSciEd", departmentId: deptRecords.GS.id },
    { name: "Master of Business Administration", abbreviation: "MBA", departmentId: deptRecords.GS.id },
    { name: "Master of Science in Environmental Science", abbreviation: "MSES", departmentId: deptRecords.GS.id },
    { name: "Master in Forestry", abbreviation: "MF", departmentId: deptRecords.GS.id },
    { name: "Master of Arts in Nursing – Medical Surgical Nursing", abbreviation: "MAN-MSN", departmentId: deptRecords.GS.id },
    { name: "Master of Arts in Nursing – Psychiatric Nursing", abbreviation: "MAN-PN", departmentId: deptRecords.GS.id },
    { name: "Master of Arts in Applied Linguistics", abbreviation: "MAAL", departmentId: deptRecords.GS.id },
    { name: "Master of Arts in Psychology – Clinical Psychology", abbreviation: "MAPsych", departmentId: deptRecords.GS.id },
    { name: "Master of Arts in Educational Management", abbreviation: "MAEdMgt", departmentId: deptRecords.GS.id },
    { name: "Master of Arts in Education – Elementary Education", abbreviation: "MAEd-ElemEd", departmentId: deptRecords.GS.id },
    { name: "Master of Arts in Mathematics Education", abbreviation: "MAMathEd", departmentId: deptRecords.GS.id },
    { name: "Master of Arts in Science Education", abbreviation: "MASciEd", departmentId: deptRecords.GS.id },
    { name: "Master of Arts in Teaching English", abbreviation: "MATE", departmentId: deptRecords.GS.id },
  ]

  for (const p of programs) {
    await db.program.upsert({
      where: { abbreviation_departmentId: { abbreviation: p.abbreviation, departmentId: p.departmentId } },
      update: {},
      create: p,
    })
  }
  console.log(`  Programs created: ${programs.length} programs`)

  // ─── Year Levels + Sections ───────────────────────────────────────────────

  // Only create for undergrad programs (not GS)
  const undergradPrograms = await db.program.findMany({
    where: { department: { college: { abbreviation: { not: "GS" } } } },
  })

  for (const program of undergradPrograms) {
    for (let level = 1; level <= 4; level++) {
      const existing = await db.yearLevel.findUnique({
        where: { level_programId: { level, programId: program.id } },
      })
      if (!existing) {
        const yl = await db.yearLevel.create({
          data: { level, programId: program.id },
        })
        // Create section A for each year level
        await db.section.create({
          data: { name: `${program.abbreviation} ${level}-A`, yearLevelId: yl.id, capacity: 40 },
        })
      }
    }
  }
  console.log("  Year levels & sections created")

  // ─── Buildings + Rooms ────────────────────────────────────────────────────

  const buildings = [
    { name: "HP Building", code: "HP" },
    { name: "MIS Building", code: "MIS" },
    { name: "Gomburza Building", code: "GOMBURZA" },
    { name: "CIT Building", code: "CIT-BLDG" },
    { name: "CABHA Building", code: "CABHA-BLDG" },
    { name: "CAS Building", code: "CAS-BLDG" },
    { name: "CAG Building", code: "CAG-BLDG" },
  ]

  const buildingRecords: Record<string, any> = {}
  for (const b of buildings) {
    buildingRecords[b.code] = await db.building.upsert({
      where: { code: b.code },
      update: {},
      create: b,
    })
  }

  const roomsData = [
    // HP Building rooms
    { name: "HP Room 101", code: "HP-101", buildingId: buildingRecords["HP"].id, type: "LECTURE_ROOM" as const, equipment: ["Projector", "Whiteboard"] },
    { name: "HP Room 102", code: "HP-102", buildingId: buildingRecords["HP"].id, type: "LECTURE_ROOM" as const, equipment: ["Projector", "Whiteboard", "AC"] },
    { name: "HP Room 103", code: "HP-103", buildingId: buildingRecords["HP"].id, type: "LECTURE_ROOM" as const, equipment: ["Projector", "Whiteboard"] },
    { name: "HP Room 201", code: "HP-201", buildingId: buildingRecords["HP"].id, type: "LECTURE_ROOM" as const, equipment: ["Projector", "Whiteboard", "AC"] },
    { name: "HP Room 202", code: "HP-202", buildingId: buildingRecords["HP"].id, type: "LECTURE_ROOM" as const, equipment: ["Projector", "Whiteboard"] },

    // MIS Building
    { name: "MIS Room 101", code: "MIS-101", buildingId: buildingRecords["MIS"].id, type: "LECTURE_ROOM" as const, equipment: ["Projector", "Whiteboard"] },
    { name: "MIS Computer Lab", code: "MIS-LAB1", buildingId: buildingRecords["MIS"].id, type: "COMPUTER_LAB" as const, equipment: ["Computers", "Projector", "AC"] },

    // Gomburza Building
    { name: "Gomburza Room 101", code: "GOM-101", buildingId: buildingRecords["GOMBURZA"].id, type: "LECTURE_ROOM" as const, equipment: ["Projector", "Whiteboard", "AC"] },
    { name: "Gomburza Room 102", code: "GOM-102", buildingId: buildingRecords["GOMBURZA"].id, type: "LECTURE_ROOM" as const, equipment: ["Projector", "Whiteboard"] },

    // CIT Building
    { name: "CIT Lecture 101", code: "CIT-101", buildingId: buildingRecords["CIT-BLDG"].id, type: "LECTURE_ROOM" as const, equipment: ["Projector", "Whiteboard"] },
    { name: "CIT Computer Lab", code: "CIT-LAB1", buildingId: buildingRecords["CIT-BLDG"].id, type: "COMPUTER_LAB" as const, equipment: ["Computers", "Projector", "AC"] },
    { name: "CIT Computer Lab 2", code: "CIT-LAB2", buildingId: buildingRecords["CIT-BLDG"].id, type: "COMPUTER_LAB" as const, equipment: ["Computers", "AC"] },
    { name: "CIT Workshop", code: "CIT-WS1", buildingId: buildingRecords["CIT-BLDG"].id, type: "LABORATORY" as const, equipment: ["Workshop Equipment"] },

    // CABHA Building
    { name: "CABHA Lecture 101", code: "CABHA-101", buildingId: buildingRecords["CABHA-BLDG"].id, type: "LECTURE_ROOM" as const, equipment: ["Projector", "Whiteboard", "AC"] },

    // CAS Building
    { name: "CAS Lecture 101", code: "CAS-101", buildingId: buildingRecords["CAS-BLDG"].id, type: "LECTURE_ROOM" as const, equipment: ["Projector", "Whiteboard", "AC"] },
    { name: "CAS Lecture 102", code: "CAS-102", buildingId: buildingRecords["CAS-BLDG"].id, type: "LECTURE_ROOM" as const, equipment: ["Projector", "Whiteboard"] },
    { name: "CAS Science Lab", code: "CAS-SL1", buildingId: buildingRecords["CAS-BLDG"].id, type: "LABORATORY" as const, equipment: ["Lab Equipment", "Safety Gear"] },

    // CAG Building
    { name: "CAG Lecture 101", code: "CAG-101", buildingId: buildingRecords["CAG-BLDG"].id, type: "LECTURE_ROOM" as const, equipment: ["Projector", "Whiteboard"] },
  ]

  for (const r of roomsData) {
    await db.room.upsert({
      where: { code: r.code },
      update: {},
      create: r,
    })
  }
  console.log("  Buildings & rooms created")

  // ─── Academic Year + Semesters ────────────────────────────────────────────

  const ay = await db.academicYear.upsert({
    where: { label: "2025-2026" },
    update: {},
    create: { label: "2025-2026", startYear: 2025, endYear: 2026, isCurrent: true },
  })

  await db.semester.upsert({
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
  await db.semester.upsert({
    where: { type_academicYearId: { type: "SECOND", academicYearId: ay.id } },
    update: {},
    create: {
      type: "SECOND",
      academicYearId: ay.id,
      startDate: new Date("2026-01-06"),
      endDate: new Date("2026-05-15"),
      isActive: false,
    },
  })
  console.log("  Academic year & semesters created")

  // ─── Delete existing subjects and re-seed ─────────────────────────────────
  // Clear schedule entries first (FK constraint), then subjects
  await db.scheduleEntry.deleteMany({})
  await db.teachingLoad.deleteMany({})
  await db.subject.deleteMany({})
  console.log("  Cleared old subjects")

  // ─── BS Biology Subjects (CAS) — 1st Semester per Year Level ─────────────

  const subjectsData = [
    // ── 1ST YEAR — First Semester ──
    { code: "GEC08", title: "Science, Technology and Society", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 1, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },
    { code: "GEC10", title: "Kontekstwalisadong Komunikasyon sa Filipino", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 1, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },
    { code: "BOT01", title: "General Botany", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 1, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },
    { code: "BOT01L", title: "General Botany Laboratory", units: 2, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 1, departmentId: deptRecords.CAS.id, requiredRoomType: ["LABORATORY" as const] },
    { code: "ZOO01", title: "General Zoology", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 1, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },
    { code: "ZOO01L", title: "General Zoology Laboratory", units: 2, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 1, departmentId: deptRecords.CAS.id, requiredRoomType: ["LABORATORY" as const] },
    { code: "PATHFIT011", title: "Movement Competency Training", units: 2, hoursPerWeek: 2, type: "LECTURE" as const, semester: "FIRST" as const, year: 1, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },

    // ── 2ND YEAR — First Semester ──
    { code: "GEC07", title: "Art Appreciation", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 2, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },
    { code: "BCH02", title: "Analytical Methods for Biology", units: 3, hoursPerWeek: 4, type: "LECTURE" as const, semester: "FIRST" as const, year: 2, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const, "LABORATORY" as const] },
    { code: "BIO02", title: "Genetics", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 2, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },
    { code: "BIO02L", title: "Genetics Laboratory", units: 2, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 2, departmentId: deptRecords.CAS.id, requiredRoomType: ["LABORATORY" as const] },
    { code: "BPH00", title: "Biophysics", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 2, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },
    { code: "BPH00L", title: "Biophysics Laboratory", units: 1, hoursPerWeek: 2, type: "LABORATORY" as const, semester: "FIRST" as const, year: 2, departmentId: deptRecords.CAS.id, requiredRoomType: ["LABORATORY" as const] },
    { code: "BIO03", title: "Comparative Anatomy", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 2, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },
    { code: "BIO03L", title: "Comparative Anatomy Laboratory", units: 2, hoursPerWeek: 3, type: "LABORATORY" as const, semester: "FIRST" as const, year: 2, departmentId: deptRecords.CAS.id, requiredRoomType: ["LABORATORY" as const] },
    { code: "PATHFIT03", title: "Dance, Sports, Martial Arts, Group Exercise, Outdoor and Adventure Activities", units: 2, hoursPerWeek: 2, type: "LECTURE" as const, semester: "FIRST" as const, year: 2, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },

    // ── 3RD YEAR — First Semester ──
    { code: "GEC04", title: "Contemporary World", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 3, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },
    { code: "GEC06", title: "Purposive Communication", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 3, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },
    { code: "BST01", title: "Statistical Biology", units: 3, hoursPerWeek: 4, type: "LECTURE" as const, semester: "FIRST" as const, year: 3, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const, "LABORATORY" as const] },
    { code: "MCB02", title: "Food Safety", units: 3, hoursPerWeek: 4, type: "LECTURE" as const, semester: "FIRST" as const, year: 3, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const, "LABORATORY" as const] },
    { code: "BIO04", title: "General Physiology", units: 5, hoursPerWeek: 5, type: "LECTURE" as const, semester: "FIRST" as const, year: 3, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const, "LABORATORY" as const] },
    { code: "BIO05", title: "Systematics", units: 5, hoursPerWeek: 5, type: "LECTURE" as const, semester: "FIRST" as const, year: 3, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const, "LABORATORY" as const] },
    { code: "BIO101", title: "Thesis I", units: 2, hoursPerWeek: 2, type: "LECTURE" as const, semester: "FIRST" as const, year: 3, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },

    // ── 4TH YEAR — First Semester ──
    { code: "BIO10", title: "Introduction to Philippine Wildlife", units: 5, hoursPerWeek: 5, type: "LECTURE" as const, semester: "FIRST" as const, year: 4, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const, "LABORATORY" as const] },
    { code: "BIO11", title: "Ethnobotany", units: 5, hoursPerWeek: 5, type: "LECTURE" as const, semester: "FIRST" as const, year: 4, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const, "LABORATORY" as const] },
    { code: "ELEC02", title: "Elective 2: Principles and Methods of Teaching Biology", units: 3, hoursPerWeek: 3, type: "LECTURE" as const, semester: "FIRST" as const, year: 4, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },
    { code: "BIO103", title: "Thesis III", units: 2, hoursPerWeek: 2, type: "LECTURE" as const, semester: "FIRST" as const, year: 4, departmentId: deptRecords.CAS.id, requiredRoomType: ["LECTURE_ROOM" as const] },
  ]

  for (const s of subjectsData) {
    await db.subject.upsert({
      where: { code: s.code },
      update: { semester: s.semester, year: s.year },
      create: s,
    })
  }
  console.log("  BS Bio subjects created (1st Semester, Years 1-4)")

  // ─── Super Admin Account ───────────────────────────────────────────────────
  // Promote existing user OR pre-create a super admin record
  // This runs after sign-up so the user already exists via ensureDbUser

  const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "rorbeta@slsu.edu.ph"

  const existingAdmin = await db.user.findUnique({
    where: { email: SUPER_ADMIN_EMAIL },
  })

  if (existingAdmin) {
    await db.user.update({
      where: { email: SUPER_ADMIN_EMAIL },
      data: { role: "SUPER_ADMIN", isApproved: true },
    })
    console.log(`  Super Admin promoted: ${SUPER_ADMIN_EMAIL}`)
  } else {
    console.log(`  Super Admin user not found (${SUPER_ADMIN_EMAIL}). Sign up first, then re-run seed.`)
    console.log(`  Tip: Set SUPER_ADMIN_EMAIL in .env to use a different email.`)
  }

  console.log("\nSeed complete!")
}

main()
  .catch((e) => {
    console.error("Seed error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
