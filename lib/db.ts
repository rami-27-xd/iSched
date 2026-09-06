import { PrismaClient } from '../prisma/generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // Fail fast instead of hanging when the pool is exhausted or the DB is unreachable.
    connectionTimeoutMillis: 10_000,
    // Kill runaway queries so a single slow request can't hold a connection forever.
    statement_timeout: 30_000,
  })
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
