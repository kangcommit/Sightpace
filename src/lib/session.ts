import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { getAuth } from '@/lib/auth'

/** No client owner argument and no cross-request session cache. */
export async function requireUser() {
  try {
    const auth = await getAuth()
    const session = await auth.api.getSession({
      headers: await headers(),
      query: { disableCookieCache: true, disableRefresh: true },
    })

    if (!session || session.session.expiresAt <= new Date()) {
      return {
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' },
      } as const
    }

    return { ok: true, data: { id: session.user.id } } as const
  } catch {
    const requestId = randomUUID()

    console.error('Session verification unavailable', { requestId })
    throw new Error(`Session verification unavailable. Reference: ${requestId}`)
  }
}
