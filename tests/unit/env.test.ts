import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAuthEnv, getDatabaseEnv } from '@/lib/env'

const authEnv = {
  NODE_ENV: 'test' as const,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/sightpace_test',
  BETTER_AUTH_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'synthetic-secret-with-more-than-32-characters',
  GOOGLE_CLIENT_ID: 'synthetic-client',
  GOOGLE_CLIENT_SECRET: 'synthetic-client-secret',
}

afterEach(() => vi.unstubAllEnvs())

describe('lazy server configuration', () => {
  it('imports without runtime configuration', async () => {
    // Arrange
    for (const name of Object.keys(authEnv)) vi.stubEnv(name, '')

    // Act
    vi.resetModules()
    const imported = await import('@/lib/env')

    // Assert
    expect(imported).toBeDefined()
  })

  it('reads the current environment only when requested', () => {
    // Arrange
    vi.stubEnv('DATABASE_URL', authEnv.DATABASE_URL)
    const invalidSource = { DATABASE_URL: '' }

    // Act
    const configured = getDatabaseEnv()
    let invalidError: unknown
    try {
      getDatabaseEnv(invalidSource)
    } catch (error) {
      invalidError = error
    }

    // Assert
    expect(configured).toEqual({ DATABASE_URL: authEnv.DATABASE_URL })
    expect(invalidError).toBeInstanceOf(Error)
    expect(String(invalidError)).toContain('DATABASE_URL')
  })

  it.each(['postgresql://localhost/sightpace', 'postgres://localhost/sightpace'])(
    'validates a database independently of Google configuration: %s',
    (DATABASE_URL) => {
      // Arrange
      const source = { DATABASE_URL }

      // Act
      const result = getDatabaseEnv(source)

      // Assert
      expect(result).toEqual(source)
    },
  )

  it.each([
    undefined,
    '',
    '   ',
    'not-a-url',
    'https://example.test/db',
    'mysql://localhost/db',
    'postgresql:///db',
  ])('rejects an invalid PostgreSQL URL without constructing a client: %s', (DATABASE_URL) => {
    // Arrange
    const source = { DATABASE_URL }

    // Act
    let error: unknown
    try {
      getDatabaseEnv(source)
    } catch (caught) {
      error = caught
    }

    // Assert
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).toContain('DATABASE_URL')
  })

  it('returns only declared fields and preserves credential bytes', () => {
    // Arrange
    const source = {
      ...authEnv,
      GOOGLE_CLIENT_SECRET: ' synthetic secret ',
      UNRELATED_SECRET: 'do-not-include',
    }

    // Act
    const parsed = getAuthEnv(source)

    // Assert
    expect(parsed.GOOGLE_CLIENT_SECRET).toBe(' synthetic secret ')
    expect(parsed).not.toHaveProperty('UNRELATED_SECRET')
  })

  it('accepts HTTPS in production and rejects HTTP loopback there', () => {
    // Arrange
    const productionSource = {
      ...authEnv,
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'https://sightpace.example',
    }
    const invalidLoopbackSource = { ...authEnv, NODE_ENV: 'production' as const }

    // Act
    const parsed = getAuthEnv(productionSource)
    let loopbackError: unknown
    try {
      getAuthEnv(invalidLoopbackSource)
    } catch (error) {
      loopbackError = error
    }

    // Assert
    expect(parsed.BETTER_AUTH_URL).toBe('https://sightpace.example')
    expect(loopbackError).toBeInstanceOf(Error)
    expect(String(loopbackError)).toContain('BETTER_AUTH_URL')
  })

  it('never includes configuration values or raw Zod issues in thrown errors', () => {
    // Arrange
    const source = {
      ...authEnv,
      DATABASE_URL: 'https://private-user:private-password@example.test/private-db',
      BETTER_AUTH_URL: 'https://private-user:private-password@example.test/path',
      BETTER_AUTH_SECRET: 'private-short-secret',
      GOOGLE_CLIENT_SECRET: 'private-google-secret',
    }

    // Act
    let validationError: unknown
    try {
      getAuthEnv(source)
    } catch (error) {
      validationError = error
    }

    // Assert
    expect(validationError).toBeInstanceOf(Error)

    const message = String(validationError)

    expect(message).toContain('DATABASE_URL')
    expect(message).toContain('BETTER_AUTH_URL')
    expect(message).toContain('BETTER_AUTH_SECRET')
    for (const value of [
      'private-user',
      'private-password',
      'private-db',
      'private-short-secret',
      'private-google-secret',
    ])
      expect(message).not.toContain(value)

    expect(validationError).not.toHaveProperty('issues')
    expect(validationError).not.toHaveProperty('cause')
  })
})
