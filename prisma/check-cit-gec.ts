import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
const adapter = new PrismaPg({ connectionString: "postgresql://postgres:27O5!@localhost:5432/ischeddb" })
const db = new PrismaClient({ adapter })
const GEC_PREFIXES = ["GEC","GEL","PATHFIT","PATHFit","NST"]
db.subject.findMany({ where: { department: { abbreviation: "CIT" }, OR: GEC_PREFIXES.map(p=>({ code: { startsWith: p } })) }, select: { code: true, title: true } }).then(r => { r.forEach(s => console.log(s.code, s.title)) }).finally(() => db.$disconnect())
