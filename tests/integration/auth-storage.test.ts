import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies, toNextJsHandler } from 'better-auth/next-js'
import { testUtils } from 'better-auth/plugins'
import { afterAll, beforeEach, expect, inject, it, vi } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { authOptions } from '@/lib/auth-options'

const databaseUrl = inject('databaseUrl')
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }), log: [] })
const origin = 'http://localhost:3201'
const environment = {
  NODE_ENV: 'test' as const,
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_URL: origin,
  BETTER_AUTH_SECRET: 'synthetic-auth-integration-secret-0123456789abcdef',
  GOOGLE_CLIENT_ID: 'synthetic-google-client',
  GOOGLE_CLIENT_SECRET: 'synthetic-google-secret',
}

function fixture() {
  return betterAuth({
    ...authOptions(environment),
    database: prismaAdapter(db, { provider: 'postgresql' }),
    plugins: [nextCookies(), testUtils()],
  })
}

let auth: ReturnType<typeof fixture>
let address = 30

function request(path: string, body?: Record<string, unknown>, cookie?: string) {
  return new Request(`${origin}/api/auth${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      origin,
      'x-forwarded-for': `192.0.2.${address}`,
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

beforeEach(() => {
  address++
  auth = fixture()
})

afterAll(async () => {
  await db.$disconnect()
})

it('persists a controlled Google callback and revokes its PostgreSQL session on sign-out', async () => {
  // Arrange
  const context = await auth.$context
  const provider = context.socialProviders.find((item) => item.id === 'google')

  if (!provider) throw new Error('Missing configured Google provider')

  const subject = randomUUID()
  const email = `traveler-${subject}@example.test`

  vi.spyOn(provider, 'validateAuthorizationCode').mockResolvedValue({
    accessToken: 'synthetic-access-token',
    scopes: ['openid', 'email', 'profile'],
  })
  vi.spyOn(provider, 'getUserInfo').mockResolvedValue({
    user: { name: 'Synthetic Traveler', email, emailVerified: true },
    data: { sub: subject },
  })

  const handlers = toNextJsHandler(auth)
  const freshAuth = fixture()

  // Act
  const start = await handlers.POST(
    request('/sign-in/social', { provider: 'google', callbackURL: '/trips' }),
  )
  const { url } = (await start.json()) as { url: string }
  const state = new URL(url).searchParams.get('state')
  const callback = await handlers.GET(
    request(`/callback/google?code=synthetic-code&state=${state}`, undefined, cookies(start)),
  )

  const cookie = cookies(callback)
  const persistedUser = await db.user.findUniqueOrThrow({ where: { email }, select: { id: true } })
  const accountCount = await db.account.count({
    where: { userId: persistedUser.id, providerId: 'google' },
  })
  const persistedSessionCount = await db.session.count({ where: { userId: persistedUser.id } })
  const current = await freshAuth.api.getSession({
    headers: new Headers({ cookie }),
    query: { disableCookieCache: true, disableRefresh: true },
  })

  const signedOut = await toNextJsHandler(freshAuth).POST(request('/sign-out', {}, cookie))
  const remainingSessionCount = await db.session.count({ where: { userId: persistedUser.id } })
  const signedOutSession = await freshAuth.api.getSession({ headers: new Headers({ cookie }) })

  // Assert
  expect(start.status).toBe(200)
  expect(callback.status).toBe(302)
  expect(callback.headers.get('location')).toBe('/trips')
  expect(accountCount).toBe(1)
  expect(persistedSessionCount).toBe(1)
  expect(current?.user.id).toBe(persistedUser.id)
  expect(signedOut.status).toBe(200)
  expect(remainingSessionCount).toBe(0)
  expect(signedOutSession).toBeNull()
})

it('does not persist an account or session when Google sign-in is cancelled', async () => {
  // Arrange
  const handlers = toNextJsHandler(auth)

  // Act
  const start = await handlers.POST(
    request('/sign-in/social', { provider: 'google', callbackURL: '/trips' }),
  )
  const { url } = (await start.json()) as { url: string }
  const beforeAccounts = await db.account.count()
  const beforeSessions = await db.session.count()
  const response = await handlers.GET(
    request(
      `/callback/google?error=access_denied&state=${new URL(url).searchParams.get('state')}`,
      undefined,
      cookies(start),
    ),
  )

  const afterAccounts = await db.account.count()
  const afterSessions = await db.session.count()

  // Assert
  expect(start.status).toBe(200)
  expect(response.status).toBe(302)
  expect(new URL(response.headers.get('location') as string, origin).pathname).toBe('/sign-in')
  expect(afterAccounts).toBe(beforeAccounts)
  expect(afterSessions).toBe(beforeSessions)
})

it('rejects expired and forged PostgreSQL sessions without accepting an owner header', async () => {
  // Arrange
  const context = await auth.$context
  const user = await context.test.saveUser(
    context.test.createUser({ email: `expired-${randomUUID()}@example.test` }),
  )
  const login = await context.test.login({ userId: user.id })

  // Act
  const activeSessionCount = await db.session.count({ where: { userId: user.id } })
  await db.session.update({
    where: { token: login.token },
    data: { expiresAt: new Date(Date.now() - 1000) },
  })

  const expired = await auth.api.getSession({ headers: login.headers })
  const forged = await auth.api.getSession({
    headers: new Headers({ cookie: 'better-auth.session_token=forged', 'x-user-id': user.id }),
  })

  // Assert
  expect(activeSessionCount).toBe(1)
  expect(expired).toBeNull()
  expect(forged).toBeNull()
})
