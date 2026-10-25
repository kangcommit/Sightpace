// @vitest-environment node
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { testUtils } from 'better-auth/plugins'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getAuth: vi.fn(), headers: vi.fn() }))

vi.mock('@/lib/auth', () => ({ getAuth: mocks.getAuth }))
vi.mock('next/headers', () => ({ headers: mocks.headers }))

import { GET, POST } from '@/app/api/auth/[...all]/route'
import { authOptions } from '@/lib/auth-options'
import { requireUser } from '@/lib/session'

let clientAddress = 0

const env = {
  NODE_ENV: 'test' as const,
  BETTER_AUTH_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'synthetic-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
  GOOGLE_CLIENT_ID: 'synthetic-google-client',
  GOOGLE_CLIENT_SECRET: 'synthetic-google-secret',
  DATABASE_URL: 'postgresql://unused/never-connected',
}

const origin = env.BETTER_AUTH_URL

function fixture() {
  return betterAuth({
    ...authOptions(env),
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    plugins: [testUtils()],
  })
}

let auth: ReturnType<typeof fixture>

function request(
  path: string,
  body?: Record<string, unknown>,
  cookie?: string,
  requestOrigin = origin,
) {
  return new Request(`${origin}/api/auth${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      origin: requestOrigin,
      'x-forwarded-for': `192.0.2.${clientAddress}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
}

function captureError(action: () => unknown) {
  try {
    action()
  } catch (error) {
    return error
  }

  return undefined
}

async function begin() {
  const response = await POST(
    request('/sign-in/social', { provider: 'google', callbackURL: '/trips' }),
  )

  expect(response.status).toBe(200)

  const { url } = (await response.json()) as { url: string }

  return { url: new URL(url), cookie: cookies(response) }
}

beforeEach(() => {
  clientAddress++
  vi.clearAllMocks()
  auth = fixture()
  mocks.getAuth.mockResolvedValue(auth)
  mocks.headers.mockResolvedValue(new Headers())
})

describe('authentication configuration', () => {
  it.each([
    'DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
  ])('rejects missing %s without including values', (name) => {
    // Arrange
    const source = { ...env, [name]: '' }

    // Act
    const error = captureError(() => authOptions(source))

    // Assert
    expect(String(error)).toContain(`${name}: must not be blank`)
  })

  it.each([
    'https://example.com/path',
    'https://example.com?x=1',
    'https://a:b@example.com',
    'http://public.example',
    'https://example.com/#hash',
  ])('rejects noncanonical origin %s', (url) => {
    // Arrange
    const source = { ...env, BETTER_AUTH_URL: url }

    // Act
    const error = captureError(() => authOptions(source))

    // Assert
    expect(error).toBeInstanceOf(Error)
  })

  it('rejects additive trusted origins or wildcards', () => {
    // Arrange
    const source = { ...env, BETTER_AUTH_TRUSTED_ORIGINS: 'https://*.example.test' }

    // Act
    const error = captureError(() => authOptions(source))

    // Assert
    expect(String(error)).toContain('must be unset or match')
  })

  it('requires HTTPS in production and a sufficiently long secret', () => {
    // Arrange
    const productionSource = { ...env, NODE_ENV: 'production' as const }
    const shortSecretSource = { ...env, BETTER_AUTH_SECRET: 'short' }

    // Act
    const productionError = captureError(() => authOptions(productionSource))
    const secretError = captureError(() => authOptions(shortSecretSource))

    // Assert
    expect(productionError).toBeInstanceOf(Error)
    expect(secretError).toBeInstanceOf(Error)
  })
})

describe('real Better Auth handler with isolated memory persistence', () => {
  it('requires an active browser session to sign out before starting Google again', async () => {
    // Arrange
    const ctx = await auth.$context
    const user = await ctx.test.saveUser(ctx.test.createUser({ email: 'active@example.test' }))
    const login = await ctx.test.login({ userId: user.id })
    const cookie = login.headers.get('cookie') as string
    const createState = vi.spyOn(ctx.internalAdapter, 'createVerificationValue')

    // Act
    const blocked = await POST(
      request('/sign-in/social', { provider: 'google', callbackURL: '/trips' }, cookie),
    )
    const blockedBody = await blocked.json()
    const blockedStateCalls = createState.mock.calls.length
    const signedOut = await POST(request('/sign-out', {}, cookie))
    const allowed = await POST(
      request('/sign-in/social', { provider: 'google', callbackURL: '/trips' }, cookie),
    )
    const allowedStateCalls = createState.mock.calls.length

    // Assert
    expect(blocked.status).toBe(409)
    expect(blockedBody).toMatchObject({ code: 'SIGN_OUT_REQUIRED' })
    expect(blockedStateCalls).toBe(0)
    expect(signedOut.status).toBe(200)
    expect(allowed.status).toBe(200)
    expect(allowedStateCalls).toBe(1)
  })

  it('does not let an older Google callback replace a session that has since signed in', async () => {
    // Arrange
    const start = await begin()
    const ctx = await auth.$context
    const user = await ctx.test.saveUser(ctx.test.createUser({ email: 'current@example.test' }))
    const login = await ctx.test.login({ userId: user.id })
    const provider = ctx.socialProviders.find((item) => item.id === 'google')

    if (!provider) throw new Error('Missing Google provider')

    const exchange = vi
      .spyOn(provider, 'validateAuthorizationCode')
      .mockRejectedValue(new Error('must not exchange'))
    mocks.headers.mockResolvedValue(login.headers)

    // Act
    const response = await GET(
      request(
        `/callback/google?code=old-code&state=${start.url.searchParams.get('state')}`,
        undefined,
        `${start.cookie}; ${login.headers.get('cookie')}`,
      ),
    )
    const currentUser = await requireUser()

    // Assert
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/trips')
    expect(exchange).not.toHaveBeenCalled()
    expect(response.headers.get('set-cookie') ?? '').not.toContain('session_token=')
    expect(currentUser).toMatchObject({ ok: true, data: { id: user.id } })
  })

  it('fails closed when the current browser session cannot be verified', async () => {
    // Arrange
    const ctx = await auth.$context
    const user = await ctx.test.saveUser(ctx.test.createUser({ email: 'unavailable@example.test' }))
    const login = await ctx.test.login({ userId: user.id })
    vi.spyOn(ctx.internalAdapter, 'findSession').mockRejectedValueOnce(
      new Error('synthetic DB failure'),
    )
    const createState = vi.spyOn(ctx.internalAdapter, 'createVerificationValue')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Act
    const response = await POST(
      request(
        '/sign-in/social',
        { provider: 'google', callbackURL: '/trips' },
        login.headers.get('cookie') as string,
      ),
    )

    // Assert
    expect(response.status).toBe(503)
    expect(createState).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('starts Google with identity scopes, PKCE and state, and never offline access', async () => {
    // Arrange
    const start = await begin()

    // Act
    const { url } = start

    // Assert
    expect(url.origin).toBe('https://accounts.google.com')
    expect(new Set(url.searchParams.get('scope')?.split(' '))).toEqual(
      new Set(['openid', 'email', 'profile']),
    )
    expect(url.searchParams.get('access_type')).toBe('online')
    expect(url.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/callback/google`)
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('state')).toBeTruthy()
  })

  it('handles a controlled Google callback, binds a session, then revokes it on sign-out', async () => {
    // Arrange
    const context = await auth.$context
    const provider = context.socialProviders.find((item) => item.id === 'google')

    if (!provider) throw new Error('Missing Google provider')

    // Only the external identity exchange is controlled; state/cookies/session lifecycle are real.
    vi.spyOn(provider, 'validateAuthorizationCode').mockResolvedValue({
      accessToken: 'synthetic-access-token',
      scopes: ['openid', 'email', 'profile'],
    })
    vi.spyOn(provider, 'getUserInfo').mockResolvedValue({
      user: {
        name: 'Synthetic Traveler',
        email: 'traveler@example.test',
        emailVerified: true,
      },
      data: { sub: 'subject-a' },
    })

    const start = await begin()

    // Act
    const callback = await GET(
      request(
        `/callback/google?code=synthetic-code&state=${start.url.searchParams.get('state')}`,
        undefined,
        start.cookie,
      ),
    )

    const cookie = cookies(callback)
    mocks.headers.mockResolvedValue(new Headers({ cookie }))
    const user = await requireUser()
    const signedOut = await POST(request('/sign-out', {}, cookie))
    const signedOutUser = await requireUser()

    // Assert
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe('/trips')
    expect(callback.headers.get('cache-control')).toBe('private, no-store')
    expect(user.ok).toBe(true)
    expect(Object.keys(user.ok ? user.data : {})).toEqual(['id'])
    expect(callback.headers.get('set-cookie')).toContain('HttpOnly')
    expect(signedOut.status).toBe(200)
    expect(signedOutUser).toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' },
    })
  })

  it('returns cancellation to the retry screen without creating a session', async () => {
    // Arrange
    const start = await begin()

    // Act
    const response = await GET(
      request(
        `/callback/google?error=access_denied&state=${start.url.searchParams.get('state')}`,
        undefined,
        start.cookie,
      ),
    )

    // Assert
    expect(response.status).toBe(302)
    expect(new URL(response.headers.get('location') as string, origin).pathname).toBe('/sign-in')
    expect(await requireUser()).toMatchObject({ ok: false })
  })

  it('fails closed for a forged cookie and does not trust a supplied owner header', async () => {
    // Arrange
    mocks.headers.mockResolvedValue(
      new Headers({ cookie: 'better-auth.session_token=forged', 'x-user-id': 'other-owner' }),
    )

    // Act
    const result = await requireUser()

    // Assert
    expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } })
  })

  it('rejects expired database sessions', async () => {
    // Arrange
    const ctx = await auth.$context
    const user = await ctx.test.saveUser(ctx.test.createUser({ email: 'expired@example.test' }))
    const login = await ctx.test.login({ userId: user.id })

    await ctx.internalAdapter.updateSession(login.token, { expiresAt: new Date(Date.now() - 1000) })
    mocks.headers.mockResolvedValue(login.headers)

    // Act
    const result = await requireUser()

    // Assert
    expect(result).toMatchObject({ ok: false })
  })

  it('does not share a previous request identity with another request', async () => {
    // Arrange
    const ctx = await auth.$context
    const a = await ctx.test.saveUser(ctx.test.createUser({ email: 'a@example.test' }))
    const b = await ctx.test.saveUser(ctx.test.createUser({ email: 'b@example.test' }))

    // Act
    mocks.headers.mockResolvedValue(await ctx.test.getAuthHeaders({ userId: a.id }))
    const firstUser = await requireUser()
    mocks.headers.mockResolvedValue(await ctx.test.getAuthHeaders({ userId: b.id }))
    const secondUser = await requireUser()

    // Assert
    expect(firstUser).toMatchObject({ ok: true, data: { id: a.id } })
    expect(secondUser).toMatchObject({ ok: true, data: { id: b.id } })
  })

  it('rejects cross-origin mutations and extra provider scopes', async () => {
    // Arrange
    const crossOriginRequest = request(
      '/sign-in/social',
      { provider: 'google' },
      undefined,
      'https://evil.example',
    )
    const extraScopeRequest = request('/sign-in/social', {
      provider: 'google',
      scopes: ['calendar'],
    })

    const passwordRequest = request('/sign-in/email', {
      email: 'a@example.test',
      password: 'anything',
    })

    // Act
    const crossOrigin = await POST(crossOriginRequest)
    const extraScope = await POST(extraScopeRequest)
    const password = await POST(passwordRequest)

    // Assert
    expect(crossOrigin.status).toBe(403)
    expect(extraScope.status).toBe(400)
    expect(password.ok).toBe(false)
  })

  it('does not accept external redirect destinations', async () => {
    // Arrange
    const externalCallback = 'https://evil.example'

    // Act
    const response = await POST(
      request('/sign-in/social', { provider: 'google', callbackURL: externalCallback }),
    )
    const redirectOrigin = response.ok
      ? new URL(((await response.json()) as { url: string }).url).origin
      : undefined

    // Assert
    expect(response.ok ? redirectOrigin : response.status).toBe(
      response.ok ? 'https://accounts.google.com' : 403,
    )
  })

  it('rejects callback without valid state', async () => {
    // Arrange
    const forgedCallback = request('/callback/google?code=forged&state=forged')

    // Act
    const response = await GET(forgedCallback)
    const user = await requireUser()

    // Assert
    expect(response.status).toBe(302)
    expect(new URL(response.headers.get('location') as string, origin).pathname).toBe('/sign-in')
    expect(user).toMatchObject({ ok: false })
  })

  it('does not confuse unavailable identity storage with a missing session or expose causes', async () => {
    // Arrange
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    mocks.getAuth.mockRejectedValueOnce(new Error('synthetic-private-detail'))

    // Act
    const error = await requireUser().then(
      () => undefined,
      (caught: unknown) => caught,
    )

    // Assert
    expect(String(error)).toContain('Session verification unavailable. Reference:')
    expect(log.mock.calls.flat().join(' ')).not.toContain('synthetic-private-detail')
    log.mockRestore()
  })

  it('sanitizes real handler failures before the router can log database exceptions', async () => {
    // Arrange
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx = await auth.$context

    vi.spyOn(ctx.internalAdapter, 'createVerificationValue').mockRejectedValueOnce(
      new Error('synthetic-private-db-detail'),
    )

    // Act
    const response = await POST(
      request('/sign-in/social', { provider: 'google', callbackURL: '/trips' }),
    )

    // Assert
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('synthetic-private-db-detail')
    expect(log.mock.calls.flat().join(' ')).not.toContain('synthetic-private-db-detail')
    log.mockRestore()
  })

  it('returns safe unavailable responses with correlation IDs and no raw errors', async () => {
    // Arrange
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    mocks.getAuth.mockRejectedValueOnce(new Error('synthetic-private-detail'))

    // Act
    const response = await GET(request('/get-session'))
    const body = await response.text()

    // Assert
    expect(response.status).toBe(503)
    expect(body).toContain('requestId')
    expect(body).not.toContain('synthetic-private-detail')
    expect(log.mock.calls.flat().join(' ')).not.toContain('synthetic-private-detail')
    log.mockRestore()
  })
})
