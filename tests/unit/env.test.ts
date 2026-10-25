import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAuthEnv, getDatabaseEnv } from '@/lib/env'

const authEnv = {
  NODE_ENV: 'test' as const,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/trailplan_test',
  BETTER_AUTH_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'synthetic-secret-with-more-than-32-characters',
  GOOGLE_CLIENT_ID: 'synthetic-client',
  GOOGLE_CLIENT_SECRET: 'synthetic-client-secret',
}

afterEach(() => vi.unstubAllEnvs())

describe('lazy server configuration', () => {
  it('imports without runtime configuration', async () => {
    for (const name of Object.keys(authEnv)) vi.stubEnv(name, '')
    vi.resetModules()
    await expect(import('@/lib/env')).resolves.toBeDefined()
  })

  it('reads the current environment only when requested', () => {
    vi.stubEnv('DATABASE_URL', authEnv.DATABASE_URL)
    expect(getDatabaseEnv()).toEqual({ DATABASE_URL: authEnv.DATABASE_URL })
    vi.stubEnv('DATABASE_URL', '')
    expect(() => getDatabaseEnv()).toThrow('DATABASE_URL')
  })

  it.each(['postgresql://localhost/trailplan', 'postgres://localhost/trailplan'])(
    'validates a database independently of Google configuration: %s',
    (DATABASE_URL) => {
      expect(getDatabaseEnv({ DATABASE_URL })).toEqual({ DATABASE_URL })
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
    expect(() => getDatabaseEnv({ DATABASE_URL })).toThrow('DATABASE_URL')
  })

  it('returns only declared fields and preserves credential bytes', () => {
    const source = {
      ...authEnv,
      GOOGLE_CLIENT_SECRET: ' synthetic secret ',
      UNRELATED_SECRET: 'do-not-include',
    }
    const parsed = getAuthEnv(source)
    expect(parsed.GOOGLE_CLIENT_SECRET).toBe(' synthetic secret ')
    expect(parsed).not.toHaveProperty('UNRELATED_SECRET')
  })

  it('accepts HTTPS in production and rejects HTTP loopback there', () => {
    expect(
      getAuthEnv({
        ...authEnv,
        NODE_ENV: 'production',
        BETTER_AUTH_URL: 'https://trailplan.example',
      }).BETTER_AUTH_URL,
    ).toBe('https://trailplan.example')
    expect(() => getAuthEnv({ ...authEnv, NODE_ENV: 'production' })).toThrow('BETTER_AUTH_URL')
  })

  it('never includes configuration values or raw Zod issues in thrown errors', () => {
    try {
      getAuthEnv({
        ...authEnv,
        DATABASE_URL: 'https://private-user:private-password@example.test/private-db',
        BETTER_AUTH_URL: 'https://private-user:private-password@example.test/path',
        BETTER_AUTH_SECRET: 'private-short-secret',
        GOOGLE_CLIENT_SECRET: 'private-google-secret',
      })
      throw new Error('Expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      const message = String(error)
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
      expect(error).not.toHaveProperty('issues')
      expect(error).not.toHaveProperty('cause')
    }
  })
})
