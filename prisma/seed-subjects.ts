import { PrismaClient, SubjectType, SemesterType } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

type S = { code: string; title: string; units: number; hoursPerWeek?: number; type: SubjectType; semester: SemesterType; year: number }
type SWithYL = S & { ylKey: string } // ylKey = "PROG_ABBR:LEVEL"

async function upsertSubject(
  data: S & { departmentId: string; yearLevelId?: string }
) {
  await db.subject.upsert({
    where: { code_departmentId: { code: data.code, departmentId: data.departmentId } },
    update: {
      title: data.title,
      units: data.units,
      hoursPerWeek: data.hoursPerWeek ?? data.units,
      type: data.type,
      semester: data.semester,
      year: data.year,
      ...(data.yearLevelId ? { yearLevelId: data.yearLevelId } : {}),
    },
    create: {
      code: data.code,
      title: data.title,
      units: data.units,
      hoursPerWeek: data.hoursPerWeek ?? data.units,
      type: data.type,
      semester: data.semester,
      year: data.year,
      departmentId: data.departmentId,
      yearLevelId: data.yearLevelId ?? null,
    },
  })
}

async function main() {
  console.log("Seeding subjects...")

  // ── Load departments ──────────────────────────────────────────────────────
  const citDept = await db.department.findFirstOrThrow({ where: { abbreviation: "CIT" } })
  const casDept = await db.department.findFirstOrThrow({ where: { abbreviation: "CAS" } })

  // ── Load year levels keyed by "PROG_ABBR:LEVEL" ───────────────────────────
  const allPrograms = await db.program.findMany({
    include: { yearLevels: true },
    where: { department: { abbreviation: { in: ["CIT", "CAS"] } } },
  })

  const ylMap = new Map<string, string>() // "PROG_ABBR:LEVEL" → yearLevelId
  for (const p of allPrograms) {
    for (const yl of p.yearLevels) {
      ylMap.set(`${p.abbreviation}:${yl.level}`, yl.id)
    }
  }

  function yl(progAbbr: string, level: number): string | undefined {
    return ylMap.get(`${progAbbr}:${level}`)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CIT — SHARED subjects (no yearLevelId → visible in matching year of ALL CIT programs)
  // GEC/GEL/PATHFit/NSTP subjects are intentionally excluded here — they live
  // solely in the CAS department (the authoritative GEC source) and are merged
  // into every program's subject list at query time via the colleges API.
  // ─────────────────────────────────────────────────────────────────────────
  const citShared: S[] = [
    // Common professional / science subjects
    { code: "COM01a",  title: "Computer Programming",                          units: 2, type: "LECTURE",    semester: "FIRST",  year: 1 },
    { code: "COM01aL", title: "Computer Programming Laboratory",               units: 1, type: "LABORATORY", semester: "FIRST",  year: 1 },
    { code: "IIT01",   title: "Introduction to Information Technology",        units: 2, type: "LECTURE",    semester: "SECOND", year: 1 },
    { code: "IIT01L",  title: "Introduction to Information Technology Laboratory", units: 1, type: "LABORATORY", semester: "SECOND", year: 1 },
    { code: "IND01",   title: "Industrial Drawing",                            units: 1, type: "LECTURE",    semester: "SECOND", year: 1 },
    { code: "IND01L",  title: "Industrial Drawing Laboratory",                 units: 1, type: "LABORATORY", semester: "SECOND", year: 1 },
    { code: "CHM01a",  title: "Chemistry for Industrial Technologist",         units: 2, type: "LECTURE",    semester: "FIRST",  year: 2 },
    { code: "CHM01aL", title: "Chemistry for Industrial Technologist Laboratory", units: 1, type: "LABORATORY", semester: "FIRST",  year: 2 },
    { code: "PHY01a",  title: "Physics for Industrial Technologist",           units: 2, type: "LECTURE",    semester: "SECOND", year: 2 },
    { code: "PHY01aL", title: "Physics for Industrial Technologist Laboratory",units: 3, type: "LABORATORY", semester: "SECOND", year: 2 },
    { code: "MAT04a",  title: "Comprehensive Mathematics",                     units: 5, type: "LECTURE",    semester: "SECOND", year: 2 },
    // Year 3 professional core
    { code: "MTM01",   title: "Materials Technology Management",               units: 3, type: "LECTURE", semester: "FIRST",  year: 3 },
    { code: "PSY11a",  title: "Industrial Psychology",                         units: 3, type: "LECTURE", semester: "FIRST",  year: 3 },
    { code: "IEN11a",  title: "Production Management",                         units: 3, type: "LECTURE", semester: "FIRST",  year: 3 },
    { code: "RES01a",  title: "Project Study 1 with Intellectual Property Rights", units: 2, type: "LECTURE",    semester: "FIRST",  year: 3 },
    { code: "RES01aL", title: "Project Study 1 with Intellectual Property Rights Laboratory", units: 1, type: "LABORATORY", semester: "FIRST",  year: 3 },
    { code: "FLO01",   title: "Foreign Language",                              units: 3, type: "LECTURE", semester: "SECOND", year: 3 },
    { code: "MGT02",   title: "Technopreneurship",                             units: 3, type: "LECTURE", semester: "SECOND", year: 3 },
    { code: "IEN08a",  title: "Quality Control and Assurance",                 units: 3, type: "LECTURE", semester: "SECOND", year: 3 },
    { code: "IEN04a",  title: "Industrial Organization and Management",        units: 3, type: "LECTURE", semester: "SECOND", year: 3 },
    { code: "RES02a",  title: "Project Study 2",                               units: 2, type: "LECTURE",    semester: "SECOND", year: 3 },
    { code: "RES02aL", title: "Project Study 2 Laboratory",                    units: 1, type: "LABORATORY", semester: "SECOND", year: 3 },
  ]

  let count = 0
  for (const s of citShared) {
    await upsertSubject({ ...s, departmentId: citDept.id })
    count++
  }
  console.log(`  CIT shared subjects: ${count}`)

  // ─────────────────────────────────────────────────────────────────────────
  // CIT — BSIT-Garm (Apparel & Fashion Technology — AFT)
  // ─────────────────────────────────────────────────────────────────────────
  const aftSubjects: SWithYL[] = [
    // Y1 S1
    { code: "AFT01",  title: "Occupational Safety and Health",                    units: 3, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Garm:1" },
    { code: "AFT02",  title: "Sewing Machine Operations, Maintenance & Basic Apparel", units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Garm:1" },
    { code: "AFT02L", title: "Sewing Machine Operations, Maintenance & Basic Apparel Laboratory", units: 2, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Garm:1" },
    { code: "AFT03",  title: "Fundamentals of Apparel Construction",              units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Garm:1" },
    { code: "AFT03L", title: "Fundamentals of Apparel Construction Laboratory",   units: 2, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Garm:1" },
    // Y1 S2
    { code: "AFT04",  title: "Introduction to Fashion Designing",                 units: 1, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Garm:1" },
    { code: "AFT04L", title: "Introduction to Fashion Designing Laboratory",      units: 1, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Garm:1" },
    { code: "AFT05",  title: "Advanced Apparel Construction",                     units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Garm:1" },
    { code: "AFT05L", title: "Advanced Apparel Construction Laboratory",          units: 2, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Garm:1" },
    // Y2 S1
    { code: "AFT06",  title: "Fashion Arts and Apparel Accessories",              units: 1, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Garm:2" },
    { code: "AFT06L", title: "Fashion Arts and Apparel Accessories Laboratory",   units: 1, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Garm:2" },
    { code: "AFT07",  title: "Creative Costume Design and Construction",          units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Garm:2" },
    { code: "AFT07L", title: "Creative Costume Design and Construction Laboratory", units: 2, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Garm:2" },
    { code: "AFT08",  title: "Pattern Standardization and Grading",               units: 1, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Garm:2" },
    { code: "AFT08L", title: "Pattern Standardization and Grading Laboratory",    units: 1, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Garm:2" },
    // Y2 S2
    { code: "AFT09",  title: "Tailoring",                                         units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Garm:2" },
    { code: "AFT09L", title: "Tailoring Laboratory",                              units: 2, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Garm:2" },
    // Y3 S1
    { code: "AFT10",  title: "Advanced Pattern Drafting/Designing",               units: 1, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-Garm:3" },
    { code: "AFT10L", title: "Advanced Pattern Drafting/Designing Laboratory",    units: 2, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSIT-Garm:3" },
    { code: "AFT11",  title: "Home Furnishing and Fashion Accessories",           units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-Garm:3" },
    { code: "AFT11L", title: "Home Furnishing and Fashion Accessories Laboratory",units: 2, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSIT-Garm:3" },
    // Y3 S2
    { code: "AFT12",  title: "Fabrics and Thread: Selection and Usage",           units: 3, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-Garm:3" },
    { code: "AFT13",  title: "Production Management in Garment Industry",         units: 3, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-Garm:3" },
    { code: "AFT14",  title: "Draping, Fashion Modeling, and Fashion Show with Hair Styling and Artistic Make-up", units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-Garm:3" },
    { code: "AFT14L", title: "Draping, Fashion Modeling, and Fashion Show Laboratory", units: 2, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSIT-Garm:3" },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // CIT — BSIT-Auto (Automotive Technology — AIT)
  // ─────────────────────────────────────────────────────────────────────────
  const aitSubjects: SWithYL[] = [
    // Y1 S1
    { code: "AIT01",  title: "Occupational Safety and Health",                        units: 3, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Auto:1" },
    { code: "AIT02",  title: "Fundamentals of Automotive Technology",                 units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Auto:1" },
    { code: "AIT03",  title: "Automotive Electrical System",                          units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Auto:1" },
    // Y1 S2
    { code: "AIT04",  title: "Automotive Electronics",                                units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Auto:1" },
    { code: "AIT04L", title: "Automotive Electronics Laboratory",                     units: 3, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Auto:1" },
    { code: "AIT05",  title: "Small Engine Repair and Motorcycle Servicing",          units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Auto:1" },
    { code: "AIT05L", title: "Small Engine Repair and Motorcycle Servicing Laboratory", units: 3, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Auto:1" },
    { code: "AIT06",  title: "Car Care Servicing, Emission Control, and Tune-up",    units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Auto:1" },
    { code: "AIT06L", title: "Car Care Servicing, Emission Control, and Tune-up Laboratory", units: 3, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Auto:1" },
    // Y2 S1
    { code: "AIT07",  title: "Body Repair and Painting",                              units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Auto:2" },
    { code: "AIT07L", title: "Body Repair and Painting Laboratory",                   units: 3, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Auto:2" },
    { code: "AIT08",  title: "Power Train and Conversion System",                     units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Auto:2" },
    { code: "AIT08L", title: "Power Train and Conversion System Laboratory",          units: 3, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Auto:2" },
    { code: "AIT09",  title: "Automotive LPG System",                                 units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Auto:2" },
    { code: "AIT09L", title: "Automotive LPG System Laboratory",                      units: 3, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Auto:2" },
    { code: "AIT10",  title: "Automotive Air Conditioning",                           units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Auto:2" },
    { code: "AIT10L", title: "Automotive Air Conditioning Laboratory",                units: 3, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Auto:2" },
    // Y2 S2
    { code: "AIT11",  title: "Engine Overhauling and Performance Testing",            units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Auto:2" },
    { code: "AIT11L", title: "Engine Overhauling and Performance Testing Laboratory", units: 3, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Auto:2" },
    { code: "AIT12",  title: "Hybrid and Electric Vehicle",                           units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Auto:2" },
    { code: "AIT12L", title: "Hybrid and Electric Vehicle Laboratory",                units: 3, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Auto:2" },
    { code: "AIT13",  title: "Driving Education",                                     units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Auto:2" },
    { code: "AIT13L", title: "Driving Education Laboratory",                          units: 1, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Auto:2" },
    // Y3 S1
    { code: "AIT14",  title: "Body Management and Under-chassis Electronic Control System", units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-Auto:3" },
    { code: "AIT14L", title: "Body Management and Under-chassis Electronic Control System Laboratory", units: 3, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSIT-Auto:3" },
    // Y3 S2
    { code: "AIT15",  title: "Automotive Computer-Aided Design",                      units: 1, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-Auto:3" },
    { code: "AIT15L", title: "Automotive Computer-Aided Design Laboratory",           units: 3, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSIT-Auto:3" },
    { code: "AIT16",  title: "Electronics Engine Management System",                  units: 3, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-Auto:3" },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // CIT — BSIT-Comp (Computer Technology — CPT)
  // ─────────────────────────────────────────────────────────────────────────
  const cptSubjects: SWithYL[] = [
    // Y1 S1
    { code: "CPT02a",  title: "Fundamentals of Electricity and Electronics",       units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Comp:1" },
    { code: "CPT02aL", title: "Fundamentals of Electricity and Electronics Laboratory", units: 1, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Comp:1" },
    { code: "CPT04",   title: "Computer System and Hardware",                      units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Comp:1" },
    { code: "CPT04L",  title: "Computer System and Hardware Laboratory",           units: 1, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Comp:1" },
    { code: "CPT05",   title: "Logic and Switching Theory",                        units: 1, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Comp:1" },
    { code: "CPT05L",  title: "Logic and Switching Theory Laboratory",             units: 1, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Comp:1" },
    // Y1 S2
    { code: "CPT01",   title: "Occupational Safety and Health",                    units: 3, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Comp:1" },
    { code: "CPT08a",  title: "Computer Installation and Servicing",               units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Comp:1" },
    { code: "CPT08aL", title: "Computer Installation and Servicing Laboratory",    units: 2, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Comp:1" },
    { code: "ITE15",   title: "Computer Networking I",                             units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Comp:1" },
    { code: "ITE15L",  title: "Computer Networking I Laboratory",                  units: 1, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Comp:1" },
    // Y2 S1
    { code: "CPT10",   title: "Specialized Technology 1",                          units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Comp:2" },
    { code: "CPT10L",  title: "Specialized Technology 1 Laboratory",               units: 1, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Comp:2" },
    // Y2 S2
    { code: "CPT14",   title: "Specialized Technology 2",                          units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Comp:2" },
    { code: "CPT14L",  title: "Specialized Technology 2 Laboratory",               units: 1, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Comp:2" },
    { code: "CPT16",   title: "Advanced Programming",                              units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Comp:2" },
    { code: "CPT16L",  title: "Advanced Programming Laboratory",                   units: 2, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Comp:2" },
    // Y3 S1
    { code: "CPT17",   title: "Embedded System",                                   units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-Comp:3" },
    { code: "CPT17L",  title: "Embedded System Laboratory",                        units: 2, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSIT-Comp:3" },
    { code: "CPT18",   title: "Platform Technologies",                             units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-Comp:3" },
    { code: "CPT18L",  title: "Platform Technologies Laboratory",                  units: 1, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSIT-Comp:3" },
    { code: "CPT19",   title: "Information Management",                            units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-Comp:3" },
    { code: "CPT19L",  title: "Information Management Laboratory",                 units: 1, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSIT-Comp:3" },
    // Y3 S2
    { code: "ITE13a",  title: "Professional Issues in Computing",                  units: 3, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-Comp:3" },
    { code: "ITE28",   title: "Emerging Technologies",                             units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-Comp:3" },
    { code: "ITE28L",  title: "Emerging Technologies Laboratory",                  units: 1, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSIT-Comp:3" },
    { code: "CPT11a",  title: "Seminar in Computer Technology",                    units: 1, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-Comp:3" },
    { code: "CPT11aL", title: "Seminar in Computer Technology Laboratory",         units: 1, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSIT-Comp:3" },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // CIT — BSIT-Food (Culinary Technology — CUL)
  // ─────────────────────────────────────────────────────────────────────────
  const culSubjects: SWithYL[] = [
    // Y1 S1
    { code: "CUL01",  title: "Occupational Safety and Health",                        units: 3, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Food:1" },
    { code: "CUL02",  title: "Food Safety and Sanitation",                            units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Food:1" },
    { code: "CUL02L", title: "Food Safety and Sanitation Laboratory",                 units: 2, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Food:1" },
    { code: "CUL03",  title: "Kitchen Essential and Basic Food Preparation",          units: 3, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Food:1" },
    // Y1 S2
    { code: "CUL04",  title: "Advanced Food Preparation",                             units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Food:1" },
    { code: "CUL04L", title: "Advanced Food Preparation Laboratory",                  units: 2, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Food:1" },
    { code: "CUL05",  title: "Food Styling and Design",                               units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Food:1" },
    { code: "CUL05L", title: "Food Styling and Design Laboratory",                    units: 1, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Food:1" },
    // Y2 S1
    { code: "CUL06",  title: "Advanced Garde Manger",                                 units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Food:2" },
    { code: "CUL06L", title: "Advanced Garde Manger Laboratory",                      units: 1, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Food:2" },
    { code: "CUL07",  title: "Introduction to Bakery and Pastry",                     units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Food:2" },
    { code: "CUL07L", title: "Introduction to Bakery and Pastry Laboratory",          units: 2, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Food:2" },
    // Y2 S2
    { code: "CUL08",  title: "Quantity Food Production, Planning and Management",     units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Food:2" },
    { code: "CUL08L", title: "Quantity Food Production, Planning and Management Laboratory", units: 1, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Food:2" },
    { code: "CUL09",  title: "Wine, Beverage and Mixology",                           units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Food:2" },
    { code: "CUL09L", title: "Wine, Beverage and Mixology Laboratory",                units: 1, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Food:2" },
    // Y3 S1
    { code: "CUL10",  title: "Catering and Events Simulation",                        units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-Food:3" },
    { code: "CUL10L", title: "Catering and Events Simulation Laboratory",             units: 2, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSIT-Food:3" },
    { code: "CUL11",  title: "Nutrition and Food Trends",                             units: 3, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-Food:3" },
    { code: "CUL12",  title: "Philippine Regional Cuisine and Asian Cuisine",         units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-Food:3" },
    { code: "CUL12L", title: "Philippine Regional Cuisine and Asian Cuisine Laboratory", units: 1, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSIT-Food:3" },
    // Y3 S2
    { code: "CUL13",  title: "Western Cuisine",                                       units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-Food:3" },
    { code: "CUL13L", title: "Western Cuisine Laboratory",                            units: 1, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSIT-Food:3" },
    { code: "CUL14",  title: "Plant-based Cooking",                                   units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-Food:3" },
    { code: "CUL14L", title: "Plant-based Cooking Laboratory",                        units: 1, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSIT-Food:3" },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // CIT — BSIT-Eltx (Electronics Technology — ELX)
  // ─────────────────────────────────────────────────────────────────────────
  const elxSubjects: SWithYL[] = [
    // Y1 S1
    { code: "ELX01",  title: "Occupational Safety and Health",         units: 3, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Eltx:1" },
    { code: "ELX02",  title: "Electronic Devices 1",                   units: 3, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Eltx:1" },
    { code: "ELX02L", title: "Electronic Devices 1 Laboratory",        units: 6, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Eltx:1" },
    { code: "ELX03",  title: "Electronics Communication 1",            units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Eltx:1" },
    { code: "ELX03L", title: "Electronics Communication 1 Laboratory", units: 3, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Eltx:1" },
    { code: "ELX04",  title: "Electronics CAD",                        units: 1, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Eltx:1" },
    { code: "ELX04L", title: "Electronics CAD Laboratory",             units: 3, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Eltx:1" },
    // Y1 S2
    { code: "ELX05",  title: "Electronic Devices 2",                   units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Eltx:1" },
    { code: "ELX05L", title: "Electronic Devices 2 Laboratory",        units: 3, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Eltx:1" },
    { code: "ELX06",  title: "Electronic Communications 2",            units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Eltx:1" },
    { code: "ELX06L", title: "Electronic Communications 2 Laboratory", units: 3, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Eltx:1" },
    { code: "ELX07",  title: "Digital Electronics",                    units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Eltx:1" },
    { code: "ELX07L", title: "Digital Electronics Laboratory",         units: 3, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Eltx:1" },
    // Y2 S1
    { code: "ELX08",  title: "Instrumentation and Process Control",    units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Eltx:2" },
    { code: "ELX08L", title: "Instrumentation and Process Control Laboratory", units: 3, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Eltx:2" },
    { code: "ELX09",  title: "Sensor Technology",                      units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Eltx:2" },
    { code: "ELX09L", title: "Sensor Technology Laboratory",           units: 3, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Eltx:2" },
    { code: "ELX10",  title: "Electronic Laws and Standards",          units: 3, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Eltx:2" },
    // Y2 S2
    { code: "ELX11",  title: "Multimedia Systems",                     units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Eltx:2" },
    { code: "ELX11L", title: "Multimedia Systems Laboratory",          units: 3, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Eltx:2" },
    { code: "ELX12",  title: "Industrial Electronics",                 units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Eltx:2" },
    { code: "ELX12L", title: "Industrial Electronics Laboratory",      units: 3, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Eltx:2" },
    { code: "ELX13",  title: "Electro-Pneumatic Systems",              units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Eltx:2" },
    { code: "ELX13L", title: "Electro-Pneumatic Systems Laboratory",   units: 3, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Eltx:2" },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // CIT — BSIT-Elec (Electrical Technology — ELT)
  // Note: ELT17/ELT18 are shared between BSIT-Eltx (Y3) and BSIT-Elec (Y3).
  //       They are created once under BSIT-Elec Y3 (the primary ELT program).
  // ─────────────────────────────────────────────────────────────────────────
  const eltSubjects: SWithYL[] = [
    // Y1 S1
    { code: "ELT01",  title: "Occupational Safety and Health",                 units: 3, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT02",  title: "Electricity and Electronics Principles",         units: 1, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT02L", title: "Electricity and Electronics Principles Laboratory", units: 3, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT03",  title: "DC Circuits",                                    units: 1, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT03L", title: "DC Circuits Laboratory",                         units: 3, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT04",  title: "Shop Process, Tools and Equipment",              units: 1, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT04L", title: "Shop Process, Tools and Equipment Laboratory",   units: 3, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT05",  title: "Philippine Electrical Code",                     units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT06",  title: "Residential Wiring System",                      units: 1, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT06L", title: "Residential Wiring System Laboratory",           units: 6, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Elec:1" },
    // Y1 S2
    { code: "ELT07",  title: "AC Circuits",                                    units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT07L", title: "AC Circuits Laboratory",                         units: 3, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT08",  title: "Industrial Wiring System",                       units: 1, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT08L", title: "Industrial Wiring System Laboratory",            units: 6, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT09",  title: "Electrical Instruments and Measurement",         units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT09L", title: "Electrical Instruments and Measurement Laboratory", units: 3, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT10",  title: "Electrical Machines",                            units: 1, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Elec:1" },
    { code: "ELT10L", title: "Electrical Machines Laboratory",                 units: 6, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Elec:1" },
    // Y2 S1
    { code: "ELT11",  title: "Transmission and Distribution System",           units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Elec:2" },
    { code: "ELT11L", title: "Transmission and Distribution System Laboratory",units: 3, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Elec:2" },
    { code: "ELT12",  title: "Industrial Motor Controllers",                   units: 1, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Elec:2" },
    { code: "ELT12L", title: "Industrial Motor Controllers Laboratory",        units: 3, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Elec:2" },
    { code: "ELT13",  title: "Power Production and Management Systems",        units: 1, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Elec:2" },
    { code: "ELT13L", title: "Power Production and Management Systems Laboratory", units: 3, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Elec:2" },
    // Y2 S2
    { code: "ELT14",  title: "Logic Circuits",                                 units: 1, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Elec:2" },
    { code: "ELT14L", title: "Logic Circuits Laboratory",                      units: 3, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Elec:2" },
    { code: "ELT15",  title: "Electrical Computer Aided Design",               units: 1, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Elec:2" },
    { code: "ELT15L", title: "Electrical Computer Aided Design Laboratory",    units: 3, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Elec:2" },
    { code: "ELT16",  title: "Programmable Logic Controllers",                 units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Elec:2" },
    { code: "ELT16L", title: "Programmable Logic Controllers Laboratory",      units: 3, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Elec:2" },
    // Y3 S1 — ELT17/ELT18 shared with ELX (primary location)
    { code: "ELT17",  title: "Electro-Pneumatic Systems",                      units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-Elec:3" },
    { code: "ELT17L", title: "Electro-Pneumatic Systems Laboratory",           units: 3, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSIT-Elec:3" },
    // Y3 S2
    { code: "ELT18",  title: "Instrumentation and Process Control",            units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-Elec:3" },
    { code: "ELT18L", title: "Instrumentation and Process Control Laboratory", units: 3, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSIT-Elec:3" },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // CIT — BSIT-Mech (Mechanical Technology — MET)
  // ─────────────────────────────────────────────────────────────────────────
  const metSubjects: SWithYL[] = [
    // Y1 S1
    { code: "MET01",  title: "Occupational Health and Safety",                          units: 3, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Mech:1" },
    { code: "MET02",  title: "Basic Arc and Gas Welding Practices",                    units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Mech:1" },
    { code: "MET02L", title: "Basic Arc and Gas Welding Practices Laboratory",         units: 2, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Mech:1" },
    { code: "MET03",  title: "Bench Working: Pipefitting and Pipe Bending",            units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-Mech:1" },
    { code: "MET03L", title: "Bench Working: Pipefitting and Pipe Bending Laboratory", units: 2, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-Mech:1" },
    // Y1 S2
    { code: "MET04",  title: "Metallurgy and Heat Treatment",                          units: 1, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Mech:1" },
    { code: "MET04L", title: "Metallurgy and Heat Treatment Laboratory",               units: 2, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Mech:1" },
    { code: "MET05",  title: "Machining I: Turning and Shaping",                       units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-Mech:1" },
    { code: "MET05L", title: "Machining I: Turning and Shaping Laboratory",            units: 2, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-Mech:1" },
    // Y2 S1
    { code: "MET06",  title: "Mechanical CAD",                                         units: 1, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Mech:2" },
    { code: "MET06L", title: "Mechanical CAD Laboratory",                              units: 1, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-Mech:2" },
    { code: "MET07",  title: "Machine Design for Technology",                          units: 3, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-Mech:2" },
    // Y2 S2
    { code: "MET08",  title: "Machining II: Milling and Surface Grinding",             units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Mech:2" },
    { code: "MET08L", title: "Machining II: Milling and Surface Grinding Laboratory",  units: 2, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Mech:2" },
    { code: "MET09",  title: "Basic CNC Lathe",                                        units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-Mech:2" },
    { code: "MET09L", title: "Basic CNC Lathe Laboratory",                             units: 2, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-Mech:2" },
    // Y3 S1
    { code: "MET10",  title: "Principle of Tool & Die and Pattern Development",        units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-Mech:3" },
    { code: "MET10L", title: "Principle of Tool & Die and Pattern Development Laboratory", units: 2, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSIT-Mech:3" },
    { code: "MET11",  title: "Basic CNC Milling",                                      units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-Mech:3" },
    { code: "MET11L", title: "Basic CNC Milling Laboratory",                           units: 2, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSIT-Mech:3" },
    // Y3 S2
    { code: "MET12",  title: "Advance Computer Numerical Control (CNC)",               units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-Mech:3" },
    { code: "MET12L", title: "Advance Computer Numerical Control (CNC) Laboratory",    units: 2, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSIT-Mech:3" },
    { code: "MET13",  title: "Pneumatic, Electropneumatic and Hydraulic",              units: 1, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-Mech:3" },
    { code: "MET13L", title: "Pneumatic, Electropneumatic and Hydraulic Laboratory",   units: 2, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSIT-Mech:3" },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // CIT — BSIT-ID (Print Media Technology — PMT)
  // ─────────────────────────────────────────────────────────────────────────
  const pmtSubjects: SWithYL[] = [
    // Y1 S1
    { code: "PMT01",  title: "Occupational Safety and Health",                      units: 3, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-ID:1" },
    { code: "PMT02",  title: "Fundamentals of Visual Communication",                units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-ID:1" },
    { code: "PMT02L", title: "Fundamentals of Visual Communication Laboratory",     units: 2, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-ID:1" },
    { code: "PMT03",  title: "Introduction to Printing Techniques",                 units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSIT-ID:1" },
    { code: "PMT03L", title: "Introduction to Printing Techniques Laboratory",      units: 2, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSIT-ID:1" },
    // Y1 S2
    { code: "PMT04",  title: "Introduction to Media Technology",                    units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-ID:1" },
    { code: "PMT04L", title: "Introduction to Media Technology Laboratory",         units: 2, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-ID:1" },
    { code: "PMT05",  title: "Sustainability and Environment",                      units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSIT-ID:1" },
    { code: "PMT05L", title: "Sustainability and Environment Laboratory",           units: 2, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSIT-ID:1" },
    // Y2 S1
    { code: "PMT06",  title: "Visual Graphic Design",                               units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSIT-ID:2" },
    { code: "PMT06L", title: "Visual Graphic Design Laboratory",                    units: 2, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSIT-ID:2" },
    // Y2 S2
    { code: "PMT07",  title: "Digital Printing",                                    units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-ID:2" },
    { code: "PMT07L", title: "Digital Printing Laboratory",                         units: 2, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-ID:2" },
    { code: "PMT08",  title: "Digital Photography and Image Processing",            units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSIT-ID:2" },
    { code: "PMT08L", title: "Digital Photography and Image Processing Laboratory", units: 2, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSIT-ID:2" },
    // Y3 S1
    { code: "PMT09",  title: "Commercial and Packaging Design",                     units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-ID:3" },
    { code: "PMT09L", title: "Commercial and Packaging Design Laboratory",          units: 2, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSIT-ID:3" },
    { code: "PMT10",  title: "Industrial Printing",                                 units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-ID:3" },
    { code: "PMT10L", title: "Industrial Printing Laboratory",                      units: 2, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSIT-ID:3" },
    { code: "PSY11",  title: "Industrial Psychology",                               units: 3, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSIT-ID:3" },
    // Y3 S2
    { code: "PMT11",  title: "Digital Print Production",                            units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-ID:3" },
    { code: "PMT11L", title: "Digital Print Production Laboratory",                 units: 2, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSIT-ID:3" },
    { code: "PMT12",  title: "Printing Press Management",                           units: 1, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSIT-ID:3" },
    { code: "PMT12L", title: "Printing Press Management Laboratory",                units: 2, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSIT-ID:3" },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // CIT — BSInfoTech (BS Information Technology — ITE)
  // ─────────────────────────────────────────────────────────────────────────
  const iteSubjects: SWithYL[] = [
    // Y1 S1
    { code: "GEC10",  title: "Kontekstwalisadong Komunikasyon sa Filipino",    units: 3, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSInfoTech:1" },
    { code: "ITE01",  title: "Introduction to Computing",                      units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSInfoTech:1" },
    { code: "ITE01L", title: "Introduction to Computing Laboratory",           units: 1, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSInfoTech:1" },
    // Y1 S2
    { code: "GEC11",  title: "Filipino sa Iba't Ibang Disiplina",              units: 3, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSInfoTech:1" },
    { code: "ITE02",  title: "Computer Programming 1",                         units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSInfoTech:1" },
    { code: "ITE02L", title: "Computer Programming 1 Laboratory",              units: 1, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSInfoTech:1" },
    // Y2 S1
    { code: "ITE03",  title: "Human Computer Interaction",                     units: 3, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE04",  title: "Discrete Mathematics",                           units: 3, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE05",  title: "Computer Programming 2",                         units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE05L", title: "Computer Programming 2 Laboratory",              units: 1, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE06",  title: "Visual Graphic Design",                          units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE06L", title: "Visual Graphic Design Laboratory",               units: 1, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE07",  title: "Database Management Systems 1",                  units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE07L", title: "Database Management Systems 1 Laboratory",       units: 1, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSInfoTech:2" },
    // Y2 S2
    { code: "GEC13",  title: "Literature of the Philippines",                  units: 3, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE08",  title: "Data Structures and Algorithms",                 units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE08L", title: "Data Structures and Algorithms Laboratory",      units: 1, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE09",  title: "Quantitative Methods",                           units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE09L", title: "Quantitative Methods Laboratory",                units: 1, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE10",  title: "Front-End Development",                          units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE10L", title: "Front-End Development Laboratory",               units: 1, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE11",  title: "Database Management Systems 2",                  units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSInfoTech:2" },
    { code: "ITE11L", title: "Database Management Systems 2 Laboratory",       units: 1, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSInfoTech:2" },
    // Y3 S1
    { code: "ITE12",  title: "Information Assurance and Security",             units: 3, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE13",  title: "IT Social and Professional Issues",              units: 3, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE14",  title: "Systems Analysis and Design",                    units: 3, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE16",  title: "Object-Oriented Programming",                    units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE16L", title: "Object-Oriented Programming Laboratory",         units: 1, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE17",  title: "Cognate/Professional Course 1 (Elective)",       units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE17L", title: "Cognate/Professional Course 1 Laboratory",       units: 1, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE18",  title: "Cognate/Professional Course 2 (Elective)",       units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE18L", title: "Cognate/Professional Course 2 Laboratory",       units: 1, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSInfoTech:3" },
    // Y3 S2
    { code: "ITE19",  title: "Computer Organization, Architecture and Logic",  units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE19L", title: "Computer Organization, Architecture and Logic Laboratory", units: 1, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE20",  title: "Computer Networking 2",                          units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE20L", title: "Computer Networking 2 Laboratory",               units: 1, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE21",  title: "Operating Systems",                              units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE21L", title: "Operating Systems Laboratory",                   units: 1, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE22",  title: "IT Project Management",                          units: 3, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE23",  title: "Capstone Project 1",                             units: 3, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE24",  title: "Cognate/Professional Course 3 (Elective)",       units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE24L", title: "Cognate/Professional Course 3 Laboratory",       units: 1, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE25",  title: "Cognate/Professional Course 4 (Elective)",       units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSInfoTech:3" },
    { code: "ITE25L", title: "Cognate/Professional Course 4 Laboratory",       units: 1, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSInfoTech:3" },
    // Y4 S1
    { code: "ITE26",  title: "Seminars in IT Trends",                          units: 1, type: "LABORATORY", semester: "FIRST",  year: 4, ylKey: "BSInfoTech:4" },
    { code: "ITE27",  title: "User Experience Design",                         units: 3, type: "LECTURE",    semester: "FIRST",  year: 4, ylKey: "BSInfoTech:4" },
    { code: "ITE29",  title: "Capstone Project 2",                             units: 3, type: "LECTURE",    semester: "FIRST",  year: 4, ylKey: "BSInfoTech:4" },
    { code: "ITE30",  title: "IT Entrepreneurship",                            units: 3, type: "LECTURE",    semester: "FIRST",  year: 4, ylKey: "BSInfoTech:4" },
    { code: "ITE31",  title: "Systems Administration and Maintenance",         units: 2, type: "LECTURE",    semester: "FIRST",  year: 4, ylKey: "BSInfoTech:4" },
    { code: "ITE31L", title: "Systems Administration and Maintenance Laboratory", units: 1, type: "LABORATORY", semester: "FIRST",  year: 4, ylKey: "BSInfoTech:4" },
    { code: "ITE32",  title: "Data Mining and Analytics",                      units: 2, type: "LECTURE",    semester: "FIRST",  year: 4, ylKey: "BSInfoTech:4" },
    { code: "ITE32L", title: "Data Mining and Analytics Laboratory",           units: 1, type: "LABORATORY", semester: "FIRST",  year: 4, ylKey: "BSInfoTech:4" },
  ]

  // Insert all CIT program-specific subjects
  const citProgSubjects = [
    ...aftSubjects, ...aitSubjects, ...cptSubjects, ...culSubjects,
    ...elxSubjects, ...eltSubjects, ...metSubjects, ...pmtSubjects, ...iteSubjects,
  ]
  let citProgCount = 0
  for (const s of citProgSubjects) {
    const yearLevelId = yl(s.ylKey.split(":")[0], Number(s.ylKey.split(":")[1]))
    await upsertSubject({ ...s, departmentId: citDept.id, yearLevelId })
    citProgCount++
  }
  console.log(`  CIT program-specific subjects: ${citProgCount}`)

  // ─────────────────────────────────────────────────────────────────────────
  // CAS — SHARED subjects (no yearLevelId)
  // ─────────────────────────────────────────────────────────────────────────
  const casShared: S[] = [
    // GEC (same codes but separate CAS dept records)
    { code: "GEC01", title: "The Life and Works of Rizal",         units: 3, type: "LECTURE", semester: "SECOND", year: 1 },
    { code: "GEC02", title: "Understanding the Self",              units: 3, type: "LECTURE", semester: "FIRST",  year: 1 },
    { code: "GEC03", title: "Readings in the Philippine History",  units: 3, type: "LECTURE", semester: "FIRST",  year: 1 },
    { code: "GEC04", title: "The Contemporary World",              units: 3, type: "LECTURE", semester: "FIRST",  year: 1 },
    { code: "GEC05", title: "Mathematics in the Modern World",     units: 3, type: "LECTURE", semester: "SECOND", year: 1 },
    { code: "GEC06", title: "Purposive Communication",             units: 3, type: "LECTURE", semester: "FIRST",  year: 1 },
    { code: "GEC07", title: "Art Appreciation",                    units: 3, type: "LECTURE", semester: "FIRST",  year: 2 },
    { code: "GEC08", title: "Science, Technology and Society",     units: 3, type: "LECTURE", semester: "FIRST",  year: 1 },
    { code: "GEC09", title: "Ethics",                              units: 3, type: "LECTURE", semester: "SECOND", year: 2 },
    { code: "GEC10", title: "Kontekstwalisadong Komunikasyon sa Filipino", units: 3, type: "LECTURE", semester: "FIRST",  year: 1 },
    { code: "GEC11", title: "Filipino sa Iba't Ibang Disiplina",   units: 3, type: "LECTURE", semester: "SECOND", year: 2 },
    { code: "GEC12", title: "Dalumat ng/sa Filipino",              units: 3, type: "LECTURE", semester: "FIRST",  year: 3 },
    { code: "GEC13", title: "Literature of the Philippines",       units: 3, type: "LECTURE", semester: "SECOND", year: 2 },
    { code: "GEC14", title: "Literature of the World",             units: 3, type: "LECTURE", semester: "SECOND", year: 2 },
    // PATHFit
    { code: "PATHFit01", title: "Movement Competency Training",    units: 2, type: "LECTURE", semester: "FIRST",  year: 1 },
    { code: "PATHFit02", title: "Exercise Based Fitness Activities", units: 2, type: "LECTURE", semester: "SECOND", year: 1 },
    { code: "PATHFit03", title: "Dance, Sports, Martial Arts, Group Exercise, Outdoor and Adventure Activities (Sem 1)", units: 2, type: "LECTURE", semester: "FIRST",  year: 2 },
    { code: "PATHFit04", title: "Dance, Sports, Martial Arts, Group Exercise, Outdoor and Adventure Activities (Sem 2)", units: 2, type: "LECTURE", semester: "SECOND", year: 2 },
    // NST
    { code: "NSTP1", title: "National Service Training Program 1", units: 3, type: "LECTURE", semester: "FIRST",  year: 1 },
    { code: "NSTP2", title: "National Service Training Program 2", units: 3, type: "LECTURE", semester: "SECOND", year: 1 },
  ]

  let casSharedCount = 0
  for (const s of casShared) {
    await upsertSubject({ ...s, departmentId: casDept.id })
    casSharedCount++
  }
  console.log(`  CAS shared subjects: ${casSharedCount}`)

  // ─────────────────────────────────────────────────────────────────────────
  // CAS — BSBio (BS Biology)
  // ─────────────────────────────────────────────────────────────────────────
  const bioSubjects: SWithYL[] = [
    // Y1 S1
    { code: "BOT01",   title: "General Botany",                  units: 3, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSBio:1" },
    { code: "BOT01L",  title: "General Botany Laboratory",       units: 2, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSBio:1" },
    { code: "ZOO01",   title: "General Zoology",                 units: 3, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSBio:1" },
    { code: "ZOO01L",  title: "General Zoology Laboratory",      units: 2, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSBio:1" },
    // Y1 S2
    { code: "BCH01",   title: "Organic Molecules",               units: 2, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSBio:1" },
    { code: "BIO01",   title: "General Ecology",                 units: 3, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSBio:1" },
    { code: "BIO01L",  title: "General Ecology Laboratory",      units: 2, type: "LABORATORY", semester: "SECOND", year: 1, ylKey: "BSBio:1" },
    // Y2 S1
    { code: "BCH02",   title: "Analytical Methods for Biology",  units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSBio:2" },
    { code: "BCH02L",  title: "Analytical Methods for Biology Laboratory", units: 1, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSBio:2" },
    { code: "BIO02",   title: "Genetics",                        units: 3, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSBio:2" },
    { code: "BIO02L",  title: "Genetics Laboratory",             units: 2, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSBio:2" },
    { code: "BPH00",   title: "Biophysics",                      units: 3, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSBio:2" },
    { code: "BPH00L",  title: "Biophysics Laboratory",           units: 1, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSBio:2" },
    { code: "BIO03",   title: "Comparative Anatomy",             units: 3, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSBio:2" },
    { code: "BIO03L",  title: "Comparative Anatomy Laboratory",  units: 2, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSBio:2" },
    // Y2 S2
    { code: "BCH03",   title: "Biomolecules",                    units: 3, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSBio:2" },
    { code: "BCH03L",  title: "Biomolecules Laboratory",         units: 2, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSBio:2" },
    { code: "MCB01",   title: "General Microbiology",            units: 3, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSBio:2" },
    { code: "MCB01L",  title: "General Microbiology Laboratory", units: 2, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSBio:2" },
    // Y3 S1
    { code: "BST01",   title: "Statistical Biology",             units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSBio:3" },
    { code: "BST01L",  title: "Statistical Biology Laboratory",  units: 1, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSBio:3" },
    { code: "MCB02",   title: "Food Safety",                     units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSBio:3" },
    { code: "MCB02L",  title: "Food Safety Laboratory",          units: 1, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSBio:3" },
    { code: "BIO04",   title: "General Physiology",              units: 3, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSBio:3" },
    { code: "BIO04L",  title: "General Physiology Laboratory",   units: 2, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSBio:3" },
    { code: "BIO05",   title: "Systematics",                     units: 3, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSBio:3" },
    { code: "BIO05L",  title: "Systematics Laboratory",          units: 2, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSBio:3" },
    { code: "BIO101",  title: "Thesis I",                        units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSBio:3" },
    // Y3 S2
    { code: "BIO06",   title: "Developmental Biology",           units: 3, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSBio:3" },
    { code: "BIO06L",  title: "Developmental Biology Laboratory",units: 2, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSBio:3" },
    { code: "BIO07",   title: "Cell and Molecular Biology",      units: 3, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSBio:3" },
    { code: "BIO07L",  title: "Cell and Molecular Biology Laboratory", units: 2, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSBio:3" },
    { code: "BIO08",   title: "Marine Biology",                  units: 3, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSBio:3" },
    { code: "BIO08L",  title: "Marine Biology Laboratory",       units: 2, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSBio:3" },
    { code: "BIO-ELE01", title: "Elective 1 (Bioinformatics)",   units: 3, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSBio:3" },
    { code: "BIO102",  title: "Thesis II",                       units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSBio:3" },
    // Y4 S1
    { code: "BIO10",   title: "Introduction to Philippine Wildlife",  units: 3, type: "LECTURE",    semester: "FIRST",  year: 4, ylKey: "BSBio:4" },
    { code: "BIO10L",  title: "Philippine Wildlife Laboratory",        units: 2, type: "LABORATORY", semester: "FIRST",  year: 4, ylKey: "BSBio:4" },
    { code: "BIO11",   title: "Ethnobotany",                          units: 3, type: "LECTURE",    semester: "FIRST",  year: 4, ylKey: "BSBio:4" },
    { code: "BIO11L",  title: "Ethnobotany Laboratory",               units: 2, type: "LABORATORY", semester: "FIRST",  year: 4, ylKey: "BSBio:4" },
    { code: "BIO-ELE02", title: "Elective 2 (Teaching Methods)",      units: 3, type: "LECTURE",    semester: "FIRST",  year: 4, ylKey: "BSBio:4" },
    { code: "BIO103",  title: "Thesis III",                           units: 2, type: "LECTURE",    semester: "FIRST",  year: 4, ylKey: "BSBio:4" },
    // Y4 S2
    { code: "BIO13",   title: "Microbial Ecology",               units: 3, type: "LECTURE",    semester: "SECOND", year: 4, ylKey: "BSBio:4" },
    { code: "BIO13L",  title: "Microbial Ecology Laboratory",    units: 2, type: "LABORATORY", semester: "SECOND", year: 4, ylKey: "BSBio:4" },
    { code: "BIO14",   title: "Evolutionary Biology",            units: 3, type: "LECTURE",    semester: "SECOND", year: 4, ylKey: "BSBio:4" },
    { code: "BIO14L",  title: "Evolutionary Biology Laboratory", units: 2, type: "LABORATORY", semester: "SECOND", year: 4, ylKey: "BSBio:4" },
    { code: "BIO110",  title: "Practicum",                       units: 3, type: "LECTURE",    semester: "SECOND", year: 4, ylKey: "BSBio:4" },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // CAS — BAComm (BA Communication)
  // ─────────────────────────────────────────────────────────────────────────
  const commSubjects: SWithYL[] = [
    // Y2 S1
    { code: "COM01", title: "Introduction to Communication Media",          units: 3, type: "LECTURE", semester: "FIRST",  year: 2, ylKey: "BAComm:2" },
    { code: "COM02", title: "Communication Theory",                         units: 3, type: "LECTURE", semester: "FIRST",  year: 2, ylKey: "BAComm:2" },
    { code: "COM04", title: "Communication, Culture and Society",           units: 3, type: "LECTURE", semester: "FIRST",  year: 2, ylKey: "BAComm:2" },
    { code: "COM05", title: "Communication Media Laws and Ethics",          units: 3, type: "LECTURE", semester: "FIRST",  year: 2, ylKey: "BAComm:2" },
    // Y2 S2
    { code: "COM09", title: "Risk, Disaster & Humanitarian Communication",  units: 3, type: "LECTURE", semester: "SECOND", year: 2, ylKey: "BAComm:2" },
    { code: "COM11", title: "Journalism Principles and Practices",          units: 3, type: "LECTURE", semester: "SECOND", year: 2, ylKey: "BAComm:2" },
    { code: "COM12", title: "Broadcasting Principles and Practices",        units: 3, type: "LECTURE", semester: "SECOND", year: 2, ylKey: "BAComm:2" },
    { code: "COM13", title: "Social Media Principles and Practices",        units: 3, type: "LECTURE", semester: "SECOND", year: 2, ylKey: "BAComm:2" },
    { code: "COM16", title: "Creative Writing",                             units: 3, type: "LECTURE", semester: "SECOND", year: 2, ylKey: "BAComm:2" },
    { code: "CSH01", title: "Sociology of Language Communication",          units: 3, type: "LECTURE", semester: "SECOND", year: 2, ylKey: "BAComm:2" },
    // Y3 S1
    { code: "COM03", title: "Communication Research",                       units: 3, type: "LECTURE", semester: "FIRST",  year: 3, ylKey: "BAComm:3" },
    { code: "COM08", title: "Development Communication",                    units: 3, type: "LECTURE", semester: "FIRST",  year: 3, ylKey: "BAComm:3" },
    { code: "COM10", title: "Knowledge Management",                         units: 3, type: "LECTURE", semester: "FIRST",  year: 3, ylKey: "BAComm:3" },
    { code: "COM17", title: "Introduction to Theater Arts",                 units: 3, type: "LECTURE", semester: "FIRST",  year: 3, ylKey: "BAComm:3" },
    { code: "COM18", title: "Organizational Culture and Communication",     units: 3, type: "LECTURE", semester: "FIRST",  year: 3, ylKey: "BAComm:3" },
    // Y3 S2
    { code: "COMM-RES01", title: "Methods of Research",                    units: 3, type: "LECTURE", semester: "SECOND", year: 3, ylKey: "BAComm:3" },
    { code: "COM14", title: "Advertising Principles and Practices",         units: 3, type: "LECTURE", semester: "SECOND", year: 3, ylKey: "BAComm:3" },
    { code: "COM15", title: "Introduction to Film",                         units: 3, type: "LECTURE", semester: "SECOND", year: 3, ylKey: "BAComm:3" },
    { code: "COM19", title: "Behavioral and Social Change Communication",   units: 3, type: "LECTURE", semester: "SECOND", year: 3, ylKey: "BAComm:3" },
    { code: "CSH02", title: "Language, Gender and Media",                   units: 3, type: "LECTURE", semester: "SECOND", year: 3, ylKey: "BAComm:3" },
    // Y4 S1
    { code: "COMM-RES02", title: "Thesis Writing",                         units: 3, type: "LECTURE", semester: "FIRST",  year: 4, ylKey: "BAComm:4" },
    { code: "COM06", title: "Communication Planning",                       units: 3, type: "LECTURE", semester: "FIRST",  year: 4, ylKey: "BAComm:4" },
    { code: "CSH03", title: "Discourse and Communication",                  units: 3, type: "LECTURE", semester: "FIRST",  year: 4, ylKey: "BAComm:4" },
    { code: "CSH04", title: "Foreign Language",                             units: 3, type: "LECTURE", semester: "FIRST",  year: 4, ylKey: "BAComm:4" },
    { code: "CSH05", title: "Principles of Teaching with Media and Technology", units: 3, type: "LECTURE", semester: "FIRST", year: 4, ylKey: "BAComm:4" },
    // Y4 S2
    { code: "COM07", title: "Communication Management",                     units: 3, type: "LECTURE", semester: "SECOND", year: 4, ylKey: "BAComm:4" },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // CAS — BAHist (BA History)
  // ─────────────────────────────────────────────────────────────────────────
  const histSubjects: SWithYL[] = [
    // Y2 S1
    { code: "HST01",  title: "Introduction to the Study & Writing of History", units: 3, type: "LECTURE", semester: "FIRST",  year: 2, ylKey: "BAHist:2" },
    { code: "HSTE1",  title: "Geography",                                       units: 3, type: "LECTURE", semester: "FIRST",  year: 2, ylKey: "BAHist:2" },
    { code: "FLS01",  title: "Elementary Spanish",                              units: 3, type: "LECTURE", semester: "FIRST",  year: 2, ylKey: "BAHist:2" },
    // Y2 S2
    { code: "HST02",  title: "Pre-16th Century Philippines",                   units: 3, type: "LECTURE", semester: "SECOND", year: 2, ylKey: "BAHist:2" },
    { code: "HST03",  title: "Philippine Cultural History",                     units: 3, type: "LECTURE", semester: "SECOND", year: 2, ylKey: "BAHist:2" },
    { code: "HST04",  title: "Survey of Asian Civilizations",                   units: 3, type: "LECTURE", semester: "SECOND", year: 2, ylKey: "BAHist:2" },
    { code: "FLS02",  title: "Advanced Spanish",                                units: 3, type: "LECTURE", semester: "SECOND", year: 2, ylKey: "BAHist:2" },
    // Y3 S1
    { code: "HST05",  title: "Survey of Western Civilizations",                 units: 3, type: "LECTURE", semester: "FIRST",  year: 3, ylKey: "BAHist:3" },
    { code: "HST06",  title: "Philosophy of History",                           units: 3, type: "LECTURE", semester: "FIRST",  year: 3, ylKey: "BAHist:3" },
    { code: "HST07",  title: "Nationalism and Revolution",                      units: 3, type: "LECTURE", semester: "FIRST",  year: 3, ylKey: "BAHist:3" },
    { code: "FLS03",  title: "Reading and Translation in Spanish",              units: 3, type: "LECTURE", semester: "FIRST",  year: 3, ylKey: "BAHist:3" },
    // Y3 S2
    { code: "HST08",  title: "Historical Methodology",                          units: 3, type: "LECTURE", semester: "SECOND", year: 3, ylKey: "BAHist:3" },
    { code: "HST09",  title: "Mainland Southeast Asia",                         units: 3, type: "LECTURE", semester: "SECOND", year: 3, ylKey: "BAHist:3" },
    { code: "HST10",  title: "Modern East Asia",                                units: 3, type: "LECTURE", semester: "SECOND", year: 3, ylKey: "BAHist:3" },
    { code: "HSTE2",  title: "Heritage Studies",                                units: 3, type: "LECTURE", semester: "SECOND", year: 3, ylKey: "BAHist:3" },
    { code: "FLS04",  title: "Obras Literarias de los Heroes",                  units: 3, type: "LECTURE", semester: "SECOND", year: 3, ylKey: "BAHist:3" },
    // Y4 S1
    { code: "HST11",  title: "Senior Thesis",                                   units: 3, type: "LECTURE", semester: "FIRST",  year: 4, ylKey: "BAHist:4" },
    { code: "HST12",  title: "History of USA",                                  units: 3, type: "LECTURE", semester: "FIRST",  year: 4, ylKey: "BAHist:4" },
    { code: "HSTE3",  title: "Indigenous Studies",                              units: 3, type: "LECTURE", semester: "FIRST",  year: 4, ylKey: "BAHist:4" },
    // Y4 S2
    { code: "HSTE4",  title: "Museology",                                       units: 3, type: "LECTURE", semester: "SECOND", year: 4, ylKey: "BAHist:4" },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // CAS — BSMath (BS Mathematics)
  // ─────────────────────────────────────────────────────────────────────────
  const mathSubjects: SWithYL[] = [
    // Y1 S1
    { code: "MAT04a",  title: "Calculus I",                                   units: 4, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSMath:1" },
    { code: "MAT09",   title: "Fundamental Concepts of Computing I",          units: 2, type: "LECTURE",    semester: "FIRST",  year: 1, ylKey: "BSMath:1" },
    { code: "MAT09L",  title: "Fundamental Concepts of Computing I Laboratory", units: 1, type: "LABORATORY", semester: "FIRST",  year: 1, ylKey: "BSMath:1" },
    // Y1 S2
    { code: "MAT05a",  title: "Calculus II",                                  units: 4, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSMath:1" },
    { code: "MAT11",   title: "Fundamental Concepts of Mathematics",          units: 3, type: "LECTURE",    semester: "SECOND", year: 1, ylKey: "BSMath:1" },
    // Y2 S1
    { code: "MAT15",   title: "Abstract Algebra I",                           units: 3, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSMath:2" },
    { code: "MAT10",   title: "Fundamental Concepts of Computing II",         units: 2, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSMath:2" },
    { code: "MAT10L",  title: "Fundamental Concepts of Computing II Laboratory", units: 1, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSMath:2" },
    { code: "MAT06a",  title: "Calculus III",                                 units: 4, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSMath:2" },
    { code: "PHY01",   title: "General Physics I",                            units: 3, type: "LECTURE",    semester: "FIRST",  year: 2, ylKey: "BSMath:2" },
    { code: "PHY01L",  title: "General Physics I Laboratory",                 units: 1, type: "LABORATORY", semester: "FIRST",  year: 2, ylKey: "BSMath:2" },
    // Y2 S2
    { code: "MAT16",   title: "Linear Algebra",                               units: 3, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSMath:2" },
    { code: "PHY02",   title: "General Physics II",                           units: 2, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSMath:2" },
    { code: "PHY02L",  title: "General Physics II Laboratory",                units: 1, type: "LABORATORY", semester: "SECOND", year: 2, ylKey: "BSMath:2" },
    { code: "MAT19",   title: "Probability",                                  units: 3, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSMath:2" },
    { code: "MAT18",   title: "Advanced Calculus I",                          units: 3, type: "LECTURE",    semester: "SECOND", year: 2, ylKey: "BSMath:2" },
    // Y3 S1
    { code: "MAT33",   title: "Real Analysis",                                units: 3, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSMath:3" },
    { code: "MAT14",   title: "Theory of Interest",                           units: 3, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSMath:3" },
    { code: "MAT20",   title: "Statistical Theory",                           units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSMath:3" },
    { code: "MAT20L",  title: "Statistical Theory Laboratory",                units: 1, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSMath:3" },
    { code: "MAT07",   title: "Differential Equations I",                     units: 2, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSMath:3" },
    { code: "MAT07L",  title: "Differential Equations I Laboratory",          units: 1, type: "LABORATORY", semester: "FIRST",  year: 3, ylKey: "BSMath:3" },
    { code: "MATH-ELE1", title: "Qualified Elective/Cognate 1",              units: 3, type: "LECTURE",    semester: "FIRST",  year: 3, ylKey: "BSMath:3" },
    // Y3 S2
    { code: "MAT34",   title: "Topology",                                     units: 3, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSMath:3" },
    { code: "MAT32",   title: "Modern Geometry",                              units: 3, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSMath:3" },
    { code: "MAT24",   title: "Mathematical Modelling",                       units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSMath:3" },
    { code: "MAT24L",  title: "Mathematical Modelling Laboratory",            units: 1, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSMath:3" },
    { code: "MAT23",   title: "Operations Research I",                        units: 2, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSMath:3" },
    { code: "MAT23L",  title: "Operations Research I Laboratory",             units: 1, type: "LABORATORY", semester: "SECOND", year: 3, ylKey: "BSMath:3" },
    { code: "MATH-RES01", title: "Methods of Research",                      units: 3, type: "LECTURE",    semester: "SECOND", year: 3, ylKey: "BSMath:3" },
    // Y4 S1
    { code: "MAT35",   title: "Complex Analysis",                             units: 3, type: "LECTURE",    semester: "FIRST",  year: 4, ylKey: "BSMath:4" },
    { code: "MAT30",   title: "Numerical Analysis",                           units: 2, type: "LECTURE",    semester: "FIRST",  year: 4, ylKey: "BSMath:4" },
    { code: "MAT30L",  title: "Numerical Analysis Laboratory",                units: 1, type: "LABORATORY", semester: "FIRST",  year: 4, ylKey: "BSMath:4" },
    { code: "MATH-RES02", title: "Thesis",                                   units: 3, type: "LECTURE",    semester: "FIRST",  year: 4, ylKey: "BSMath:4" },
    { code: "MATH-FE1", title: "Free Elective 1",                            units: 3, type: "LECTURE",    semester: "FIRST",  year: 4, ylKey: "BSMath:4" },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // CAS — BAPsych (BA Psychology)
  // ─────────────────────────────────────────────────────────────────────────
  const psychSubjects: SWithYL[] = [
    // Y1 S2
    { code: "PSY01",  title: "Introduction to Psychology",           units: 3, type: "LECTURE", semester: "SECOND", year: 1, ylKey: "BAPsych:1" },
    // Y2 S1
    { code: "PSY02",  title: "Psychological Statistics",             units: 5, type: "LECTURE", semester: "FIRST",  year: 2, ylKey: "BAPsych:2" },
    { code: "PSY03",  title: "Bio-Psychological",                    units: 3, type: "LECTURE", semester: "FIRST",  year: 2, ylKey: "BAPsych:2" },
    { code: "PSY04",  title: "Developmental Psychology",             units: 3, type: "LECTURE", semester: "FIRST",  year: 2, ylKey: "BAPsych:2" },
    // Y2 S2
    { code: "PSY05",  title: "Theories of Personality",              units: 3, type: "LECTURE", semester: "SECOND", year: 2, ylKey: "BAPsych:2" },
    { code: "PSY06",  title: "Experimental Psychology",              units: 5, type: "LECTURE", semester: "SECOND", year: 2, ylKey: "BAPsych:2" },
    { code: "PSY07",  title: "Cognitive Psychology",                 units: 3, type: "LECTURE", semester: "SECOND", year: 2, ylKey: "BAPsych:2" },
    // Y3 S1
    { code: "PSY08",  title: "Field Methods in Psychology",          units: 5, type: "LECTURE", semester: "FIRST",  year: 3, ylKey: "BAPsych:3" },
    { code: "PSY09",  title: "Abnormal Psychology",                  units: 3, type: "LECTURE", semester: "FIRST",  year: 3, ylKey: "BAPsych:3" },
    { code: "PSY10",  title: "Social Psychology",                    units: 3, type: "LECTURE", semester: "FIRST",  year: 3, ylKey: "BAPsych:3" },
    { code: "PSY11",  title: "Industrial Psychology",                units: 3, type: "LECTURE", semester: "FIRST",  year: 3, ylKey: "BAPsych:3" },
    // Y3 S2
    { code: "PSY12",  title: "Psychological Assessment",             units: 5, type: "LECTURE", semester: "SECOND", year: 3, ylKey: "BAPsych:3" },
    { code: "PSY13",  title: "Culture and Psychology",               units: 3, type: "LECTURE", semester: "SECOND", year: 3, ylKey: "BAPsych:3" },
    { code: "PSY14",  title: "Research 1",                           units: 3, type: "LECTURE", semester: "SECOND", year: 3, ylKey: "BAPsych:3" },
    // Y4 S1
    { code: "PSY-ELE01", title: "Introduction to Clinical Psychology", units: 3, type: "LECTURE", semester: "FIRST",  year: 4, ylKey: "BAPsych:4" },
    { code: "PSY15",     title: "Research 2",                          units: 3, type: "LECTURE", semester: "FIRST",  year: 4, ylKey: "BAPsych:4" },
    { code: "PSY-ELE02", title: "Strategic Human Resource Management", units: 3, type: "LECTURE", semester: "FIRST",  year: 4, ylKey: "BAPsych:4" },
    // Y4 S2
    { code: "PSY-ELE03", title: "Practicum in Psychology",            units: 3, type: "LECTURE", semester: "SECOND", year: 4, ylKey: "BAPsych:4" },
    { code: "PSY-ELE04", title: "Integrative Course in Psychology",   units: 3, type: "LECTURE", semester: "SECOND", year: 4, ylKey: "BAPsych:4" },
  ]

  // Insert all CAS program-specific subjects
  const casProgSubjects = [
    ...bioSubjects, ...commSubjects, ...histSubjects, ...mathSubjects, ...psychSubjects,
  ]
  let casProgCount = 0
  for (const s of casProgSubjects) {
    const [progAbbr, levelStr] = s.ylKey.split(":")
    const yearLevelId = yl(progAbbr, Number(levelStr))
    await upsertSubject({ ...s, departmentId: casDept.id, yearLevelId })
    casProgCount++
  }
  console.log(`  CAS program-specific subjects: ${casProgCount}`)

  const totalCount = count + citProgCount + casSharedCount + casProgCount
  console.log(`\n✅ Done! Total subjects seeded: ${totalCount}`)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  db.$disconnect()
  process.exit(1)
})
