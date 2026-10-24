import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  adapter: vi.fn(),
  client: vi.fn(),
}))

vi.mock('dotenv/config', () => ({}))
vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class {
    constructor(options: unknown) {
      mocks.adapter(options)
    }
  },
}))
vi.mock('../../src/generated/prisma/client', () => ({
  PrismaClient: class {
    constructor(options: unknown) {
      mocks.client(options)
    }
  },
}))

const globalForPrisma = globalThis as unknown as { prisma?: unknown }
let previousClient: unknown

beforeEach(() => {
  previousClient = globalForPrisma.prisma
  delete globalForPrisma.prisma
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/trailplan_test')
})

afterEach(() => {
  if (previousClient === undefined) {
    delete globalForPrisma.prisma
  } else {
    globalForPrisma.prisma = previousClient
  }
  vi.unstubAllEnvs()
})

describe('Prisma initialization', () => {
  it('rejects missing database configuration before constructing a client', async () => {
    vi.stubEnv('DATABASE_URL', '')
    await expect(import('@/lib/prisma')).rejects.toThrow(
      'DATABASE_URL is required to initialize the database client',
    )
    expect(mocks.client).not.toHaveBeenCalled()
    expect(mocks.adapter).not.toHaveBeenCalled()
  })

  it('reuses the development client across module reloads', async () => {
    const first = await import('@/lib/prisma')
    vi.resetModules()
    const second = await import('@/lib/prisma')
    expect(second.prisma).toBe(first.prisma)
    expect(mocks.client).toHaveBeenCalledTimes(1)
    expect(mocks.adapter).toHaveBeenCalledTimes(1)
  })

  it('does not retain a production client on the development global', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await import('@/lib/prisma')
    expect(globalForPrisma.prisma).toBeUndefined()
    expect(mocks.client).toHaveBeenCalledTimes(1)
  })
})
