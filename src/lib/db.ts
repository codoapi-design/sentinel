import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Only create PrismaClient if DATABASE_URL is available
// This prevents build-time errors when the database is not configured
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })
}

export const db =
  globalForPrisma.prisma ??
  (process.env.DATABASE_URL ? createPrismaClient() : createPrismaClient())

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
