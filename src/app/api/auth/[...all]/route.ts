import { randomUUID } from 'node:crypto'
import { toNextJsHandler } from 'better-auth/next-js'
import { getAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(request: Request) {
  let response: Response
  try {
    const handlers = toNextJsHandler(await getAuth())
    response = await handlers[request.method === 'GET' ? 'GET' : 'POST'](request)
    if (response.status >= 500) throw new Error('Authentication unavailable')
  } catch {
    const requestId = randomUUID()
    console.error('Authentication unavailable', { requestId })
    response = Response.json(
      {
        error: {
          code: 'TEMPORARILY_UNAVAILABLE',
          message: 'Sign-in is unavailable. Please try again.',
          requestId,
        },
      },
      { status: 503 },
    )
  }

  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export const GET = handle
export const POST = handle
