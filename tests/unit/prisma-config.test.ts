import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('dotenv/config', () => ({}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('Prisma CLI datasource configuration', () => {
  it('uses DIRECT_URL even when DATABASE_URL points to another endpoint', async () => {
    // Arrange
    vi.stubEnv('DATABASE_URL', 'postgresql://runtime.example.test/app?pgbouncer=true')
    vi.stubEnv('DIRECT_URL', 'postgresql://migration.example.test/app')

    // Act
    const { default: config } = await import('../../prisma7.config')

    // Assert
    expect(config.datasource?.url).toBe('postgresql://migration.example.test/app')
  })

  it('does not fall back to DATABASE_URL when DIRECT_URL is absent', async () => {
    // Arrange
    vi.stubEnv('DATABASE_URL', 'postgresql://runtime.example.test/app?pgbouncer=true')
    vi.stubEnv('DIRECT_URL', '')

    // Act
    const { default: config } = await import('../../prisma7.config')

    // Assert
    expect(config.datasource?.url).toBe('')
  })
})
