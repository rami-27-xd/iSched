/**
 * One-time fix: update supabaseId for a user by email.
 * Usage: npx tsx prisma/fix-supabase-id.ts <email> <newSupabaseId>
 */
import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  const email = process.argv[2]
  const newSupabaseId = process.argv[3]

  if (!email || !newSupabaseId) {
    console.error("Usage: npx tsx prisma/fix-supabase-id.ts <email> <newSupabaseId>")
    process.exit(1)
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user) { console.error("User not found:", email); process.exit(1) }

  console.log("Before:", { supabaseId: user.supabaseId, role: user.role, isApproved: user.isApproved })

  await db.user.update({
    where: { email },
    data: { supabaseId: newSupabaseId, role: "SUPER_ADMIN", isApproved: true },
  })

  const after = await db.user.findUnique({ where: { email } })
  console.log("After :", { supabaseId: after?.supabaseId, role: after?.role, isApproved: after?.isApproved })
  console.log("✅ Done")
}

main().catch(console.error).finally(() => db.$disconnect())
