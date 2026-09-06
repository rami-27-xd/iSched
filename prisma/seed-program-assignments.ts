// Assigns subjects and faculty to their specific programs.
// ITE/IIT/COM subjects  -> BSIT
// AFT subjects          -> BSIT-Garments
// AIT subjects          -> BSIT-Automotive
// CPT/CU subjects       -> BSIT-Computer
// MET/PMT subjects      -> BSIT-Mechanical
// IND/IEN/MGT/PSY       -> BSIT-Industrial Design
// E/CHM/PHY subjects    -> BSIT-Electrical
// GEC/NST/PATHFit/GE/RES/MAT/F -> null (shared across all programs)
// Test faculty (stub emails)    -> BSIT
import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:27O5!@localhost:5432/ischeddb' }) })

const PREFIX_TO_ABBR: Record<string, string> = {
  ITE: 'BSIT',
  IIT: 'BSIT',
  COM: 'BSIT',
  AFT: 'BSIT-GAR',
  AIT: 'BSIT-AUTO',
  CPT: 'BSIT-COMP',
  CU:  'BSIT-COMP',
  MET: 'BSIT-MET',
  PMT: 'BSIT-MET',
  IND: 'BSIT-IND',
  IEN: 'BSIT-IND',
  MGT: 'BSIT-IND',
  PSY: 'BSIT-IND',
  MTM: 'BSIT-MET',
  E:   'BSIT-ELEC',
  CHM: 'BSIT-ELEC',
  PHY: 'BSIT-ELEC',
  MAT: 'BSIT-COMP',
  // GEC, NST, PATHFit, GE, RES, F -> null (shared)
}

const ABBR_TO_PROGRAM_NAME: Record<string, string> = {
  'BSIT':      'BS Information Technology',
  'BSIT-AUTO': 'BS Industrial Technology - Automotive',
  'BSIT-COMP': 'BS Industrial Technology - Computer',
  'BSIT-ELEC': 'BS Industrial Technology - Electrical',
  'BSIT-GAR':  'BS Industrial Technology - Garments',
  'BSIT-IND':  'BS Industrial Technology - Industrial Design',
  'BSIT-MET':  'BS Industrial Technology - Mechanical',
}

async function main() {
  const programs = await db.program.findMany({ where: { department: { abbreviation: 'CIT' } } })
  console.log('CIT programs found:', programs.map((p: any) => p.name))

  // Build name -> id map (flexible match: strip dash/unicode variants)
  const programIdByKey: Record<string, string> = {}
  programs.forEach((p: any) => {
    // Normalize: lowercase, replace em-dash/en-dash with hyphen
    const key = p.name.toLowerCase().replace(/[–—]/g, '-')
    programIdByKey[key] = p.id
  })

  const abbrToId: Record<string, string> = {}
  for (const [abbr, fullName] of Object.entries(ABBR_TO_PROGRAM_NAME)) {
    const key = fullName.toLowerCase().replace(/[–—]/g, '-')
    const id = programIdByKey[key]
    if (id) abbrToId[abbr] = id
    else console.warn(`  Warning: program not found for "${fullName}"`)
  }
  console.log('Resolved:', Object.entries(abbrToId).map(([a, id]) => `${a}:${id.slice(-6)}`).join(', '))

  // Update subjects
  const subjects = await db.subject.findMany({ where: { department: { abbreviation: 'CIT' } } })
  let assigned = 0, shared = 0
  for (const s of subjects) {
    const prefix = (s.code as string).replace(/[0-9L].*$/, '')
    const abbr = PREFIX_TO_ABBR[prefix]
    const programId = abbr ? (abbrToId[abbr] ?? null) : null
    await db.subject.update({ where: { id: s.id }, data: { programId } })
    if (programId) assigned++
    else shared++
  }
  console.log(`\nSubjects: ${assigned} assigned to programs, ${shared} shared/GEC`)

  // Assign stub faculty to BSIT
  const bsitId = abbrToId['BSIT']
  if (bsitId) {
    const stubFaculty = await db.faculty.findMany({
      where: { user: { email: { endsWith: '@faculty.slsu.edu.ph' } } },
    })
    for (const f of stubFaculty) {
      await db.faculty.update({ where: { id: f.id }, data: { programId: bsitId } })
    }
    console.log(`${stubFaculty.length} stub faculty assigned to BSIT`)
  }

  // Add sections B and C to all BSIT year levels for richer generation
  const bsitProgram = programs.find((p: any) =>
    p.name.toLowerCase().replace(/[–—]/g, '-') === 'bs information technology'
  )
  if (bsitProgram) {
    const yearLevels = await db.yearLevel.findMany({ where: { programId: bsitProgram.id }, orderBy: { level: 'asc' } })
    for (const yl of yearLevels) {
      for (const letter of ['B', 'C']) {
        await db.section.upsert({
          where: { id: `bsit-yl${yl.id.slice(-6)}-${letter.toLowerCase()}` },
          update: {},
          create: {
            id: `bsit-yl${yl.id.slice(-6)}-${letter.toLowerCase()}`,
            name: `BSInfoTech ${yl.level}-${letter}`,
            yearLevelId: yl.id,
            capacity: 40,
          },
        })
      }
    }
    console.log(`Added sections B and C for ${yearLevels.length} BSIT year levels`)
  }

  // Final summary
  const bsitSubjects = bsitId ? await db.subject.count({ where: { programId: bsitId } }) : 0
  const bsitSections = bsitProgram ? await db.section.count({ where: { yearLevel: { programId: bsitProgram.id } } }) : 0
  const bsitFaculty = bsitId ? await db.faculty.count({ where: { programId: bsitId } }) : 0
  console.log(`\nBSIT ready: ${bsitSubjects} subjects | ${bsitSections} sections | ${bsitFaculty} faculty`)
}

main().finally(() => db.$disconnect())
