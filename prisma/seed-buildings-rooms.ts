import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })

type LabSpec =
  | "CISCO_NETWORKING"
  | "MULTIMEDIA_DESIGN"
  | "SOFTWARE_DEVELOPMENT"
  | "GENERAL_COMPUTING"
  | "ELECTRONICS"
  | "NETWORK_SECURITY"
  | "DATABASE_ADMINISTRATION"
  | "WEB_DEVELOPMENT"

interface RoomDef {
  name: string
  code: string
  type: "LECTURE_ROOM" | "LABORATORY" | "COMPUTER_LAB" | "LECTURE_LAB"
  labSpec?: LabSpec
}

interface BuildingDef {
  name: string
  code: string
  rooms: RoomDef[]
}

const BUILDINGS: BuildingDef[] = [
  {
    name: "Melchora Aquino Bldg.",
    code: "MAB",
    rooms: [
      { name: "CAM X-Ray Room",           code: "MAB-XRAY",     type: "LABORATORY" },
      { name: "CAM Room 103",             code: "MAB-103",      type: "LECTURE_ROOM" },
      { name: "CAM Nutrition Lab",        code: "MAB-NUTLAB",   type: "LABORATORY" },
      { name: "CAM Room 201",             code: "MAB-201",      type: "LECTURE_ROOM" },
      { name: "CAM Room 202",             code: "MAB-202",      type: "LECTURE_ROOM" },
      { name: "CAM Room 203",             code: "MAB-203",      type: "LECTURE_ROOM" },
      { name: "CAM Room 204",             code: "MAB-204",      type: "LECTURE_ROOM" },
      { name: "CAM Anatomy Computer Room",code: "MAB-ACOMP",    type: "COMPUTER_LAB", labSpec: "GENERAL_COMPUTING" },
      { name: "Anatomy Laboratory",       code: "MAB-ANALAB",   type: "LABORATORY" },
      { name: "Skills Laboratory",        code: "MAB-SKILLSLAB",type: "LABORATORY" },
      { name: "CAM Laboratory",           code: "MAB-CAMLAB",   type: "LABORATORY" },
      { name: "CAM Research",             code: "MAB-RES",      type: "LECTURE_ROOM" },
      { name: "CAM Library",              code: "MAB-LIB",      type: "LECTURE_ROOM" },
      { name: "CAM Room 301",             code: "MAB-301",      type: "LECTURE_ROOM" },
    ],
  },
  {
    name: "Hermano Pule Bldg.",
    code: "HPB",
    rooms: [
      { name: "HP 101", code: "HP-101", type: "LABORATORY" },
      { name: "HP 201", code: "HP-201", type: "LECTURE_ROOM" },
      { name: "HP 202", code: "HP-202", type: "LECTURE_ROOM" },
      { name: "HP 203", code: "HP-203", type: "LECTURE_ROOM" },
      { name: "HP 301", code: "HP-301", type: "LECTURE_ROOM" },
      { name: "HP 302", code: "HP-302", type: "LECTURE_ROOM" },
      { name: "HP 303", code: "HP-303", type: "LECTURE_ROOM" },
    ],
  },
  {
    name: "Jose P. Rizal Bldg.",
    code: "JPRB",
    rooms: [
      { name: "Room 201",                 code: "JPR-201",     type: "LECTURE_ROOM" },
      { name: "Room 202",                 code: "JPR-202",     type: "LECTURE_ROOM" },
      { name: "Room 203",                 code: "JPR-203",     type: "LECTURE_ROOM" },
      { name: "Room 204",                 code: "JPR-204",     type: "LECTURE_ROOM" },
      { name: "Room 205",                 code: "JPR-205",     type: "LECTURE_ROOM" },
      { name: "Room 206",                 code: "JPR-206",     type: "LECTURE_ROOM" },
      { name: "Psychological Service Center", code: "JPR-PSC", type: "LECTURE_ROOM" },
      { name: "Chemistry Room 301",       code: "JPR-CHEM301", type: "LABORATORY" },
      { name: "Chemistry Room 302",       code: "JPR-CHEM302", type: "LABORATORY" },
      { name: "Chemistry Room 303",       code: "JPR-CHEM303", type: "LABORATORY" },
      { name: "Physics/Biology Room",     code: "JPR-PHYSBIO", type: "LABORATORY" },
      { name: "Biology Room 306",         code: "JPR-BIO306",  type: "LABORATORY" },
      { name: "Biology Room 307",         code: "JPR-BIO307",  type: "LABORATORY" },
      { name: "Physics Room 308",         code: "JPR-PHYS308", type: "LABORATORY" },
    ],
  },
  {
    name: "New College of Administrator Bldg.",
    code: "CABHA",
    rooms: [
      { name: "CABHA Room 301",  code: "CABHA-301",      type: "LECTURE_ROOM" },
      { name: "CABHA Room 302",  code: "CABHA-302",      type: "LECTURE_ROOM" },
      { name: "CABHA Room 303",  code: "CABHA-303",      type: "LECTURE_ROOM" },
      { name: "CABHA Room 304",  code: "CABHA-304",      type: "LECTURE_ROOM" },
      { name: "CABHA Room 305",  code: "CABHA-305",      type: "LECTURE_ROOM" },
      { name: "CABHA Room 401",  code: "CABHA-401",      type: "LECTURE_ROOM" },
      { name: "CABHA Room 402",  code: "CABHA-402",      type: "LECTURE_ROOM" },
      { name: "CABHA Room 403",  code: "CABHA-403",      type: "LECTURE_ROOM" },
      { name: "CABHA Room 404",  code: "CABHA-404",      type: "LECTURE_ROOM" },
      { name: "CABHA AVR",       code: "CABHA-AVR",      type: "LECTURE_ROOM" },
      { name: "CABHA Room 501",  code: "CABHA-501",      type: "LECTURE_ROOM" },
      { name: "CABHA Room 502",  code: "CABHA-502",      type: "LECTURE_ROOM" },
      { name: "CABHA Room 503",  code: "CABHA-503",      type: "LECTURE_ROOM" },
      { name: "CABHA Room 504",  code: "CABHA-504",      type: "LECTURE_ROOM" },
      { name: "CABHA TV Studio", code: "CABHA-TVSTUDIO", type: "LECTURE_LAB" },
    ],
  },
  {
    name: "Gomburza Bldg.",
    code: "GB",
    rooms: [
      { name: "G201", code: "GB-201", type: "LECTURE_ROOM" },
      { name: "G202", code: "GB-202", type: "LECTURE_ROOM" },
      { name: "G203", code: "GB-203", type: "LECTURE_ROOM" },
      { name: "G204", code: "GB-204", type: "LECTURE_ROOM" },
      { name: "G301", code: "GB-301", type: "LECTURE_ROOM" },
      { name: "G302", code: "GB-302", type: "LECTURE_ROOM" },
      { name: "G303", code: "GB-303", type: "LECTURE_ROOM" },
      { name: "G304", code: "GB-304", type: "LECTURE_ROOM" },
    ],
  },
  {
    name: "Emilio Aguinaldo Building ICT Bldg.",
    code: "EAB",
    rooms: [
      { name: "IT Comp Lab 2A", code: "EAB-2A", type: "COMPUTER_LAB", labSpec: "GENERAL_COMPUTING" },
      { name: "IT Comp Lab 2B", code: "EAB-2B", type: "COMPUTER_LAB", labSpec: "GENERAL_COMPUTING" },
      { name: "IT Comp Lab 2C", code: "EAB-2C", type: "COMPUTER_LAB", labSpec: "GENERAL_COMPUTING" },
      { name: "IT Comp Lab 3A", code: "EAB-3A", type: "COMPUTER_LAB", labSpec: "GENERAL_COMPUTING" },
      { name: "IT Comp Lab 3B", code: "EAB-3B", type: "COMPUTER_LAB", labSpec: "GENERAL_COMPUTING" },
      { name: "IT Comp Lab 3C", code: "EAB-3C", type: "COMPUTER_LAB", labSpec: "GENERAL_COMPUTING" },
    ],
  },
  {
    name: "Andres Bonifacio Bldg.",
    code: "ABB",
    rooms: [
      { name: "FT Lab",           code: "ABB-FTLAB",     type: "LABORATORY" },
      { name: "GT Lab",           code: "ABB-GTLAB",     type: "LABORATORY" },
      { name: "IDT Lab",          code: "ABB-IDTLAB",    type: "LABORATORY" },
      { name: "ELT Lec",          code: "ABB-ELTLEC",    type: "LECTURE_ROOM" },
      { name: "ELT Lab",          code: "ABB-ELTLAB",    type: "LABORATORY" },
      { name: "ELT Lec/Lab",      code: "ABB-ELTLECLAB", type: "LECTURE_LAB" },
      { name: "HM Kitchen Lab",   code: "ABB-HMKITCHEN", type: "LABORATORY" },
      { name: "AT Lab",           code: "ABB-ATLAB",     type: "LABORATORY" },
      { name: "AT Lec",           code: "ABB-ATLEC",     type: "LECTURE_ROOM" },
      { name: "IT Lec",           code: "ABB-ITLEC",     type: "LECTURE_ROOM" },
      { name: "IT Lab",           code: "ABB-ITLAB",     type: "LABORATORY" },
      { name: "IDT Drawing Room", code: "ABB-IDTDRAW",   type: "LECTURE_LAB" },
      { name: "CPT Lec",          code: "ABB-CPTLEC",    type: "LECTURE_ROOM" },
      { name: "CPT Lab",          code: "ABB-CPTLAB",    type: "LABORATORY" },
    ],
  },
  {
    name: "CTE Building",
    code: "CTEB",
    rooms: [
      { name: "CTE Room 201", code: "CTE-201", type: "LECTURE_ROOM" },
      { name: "CTE Room 301", code: "CTE-301", type: "LECTURE_ROOM" },
      { name: "CTE Room 302", code: "CTE-302", type: "LECTURE_ROOM" },
      { name: "CTE Room 303", code: "CTE-303", type: "LECTURE_ROOM" },
      { name: "CTE Room 304", code: "CTE-304", type: "LECTURE_ROOM" },
      { name: "CTE Room 306", code: "CTE-306", type: "LECTURE_ROOM" },
      { name: "CTE Room 307", code: "CTE-307", type: "LECTURE_ROOM" },
      { name: "CTE Room 308", code: "CTE-308", type: "LECTURE_ROOM" },
      { name: "CTE Room 309", code: "CTE-309", type: "LECTURE_ROOM" },
    ],
  },
  {
    name: "Marcelo H. Del Pilar Bldg.",
    code: "MDP",
    rooms: [
      // 1st floor
      { name: "CEN Room 101",           code: "MDP-101",      type: "LECTURE_ROOM" },
      { name: "CEN Room 102",           code: "MDP-102",      type: "LECTURE_ROOM" },
      { name: "CEN Room 103",           code: "MDP-103",      type: "LECTURE_ROOM" },
      { name: "CEN Room 104",           code: "MDP-104",      type: "LECTURE_ROOM" },
      { name: "CEN Room 105",           code: "MDP-105",      type: "LECTURE_ROOM" },
      { name: "CEN Room 107",           code: "MDP-107",      type: "LECTURE_ROOM" },
      { name: "CEN Room 108",           code: "MDP-108",      type: "LECTURE_ROOM" },
      { name: "CEN Room 109",           code: "MDP-109",      type: "LECTURE_ROOM" },
      { name: "CEN Room 111",           code: "MDP-111",      type: "LECTURE_ROOM" },
      { name: "CEN PPF",                code: "MDP-PPF",      type: "LECTURE_ROOM" },
      { name: "CEN Drawing Room",       code: "MDP-DRAW",     type: "LECTURE_LAB" },
      { name: "CEN Computer Lab",       code: "MDP-COMPLAB",  type: "COMPUTER_LAB", labSpec: "GENERAL_COMPUTING" },
      { name: "CEN MT Shop",            code: "MDP-MTSHOP",   type: "LABORATORY" },
      { name: "CEN Welding Shop",       code: "MDP-WELDSHOP", type: "LABORATORY" },
      { name: "CEN MT Lecture",         code: "MDP-MTLEC",    type: "LECTURE_ROOM" },
      // 2nd floor
      { name: "CEN Room 201",           code: "MDP-201",      type: "LECTURE_ROOM" },
      { name: "CEN Room 203",           code: "MDP-203",      type: "LECTURE_ROOM" },
      { name: "CEN Room 205",           code: "MDP-205",      type: "LECTURE_ROOM" },
      { name: "CEN Room 207",           code: "MDP-207",      type: "LECTURE_ROOM" },
      { name: "CEN Room 209",           code: "MDP-209",      type: "LECTURE_ROOM" },
      { name: "CEN Room 211",           code: "MDP-211",      type: "LECTURE_ROOM" },
      { name: "CEN ELEX Lab",           code: "MDP-ELEXLAB",  type: "LABORATORY",  labSpec: "ELECTRONICS" },
      { name: "CEN Room 217",           code: "MDP-217",      type: "LECTURE_ROOM" },
      { name: "CEN CPE Lab B",          code: "MDP-CPELABB",  type: "COMPUTER_LAB", labSpec: "GENERAL_COMPUTING" },
      { name: "CEN Room 2014",          code: "MDP-2014",     type: "LECTURE_ROOM" },
      { name: "CEN CPE Lab C",          code: "MDP-CPELABC",  type: "COMPUTER_LAB", labSpec: "GENERAL_COMPUTING" },
      { name: "CEN ELEX Laboratory",    code: "MDP-ELEXLABS", type: "LABORATORY",  labSpec: "ELECTRONICS" },
      { name: "CEN EE Lab A",           code: "MDP-EELABA",   type: "LABORATORY" },
      { name: "CEN EE Lab B",           code: "MDP-EELABB",   type: "LABORATORY" },
      { name: "CEN ELEX Lab Equipment", code: "MDP-ELEXEQ",   type: "LABORATORY",  labSpec: "ELECTRONICS" },
      { name: "CEN IE Lab A",           code: "MDP-IELABA",   type: "LABORATORY" },
      // 3rd floor
      { name: "CEN Room 301",           code: "MDP-301",      type: "LECTURE_ROOM" },
      { name: "CEN Room 302",           code: "MDP-302",      type: "LECTURE_ROOM" },
      { name: "CEN Room 303",           code: "MDP-303",      type: "LECTURE_ROOM" },
      { name: "CEN Room 304",           code: "MDP-304",      type: "LECTURE_ROOM" },
      { name: "CEN Room 305",           code: "MDP-305",      type: "LECTURE_ROOM" },
      { name: "CEN Room 306",           code: "MDP-306",      type: "LECTURE_ROOM" },
      { name: "CEN Room 307",           code: "MDP-307",      type: "LECTURE_ROOM" },
      { name: "CEN Multimedia",         code: "MDP-MULTI",    type: "COMPUTER_LAB", labSpec: "MULTIMEDIA_DESIGN" },
    ],
  },
]

