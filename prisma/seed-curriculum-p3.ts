import 'dotenv/config'
import { PrismaClient } from '../prisma/generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

const CAS_DEPT_ID = "cmmzovtv10009qkvur7tude03"

interface SubjectInput {
  code: string
  title: string
  units: number
  type: "LECTURE" | "LABORATORY"
  semester: "FIRST" | "SECOND"
  year: number
  departmentId: string
}

async function main() {
  console.log("=== Seeding CURRICULUM-P3 subjects ===\n")

  const subjects: SubjectInput[] = [
    // ============================================================
    // BS BIOLOGY (CAS) — Major subjects only (GEC/PATHFIT/NST already exist)
    // ============================================================
    // Year 1 - 1st Sem
    // BOT01, BOT01L, ZOO01, ZOO01L already exist
    { code: "NSTP1", title: "National Service Training Program 1", units: 3, type: "LECTURE", semester: "FIRST", year: 1, departmentId: CAS_DEPT_ID },

    // Year 1 - 2nd Sem
    { code: "BCH01", title: "Organic Molecules", units: 3, type: "LECTURE", semester: "SECOND", year: 1, departmentId: CAS_DEPT_ID },
    { code: "BIO01", title: "General Ecology", units: 3, type: "LECTURE", semester: "SECOND", year: 1, departmentId: CAS_DEPT_ID },
    { code: "BIO01L", title: "General Ecology Laboratory", units: 2, type: "LABORATORY", semester: "SECOND", year: 1, departmentId: CAS_DEPT_ID },
    { code: "NSTP2", title: "National Service Training Program 2", units: 3, type: "LECTURE", semester: "SECOND", year: 1, departmentId: CAS_DEPT_ID },

    // Year 2 - 1st Sem
    // BCH02, BIO02, BIO02L, BPH00, BPH00L, BIO03, BIO03L already exist
    { code: "BCH02L", title: "Analytical Methods for Biology Laboratory", units: 1, type: "LABORATORY", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },

    // Year 2 - 2nd Sem
    { code: "BCH03", title: "Biomolecules", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "BCH03L", title: "Biomolecules Laboratory", units: 2, type: "LABORATORY", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "MCB01", title: "General Microbiology", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "MCB01L", title: "General Microbiology Laboratory", units: 2, type: "LABORATORY", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },

    // Year 3 - 1st Sem
    // BST01, MCB02 already exist
    { code: "BST01L", title: "Statistical Biology Laboratory", units: 1, type: "LABORATORY", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "MCB02L", title: "Food Safety Laboratory", units: 1, type: "LABORATORY", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "BIO04L", title: "General Physiology Laboratory", units: 2, type: "LABORATORY", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "BIO05L", title: "Systematics Laboratory", units: 2, type: "LABORATORY", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },

    // Year 3 - 2nd Sem
    { code: "BIO06", title: "Developmental Biology", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "BIO06L", title: "Developmental Biology Laboratory", units: 2, type: "LABORATORY", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "BIO07", title: "Cell and Molecular Biology", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "BIO07L", title: "Cell and Molecular Biology Laboratory", units: 2, type: "LABORATORY", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "BIO08", title: "Marine Biology", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "BIO08L", title: "Marine Biology Laboratory", units: 2, type: "LABORATORY", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "ELE01", title: "Elective 1 (Bioinformatics)", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "BIO102", title: "Thesis II", units: 2, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },

    // Year 4 - 1st Sem
    // BIO10, BIO11, ELEC02, BIO103 already exist
    { code: "BIO10L", title: "Philippine Wildlife Laboratory", units: 2, type: "LABORATORY", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },
    { code: "BIO11L", title: "Ethnobotany Laboratory", units: 2, type: "LABORATORY", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },

    // Year 4 - 2nd Sem
    { code: "BIO13", title: "Microbial Ecology", units: 3, type: "LECTURE", semester: "SECOND", year: 4, departmentId: CAS_DEPT_ID },
    { code: "BIO13L", title: "Microbial Ecology Laboratory", units: 2, type: "LABORATORY", semester: "SECOND", year: 4, departmentId: CAS_DEPT_ID },
    { code: "BIO14", title: "Evolutionary Biology", units: 3, type: "LECTURE", semester: "SECOND", year: 4, departmentId: CAS_DEPT_ID },
    { code: "BIO14L", title: "Evolutionary Biology Laboratory", units: 2, type: "LABORATORY", semester: "SECOND", year: 4, departmentId: CAS_DEPT_ID },
    { code: "BIO110", title: "Practicum", units: 3, type: "LECTURE", semester: "SECOND", year: 4, departmentId: CAS_DEPT_ID },

    // ============================================================
    // BA COMMUNICATION (CAS) — Major subjects
    // ============================================================
    // Year 2 - 1st Sem
    { code: "COM01", title: "Introduction to Communication Media", units: 3, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },
    { code: "COM02", title: "Communication Theory", units: 3, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },
    { code: "COM04", title: "Communication, Culture and Society", units: 3, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },
    { code: "COM05", title: "Communication Media Laws and Ethics", units: 3, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },
    { code: "GEC14", title: "Literature of the World", units: 3, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },

    // Year 2 - 2nd Sem
    { code: "COM09", title: "Risk, Disaster & Humanitarian Communication", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "COM11", title: "Journalism Principles and Practices", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "COM12", title: "Broadcasting Principles and Practices", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "COM13", title: "Social Media Principles and Practices", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "COM16", title: "Creative Writing", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "CSH01", title: "Sociology of Language Communication", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },

    // Year 3 - 1st Sem
    { code: "COM03", title: "Communication Research", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "COM08", title: "Development Communication", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "COM10", title: "Knowledge Management", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "COM17", title: "Introduction to Theater Arts", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "COM18", title: "Organizational Culture and Communication", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "GEC12", title: "Dalumat ng/sa Filipino", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },

    // Year 3 - 2nd Sem
    { code: "RES01", title: "Methods of Research", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "COM14", title: "Advertising Principles and Practices", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "COM15", title: "Introduction to Film", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "COM19", title: "Behavioral and Social Change Communication", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "CSH02", title: "Language, Gender and Media", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },

    // Year 4 - 1st Sem
    { code: "RES02", title: "Thesis Writing", units: 3, type: "LECTURE", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },
    { code: "COM06", title: "Communication Planning", units: 3, type: "LECTURE", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },
    { code: "CSH03", title: "Discourse and Communication", units: 3, type: "LECTURE", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },
    { code: "CSH04", title: "Foreign Language", units: 3, type: "LECTURE", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },
    { code: "CSH05", title: "Principles of Teaching with Media and Technology", units: 3, type: "LECTURE", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },

    // Year 4 - 2nd Sem
    { code: "COM07", title: "Communication Management", units: 3, type: "LECTURE", semester: "SECOND", year: 4, departmentId: CAS_DEPT_ID },

    // ============================================================
    // BA HISTORY (CAS) — Major subjects
    // ============================================================
    // Year 2 - 1st Sem
    { code: "HST01", title: "Intro to the Study & Writing History", units: 3, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },
    { code: "HSTE1", title: "Geography", units: 3, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },
    { code: "FLS01", title: "Elementary Spanish", units: 3, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },

    // Year 2 - 2nd Sem
    { code: "HST02", title: "Pre-16th Century Philippines", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "HST03", title: "Philippine Cultural History", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "HST04", title: "Survey of Asian Civilizations", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "FLS02", title: "Advanced Spanish", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },

    // Year 3 - 1st Sem
    { code: "HST05", title: "Survey of Western Civilizations", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "HST06", title: "Philosophy of History", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "HST07", title: "Nationalism and Revolution", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "FLS03", title: "Reading and Translation in Spanish", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },

    // Year 3 - 2nd Sem
    { code: "HST08", title: "Historical Methodology", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "HST09", title: "Mainland Southeast Asia", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "HST10", title: "Modern East Asia", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "HSTE2", title: "Heritage Studies", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "FLS04", title: "Obras Literarias delos Heroes", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },

    // Year 4 - 1st Sem
    { code: "HST11", title: "Senior Thesis", units: 3, type: "LECTURE", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },
    { code: "HST12", title: "History of USA", units: 3, type: "LECTURE", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },
    { code: "HSTE3", title: "Indigenous Studies", units: 3, type: "LECTURE", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },

    // Year 4 - 2nd Sem
    { code: "HSTE4", title: "Museology", units: 3, type: "LECTURE", semester: "SECOND", year: 4, departmentId: CAS_DEPT_ID },

    // ============================================================
    // BS MATHEMATICS (CAS) — Major subjects
    // ============================================================
    // Year 1 - 1st Sem
    { code: "MAT04a", title: "Calculus I", units: 4, type: "LECTURE", semester: "FIRST", year: 1, departmentId: CAS_DEPT_ID },
    { code: "MAT09", title: "Fundamental Concept of Computing I", units: 2, type: "LECTURE", semester: "FIRST", year: 1, departmentId: CAS_DEPT_ID },
    { code: "MAT09L", title: "Fundamental Concept of Computing I Laboratory", units: 1, type: "LABORATORY", semester: "FIRST", year: 1, departmentId: CAS_DEPT_ID },

    // Year 1 - 2nd Sem
    { code: "MAT05a", title: "Calculus II", units: 4, type: "LECTURE", semester: "SECOND", year: 1, departmentId: CAS_DEPT_ID },
    { code: "MAT11", title: "Fundamental Concepts of Mathematics", units: 3, type: "LECTURE", semester: "SECOND", year: 1, departmentId: CAS_DEPT_ID },

    // Year 2 - 1st Sem
    { code: "MAT15", title: "Abstract Algebra I", units: 3, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },
    { code: "MAT10", title: "Fundamental Concepts of Computing II", units: 2, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },
    { code: "MAT10L", title: "Fundamental Concepts of Computing II Laboratory", units: 1, type: "LABORATORY", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },
    { code: "MAT06a", title: "Calculus III", units: 4, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },
    { code: "PHY01", title: "General Physics I", units: 3, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },
    { code: "PHY01L", title: "General Physics I Laboratory", units: 1, type: "LABORATORY", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },

    // Year 2 - 2nd Sem
    { code: "MAT16", title: "Linear Algebra", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "PHY02", title: "General Physics II", units: 2, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "PHY02L", title: "General Physics II Laboratory", units: 1, type: "LABORATORY", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "MAT19", title: "Probability", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "MAT18", title: "Advanced Calculus I", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },

    // Year 3 - 1st Sem
    { code: "MAT33", title: "Real Analysis", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "MAT14", title: "Theory of Interest", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "MAT20", title: "Statistical Theory", units: 2, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "MAT20L", title: "Statistical Theory Laboratory", units: 1, type: "LABORATORY", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "MAT07", title: "Differential Equations I", units: 2, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "MAT07L", title: "Differential Equations I Laboratory", units: 1, type: "LABORATORY", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },

    // Year 3 - 2nd Sem
    { code: "MAT34", title: "Topology", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "MAT32", title: "Modern Geometry", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "MAT24", title: "Mathematical Modelling", units: 2, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "MAT24L", title: "Mathematical Modelling Laboratory", units: 1, type: "LABORATORY", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "MAT23", title: "Operations Research I", units: 2, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "MAT23L", title: "Operations Research I Laboratory", units: 1, type: "LABORATORY", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },

    // Year 4 - 1st Sem
    { code: "MAT35", title: "Complex Analysis", units: 3, type: "LECTURE", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },
    { code: "MAT30", title: "Numerical Analysis", units: 2, type: "LECTURE", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },
    { code: "MAT30L", title: "Numerical Analysis Laboratory", units: 1, type: "LABORATORY", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },

    // ============================================================
    // BA PSYCHOLOGY (CAS) — Major subjects
    // ============================================================
    // Year 2 - 1st Sem
    { code: "PSY01", title: "Introduction to Psychology", units: 3, type: "LECTURE", semester: "SECOND", year: 1, departmentId: CAS_DEPT_ID },
    { code: "PSY02", title: "Psychological Statistics", units: 5, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },
    { code: "PSY03", title: "Bio Psychological", units: 3, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },
    { code: "PSY04", title: "Developmental Psychology", units: 3, type: "LECTURE", semester: "FIRST", year: 2, departmentId: CAS_DEPT_ID },

    // Year 2 - 2nd Sem
    { code: "PSY05", title: "Theories of Personality", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "PSY06", title: "Experimental Psychology", units: 5, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },
    { code: "PSY07", title: "Cognitive Psychology", units: 3, type: "LECTURE", semester: "SECOND", year: 2, departmentId: CAS_DEPT_ID },

    // Year 3 - 1st Sem
    { code: "PSY10", title: "Social Psychology", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "PSY09", title: "Abnormal Psychology", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "PSY08", title: "Field Methods in Psychology", units: 5, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },
    { code: "PSY11", title: "Industrial Psychology", units: 3, type: "LECTURE", semester: "FIRST", year: 3, departmentId: CAS_DEPT_ID },

    // Year 3 - 2nd Sem
    { code: "PSY12", title: "Psychological Assessment", units: 5, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "PSY13", title: "Culture and Psychology", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },
    { code: "PSY14", title: "Research 1", units: 3, type: "LECTURE", semester: "SECOND", year: 3, departmentId: CAS_DEPT_ID },

    // Year 4 - 1st Sem
    { code: "PSY-ELE01", title: "Introduction to Clinical Psychology", units: 3, type: "LECTURE", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },
    { code: "PSY15", title: "Research 2", units: 3, type: "LECTURE", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },
    { code: "PSY-ELE02", title: "Strategic Human Resource Management", units: 3, type: "LECTURE", semester: "FIRST", year: 4, departmentId: CAS_DEPT_ID },

    // Year 4 - 2nd Sem
    { code: "PSY-ELE03", title: "Practicum in Psychology", units: 3, type: "LECTURE", semester: "SECOND", year: 4, departmentId: CAS_DEPT_ID },
    { code: "PSY-ELE04", title: "Integrative Course in Psychology", units: 3, type: "LECTURE", semester: "SECOND", year: 4, departmentId: CAS_DEPT_ID },
  ]

  let created = 0
  let updated = 0
  let skipped = 0

  for (const s of subjects) {
    try {
      await db.subject.upsert({
        where: { code: s.code },
        update: {
          title: s.title,
          units: s.units,
          hoursPerWeek: s.units,
          type: s.type,
          semester: s.semester,
          year: s.year,
          departmentId: s.departmentId,
        },
        create: {
          code: s.code,
          title: s.title,
          units: s.units,
          hoursPerWeek: s.units,
          type: s.type,
          semester: s.semester,
          year: s.year,
          departmentId: s.departmentId,
          requiredRoomType: s.type === "LABORATORY" ? ["LABORATORY"] : ["LECTURE_ROOM"],
        },
      })
      // Check if it was created or updated
      created++
      console.log(`  ✓ ${s.code} — ${s.title} (Y${s.year} ${s.semester === "FIRST" ? "1st" : "2nd"} Sem)`)
    } catch (err: any) {
      if (err.message?.includes("Unique constraint")) {
        skipped++
        console.log(`  ⊘ ${s.code} — already exists, skipped`)
      } else {
        console.error(`  ✗ ${s.code} — ${err.message}`)
      }
    }
  }

  console.log(`\n=== Done: ${created} upserted, ${skipped} skipped ===`)

  // Show final count
  const total = await db.subject.count()
  console.log(`Total subjects in database: ${total}`)
}

main()
  .then(() => db.$disconnect())
  .catch((err) => {
    console.error(err)
    db.$disconnect()
    process.exit(1)
  })
