/**
 * Promote or create a Super Admin (Department Chair) with full access.
 *
 * Usage:
 *   npx tsx prisma/promote-admin.ts <email> <firstName> <lastName> [supabaseId]
 *
 * Examples:
 *   npx tsx prisma/promote-admin.ts rorbeta@slsu.edu.ph Ramielle Orbeta 08498b7e-2d73-446a-a35d-c2540fafbfc0
 */

import { PrismaClient } from "./generated/prisma/client/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"

dotenv.config()

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error("ERROR: DATABASE_URL is not set in .env")
  process.exit(1)
}

const adapter = new PrismaPg({ connectionString })
const db = new PrismaClient({ adapter })

async function main() {
  const email = process.argv[2]
  const firstName = process.argv[3] || "Admin"
  const lastName = process.argv[4] || ""
  const supabaseId = process.argv[5]

  if (!email) {
    console.error("Usage: npx tsx prisma/promote-admin.ts <email> <firstName> <lastName> [supabaseId]")
    console.error("Example: npx tsx prisma/promote-admin.ts rorbeta@slsu.edu.ph Ramielle Orbeta 08498b7e-2d73-446a-a35d-c2540fafbfc0")
    process.exit(1)
  }

  // Try to find existing user by email
  let user = await db.user.findUnique({ where: { email } })

  if (user) {
    console.log("\nFound existing user:")
    console.log("  Current role:", user.role)
    console.log("  Current approved:", user.isApproved)

    // Update existing user to Super Admin
    user = await db.user.update({
      where: { email },
      data: {
        role: "SUPER_ADMIN",
        isApproved: true,
        firstName,
        lastName,
      },
    })

    // Verify the update
    const verify = await db.user.findUnique({ where: { email } })
    console.log("\nAfter update:")
    console.log("  Role:", verify?.role)
    console.log("  Approved:", verify?.isApproved)
    console.log("\n✅ Existing user promoted to Super Admin!\n")
  } else {
    // Create new user — requires supabaseId
    if (!supabaseId) {
      console.error(`\nUser not found in database: ${email}`)
      console.error("To create a new Super Admin, provide the Supabase UID as the 4th argument.")
      console.error("\nFind the UID in Supabase Dashboard → Authentication → Users")
      console.error("\nExample:")
      console.error("  npx tsx prisma/promote-admin.ts rorbeta@slsu.edu.ph Ramielle Orbeta 08498b7e-2d73-446a-a35d-c2540fafbfc0")
      process.exit(1)
    }

    user = await db.user.create({
      data: {
        supabaseId,
        email,
        firstName,
        lastName,
        role: "SUPER_ADMIN",
        isApproved: true,
      },
    })
    console.log("\n✅ New Super Admin account created!\n")
  }

  console.log("  Email:      ", user.email)
  console.log("  Name:       ", user.firstName, user.lastName)
  console.log("  Role:       ", user.role)
  console.log("  Approved:   ", user.isApproved)
  console.log("\nSign out and sign back in to access the full dashboard.")
}

main()
  .catch((e) => {
    console.error("Error:", e.message)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
