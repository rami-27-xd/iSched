import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:27O5!@localhost:5432/ischeddb' }) })

async function main() {
  const subjects = await db.subject.findMany({
    where: { department: { abbreviation: 'CIT' } },
    orderBy: [{ year: 'asc' }, { code: 'asc' }],
  })

  // Group by prefix (letters before digits)
  const prefixes: Record<string, { count: number; years: Set<number>; sample: string }> = {}
  subjects.forEach((s: any) => {
    const prefix = s.code.replace(/[0-9L].*$/, '')
    if (!prefixes[prefix]) prefixes[prefix] = { count: 0, years: new Set(), sample: s.title }
    prefixes[prefix].count++
    prefixes[prefix].years.add(s.year)
  })

  console.log('SUBJECT PREFIXES IN CIT (code prefix → count | years | sample):')
  Object.entries(prefixes).sort().forEach(([p, v]) => {
    console.log(`  ${p.padEnd(12)} → ${v.count} subjects | years: ${[...v.years].sort().join(',')} | e.g. "${v.sample}"`)
  })

  // All BSIT-specific subjects (IIT prefix)
  const bsitSubjects = subjects.filter((s: any) => s.code.startsWith('IIT') || s.code.startsWith('IT'))
  console.log(`\nBSIT subjects (IIT/IT prefix): ${bsitSubjects.length}`)

  // Sections under BSIT
  const bsitSections = await db.section.findMany({
    where: { yearLevel: { program: { name: { contains: 'Information Technology' } } } },
    include: { yearLevel: true },
    orderBy: { name: 'asc' },
  })
  console.log(`\nBSIT sections (${bsitSections.length}):`)
  bsitSections.forEach((s: any) => console.log(`  ${s.name} | year: ${s.yearLevel?.level}`))
}
main().finally(() => db.$disconnect())
