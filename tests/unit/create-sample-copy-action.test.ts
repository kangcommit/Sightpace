import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getPrisma: vi.fn(() => ({})),
  createSampleCopy: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/trip-transactions', () => ({ createSampleCopy: mocks.createSampleCopy }))
vi.mock('@/lib/prisma', () => ({ getPrisma: mocks.getPrisma }))

import { createSampleCopyAction } from '@/features/trips/server/create-sample-copy-action'
import { todayDate } from '@/features/trips/shared/date-rules'

beforeEach(() => vi.resetAllMocks())

it('rejects unauthenticated requests before reaching storage', async () => {
  // Arrange
  mocks.requireUser.mockResolvedValue({ ok: false })

  // Act
  const result = await createSampleCopyAction({})

  // Assert
  expect(result).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' })
  expect(mocks.createSampleCopy).not.toHaveBeenCalled()
})

it('rejects unexpected snapshot fields before reaching storage', async () => {
  // Arrange
  mocks.requireUser.mockResolvedValue({ ok: true, data: { id: 'verified-owner' } })

  // Act
  const result = await createSampleCopyAction({
    mutationId: crypto.randomUUID(),
    ownerId: 'attacker',
    snapshot: {},
  })

  // Assert
  expect(result).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' })
  expect(mocks.createSampleCopy).not.toHaveBeenCalled()
})

it('returns a safe retryable error when the database configuration is unavailable', async () => {
  // Arrange
  mocks.requireUser.mockResolvedValue({ ok: true, data: { id: 'verified-owner' } })
  mocks.getPrisma.mockImplementation(() => {
    throw new Error('Invalid server environment')
  })
  const request = {
    mutationId: crypto.randomUUID(),
    snapshot: {
      title: 'A day in Bandung',
      destination: 'Bandung, Indonesia',
      days: [
        {
          key: 'day-1',
          date: todayDate(),
          startMinute: 540,
          finishMinute: 1080,
          activities: [],
          travelEstimates: [],
        },
      ],
    },
  }

  // Act
  const result = await createSampleCopyAction(request)

  // Assert
  expect(result).toEqual({
    ok: false,
    code: 'TEMPORARILY_UNAVAILABLE',
    message: 'We couldn’t save your copy. Your sample is still here; please try again.',
  })
  expect(mocks.createSampleCopy).not.toHaveBeenCalled()
})
