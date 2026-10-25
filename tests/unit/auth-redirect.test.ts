import { describe, expect, it } from 'vitest'
import { safeReturnPath, signInPath } from '@/lib/auth-redirect'

const trip = '/trips/11111111-1111-4111-8111-111111111111'
const day = '22222222-2222-4222-8222-222222222222'

describe('safe authentication destinations', () => {
  it.each(['/trips', '/trips/new', '/demo', trip, `${trip}?day=${day}`])('preserves %s', (path) => {
    expect(safeReturnPath(path)).toBe(path)
  })
  it.each([
    undefined,
    ['/trips'],
    'https://evil.example/trips',
    '//evil.example',
    '/\\evil.example',
    '/trips/../api/auth/sign-out',
    '/trips%2f..',
    '/api/auth/sign-out',
    '/sign-in',
    '/trips#x',
    '/trips\n',
    'javascript:alert(1)',
    '/trips/no-id',
  ])('rejects unsafe destination %s', (path) => {
    expect(safeReturnPath(path)).toBe('/trips')
  })
  it('strips arbitrary queries while retaining only a validated selected day', () => {
    expect(safeReturnPath(`${trip}?day=${day}&day=${day}`)).toBe(trip)
    expect(safeReturnPath(`${trip}?day=invalid`)).toBe(trip)
    expect(safeReturnPath('/demo?redirect=https://evil.example')).toBe('/demo')
    expect(
      new URL(signInPath(`${trip}?day=${day}`, true), 'https://test.example').searchParams.get(
        'returnTo',
      ),
    ).toBe(`${trip}?day=${day}`)
  })
})
