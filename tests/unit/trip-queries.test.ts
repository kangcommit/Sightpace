import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getPrisma: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ getPrisma: mocks.getPrisma }))

import { getTrip, listTrips } from '@/features/trips/server/queries'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getPrisma.mockImplementation(() => {
    throw new Error('Invalid server environment')
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

it('returns a retryable result if trip listing cannot initialize Prisma', async () => {
  // Arrange
  const ownerId = 'verified-owner'

  // Act
  const result = await listTrips(ownerId)

  // Assert
  expect(result).toMatchObject({
    ok: false,
    error: 'TEMPORARILY_UNAVAILABLE',
    requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
  })
  expect(mocks.getPrisma).toHaveBeenCalledOnce()
  expect(console.error).toHaveBeenCalledWith('Trip list unavailable', {
    requestId: expect.any(String),
  })
})

it('returns a retryable result if a trip read cannot initialize Prisma', async () => {
  // Arrange
  const ownerId = 'verified-owner'
  const tripId = 'c0000000-0000-4000-8000-000000000001'

  // Act
  const result = await getTrip(ownerId, tripId)

  // Assert
  expect(result).toMatchObject({
    ok: false,
    error: 'TEMPORARILY_UNAVAILABLE',
    requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
  })
  expect(mocks.getPrisma).toHaveBeenCalledOnce()
  expect(console.error).toHaveBeenCalledWith('Trip read unavailable', {
    requestId: expect.any(String),
  })
})
