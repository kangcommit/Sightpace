import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { authOptions } from '@/lib/auth-options'

async function createAuth() {
  const options = authOptions()
  const { prisma } = await import('@/lib/prisma')

  return betterAuth({
    ...options,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    plugins: [nextCookies()],
  })
}

// Request-time initialization keeps builds independent of runtime secrets/DB.
let instance: ReturnType<typeof createAuth> | undefined

export function getAuth() {
  instance ??= createAuth().catch((error: unknown) => {
    instance = undefined
    throw error
  })

  return instance
}
