import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { getDatabaseEnv } from '@/lib/env'
import { PrismaClient } from '../generated/prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
let client: PrismaClient | undefined

export function getPrisma() {
  if (client) return client

  const { DATABASE_URL: connectionString } = getDatabaseEnv()
  client =
    globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client

  return client
}
