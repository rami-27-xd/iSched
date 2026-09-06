/**
 * Reconciles Program names/abbreviations with the official per-department list.
 *
 * Matching is by (department, current abbreviation) so existing program IDs —
 * and every Subject / Section / ProgramHead / ProgramRoom row pointing at them —
 * are preserved. Only the display name and abbreviation change.
 *
 * Run:  npx tsx --env-file=.env prisma/sync-programs.ts
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

// dept abbreviation -> [current program abbreviation, new name, new abbreviation]
const RENAMES: Record<string, [string, string, string][]> = {
  CIT: [
    // "Bachelor of Industrial Technology" — BIT, not BSIT. BSIT was ambiguous
    // against BS Information Technology, a separate program in the same dept.
    ["BSIT-Auto",  "Bachelor of Industrial Technology Major in Automotive",          "BIT-Auto"],
    ["BSIT-Comp",  "Bachelor of Industrial Technology Major in Computer",            "BIT-Comp"],
    ["BSIT-Elec",  "Bachelor of Industrial Technology Major in Electrical",          "BIT-Elec"],
    ["BSIT-Eltx",  "Bachelor of Industrial Technology Major in Electronics",         "BIT-Eltx"],
    // Content change: "Food" is officially the Culinary major.
    ["BSIT-Food",  "Bachelor of Industrial Technology Major in Culinary",            "BIT-Culi"],
    ["BSIT-Garm",  "Bachelor of Industrial Technology Major in Garments",            "BIT-Garm"],
    ["BSIT-ID",    "Bachelor of Industrial Technology Major in Industrial Design",   "BIT-ID"],
    ["BSIT-Mech",  "Bachelor of Industrial Technology Major in Mechanical",          "BIT-Mech"],
    ["BSIT-Print", "Bachelor of Industrial Technology Major in Printing Technology", "BIT-Print"],
    ["BSInfoTech", "BS Information Technology",                                      "BSInfoTech"],
  ],
  CTE: [
    ["BCAEd",     "Bachelor of Culture and Arts Education",                                  "BCAEd"],
    ["BEEd",      "Bachelor of Elementary Education",                                        "BEEd"],
    ["BSESS",     "BS in Exercise and Sports Science",                                       "BSESS"],
    ["BSEd-Eng",  "Bachelor of Secondary Education Major in English",                        "BSEd-Eng"],
    ["BSEd-Fil",  "Bachelor of Secondary Education Major in Filipino",                       "BSEd-Fil"],
    ["BSEd-Math", "Bachelor of Secondary Education Major in Mathematics",                    "BSEd-Math"],
    ["BSEd-Sci",  "Bachelor of Secondary Education Major in Sciences",                       "BSEd-Sci"],
    ["BSEd-SS",   "Bachelor of Secondary Education Major in Social Studies",                 "BSEd-SS"],
    ["BTLEd-HE",  "Bachelor of Technical Livelihood Education Major in Home Economics",      "BTLEd-HE"],
    ["BTLEd-ICT", "Bachelor of Technical Livelihood Education Major in ICT",                 "BTLEd-ICT"],
    ["BTLEd-IA",  "Bachelor of Technical Livelihood Education Major in Industrial Arts",     "BTLEd-IA"],
  ],
  CABHA: [
    ["BPA",      "Bachelor of Public Administration",                        "BPA"],
    ["BSA",      "BS Accountancy",                                           "BSA"],
    ["BSBA-FM",  "BS Business Administration - Financial Management",        "BSBA-FM"],
    ["BSBA-HRM", "BS Business Administration - Human Resource Management",   "BSBA-HRM"],
    ["BSBA-MM",  "BS Business Administration - Marketing Management",        "BSBA-MM"],
    ["BSHM",     "BS Hospitality Management",                                "BSHM"],
  ],
  CAG: [
    ["BSAgri-AS", "BS Agriculture - Animal Science",     "BSAgri-AS"],
    ["BSAgri-CS", "BS Agriculture - Crop Science",       "BSAgri-CS"],
    ["BSAgri-OA", "BS Agriculture - Organic Agriculture", "BSAgri-OA"],
    ["BSEnvSci",  "BS Environmental Science",            "BSEnvSci"],
    ["BSFor",     "BS Forestry",                         "BSFor"],
  ],
  CAM: [
    ["BSMid", "BS Midwifery",              "BSMid"],
    ["BSN",   "BS Nursing",                "BSN"],
    ["BSRT",  "BS Radiologic Technology",  "BSRT"],
  ],
  // Engineering names stay spelled out — "Eng." in the source list is shorthand.
  CEN: [
    ["BSCE",  "BS Civil Engineering",      "BSCE"],
    ["BSCpE", "BS Computer Engineering",   "BSCpE"],
    ["BSEE",  "BS Electrical Engineering", "BSEE"],
    ["BSECE", "BS Electronics Engineering", "BSECE"],
    ["BSIE",  "BS Industrial Engineering", "BSIE"],
    ["BSME",  "BS Mechanical Engineering", "BSME"],
  ],
}

async function main() {
  let changed = 0
  let unchanged = 0
  const missing: string[] = []

  for (const [deptAbbr, rows] of Object.entries(RENAMES)) {
    const dept = await db.department.findFirst({ where: { abbreviation: deptAbbr } })
    if (!dept) { console.log(`!! department ${deptAbbr} not found — skipped`); continue }

    console.log(`\n${deptAbbr}`)
    for (const [currentAbbr, newName, newAbbr] of rows) {
      const program = await db.program.findFirst({
        where: { departmentId: dept.id, abbreviation: currentAbbr },
      })
      if (!program) { missing.push(`${deptAbbr}/${currentAbbr}`); console.log(`   ?? missing: ${currentAbbr}`); continue }

      if (program.name === newName && program.abbreviation === newAbbr) {
        console.log(`   =  ${newAbbr} — ${newName}`)
        unchanged++
        continue
      }

      await db.program.update({
        where: { id: program.id },
        data: { name: newName, abbreviation: newAbbr },
      })
      console.log(`   ~  ${program.abbreviation} — ${program.name}`)
      console.log(`      -> ${newAbbr} — ${newName}`)
      changed++
    }
  }

  console.log(`\nRenamed ${changed}, already correct ${unchanged}.`)
  if (missing.length) console.log(`Not found: ${missing.join(", ")}`)
  console.log(`Total programs in DB: ${await db.program.count()}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
