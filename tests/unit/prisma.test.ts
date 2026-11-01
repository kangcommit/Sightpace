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
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/sightpace_test')
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
  it('defers database configuration validation until a client is requested', async () => {
    // Arrange
    vi.stubEnv('DATABASE_URL', '')

    // Act
    const module = await import('@/lib/prisma')
    const clientWasNotConstructedOnImport = mocks.client.mock.calls.length === 0
    let validationError: unknown
    try {
      module.getPrisma()
    } catch (error) {
      validationError = error
    }

    // Assert
    expect(clientWasNotConstructedOnImport).toBe(true)
    expect(String(validationError)).toContain('DATABASE_URL: must not be blank')
    expect(mocks.client).not.toHaveBeenCalled()
    expect(mocks.adapter).not.toHaveBeenCalled()
  })

  it('reuses the development client across module reloads', async () => {
    // Arrange
    const first = await import('@/lib/prisma')
    const firstClient = first.getPrisma()

    // Act
    vi.resetModules()
    const second = await import('@/lib/prisma')
    const secondClient = second.getPrisma()

    // Assert
    expect(secondClient).toBe(firstClient)
    expect(mocks.client).toHaveBeenCalledTimes(1)
    expect(mocks.adapter).toHaveBeenCalledTimes(1)
  })

  it('does not retain a production client on the development global', async () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'production')

    // Act
    const { getPrisma } = await import('@/lib/prisma')
    getPrisma()

    // Assert
    expect(globalForPrisma.prisma).toBeUndefined()
    expect(mocks.client).toHaveBeenCalledTimes(1)
  })
})