async function main() {
  console.log("=== Clearing schedule entries, schedules, rooms, and buildings ===\n")

  const delEntries = await db.scheduleEntry.deleteMany({})
  console.log(`Deleted ${delEntries.count} schedule entries`)

  const delSchedules = await db.schedule.deleteMany({})
  console.log(`Deleted ${delSchedules.count} schedules`)

  const delRooms = await db.room.deleteMany({})
  console.log(`Deleted ${delRooms.count} rooms`)

  const delFBA = await db.facultyBuildingAvailability.deleteMany({})
  console.log(`Deleted ${delFBA.count} faculty building availability records`)

  const delDB = await db.departmentBuilding.deleteMany({})
  console.log(`Deleted ${delDB.count} department-building records`)

  const delBuildings = await db.building.deleteMany({})
  console.log(`Deleted ${delBuildings.count} buildings`)

  console.log("\n=== Creating buildings and rooms ===\n")

  let totalRooms = 0
  for (const b of BUILDINGS) {
    const building = await db.building.create({
      data: { name: b.name, code: b.code },
    })

    for (const r of b.rooms) {
      await db.room.create({
        data: {
          name: r.name,
          code: r.code,
          type: r.type,
          buildingId: building.id,
          ...(r.labSpec ? { labSpecialization: r.labSpec } : {}),
        },
      })
    }

    console.log(`  ${b.name} (${b.code}) — ${b.rooms.length} rooms`)
    totalRooms += b.rooms.length
  }

  console.log(`\nDone: ${BUILDINGS.length} buildings, ${totalRooms} rooms created`)
}

main().catch(console.error).finally(() => db.$disconnect())
