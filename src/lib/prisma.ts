import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { getDatabaseEnv } from '@/lib/env'
import { PrismaClient } from '../generated/prisma/client'

const { DATABASE_URL: connectionString } = getDatabaseEnv()

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export { prisma }
