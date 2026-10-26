import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  saveTrip: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/trip-transactions', () => ({ saveTrip: mocks.saveTrip }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { saveTripEditorAction } from '@/features/trips/server/save-trip-action'
import { todayDate } from '@/features/trips/shared/date-rules'

beforeEach(() => vi.clearAllMocks())

const request = {
  tripId: 'c0000000-0000-4000-8000-000000000001',
  mutationId: 'c0000000-0000-4000-8000-000000000002',
  expectedRevision: 4,
  snapshot: {
    title: 'Lisbon week',
    destination: 'Lisbon',
    days: [
      {
        key: 'local-day-1',
        date: todayDate(),
        startMinute: 540,
        finishMinute: 1080,
        activities: [
          {
            key: 'local-activity-1',
            title: 'Museum',
            placeLabel: '',
            durationMinutes: 60,
            fixedStartMinute: null,
          },
          {
            key: 'local-activity-2',
            title: 'Lunch',
            placeLabel: '',
            durationMinutes: 45,
            fixedStartMinute: 720,
          },
        ],
        travelEstimates: [{ fromKey: 'local-activity-1', toKey: 'local-activity-2', minutes: 0 }],
      },
    ],
  },
}

it('requires a verified session before calling the owner-scoped storage boundary', async () => {
  // Arrange
  mocks.requireUser.mockResolvedValue({ ok: false, error: { code: 'UNAUTHENTICATED' } })

  // Act
  const result = await saveTripEditorAction(request)

  // Assert
  expect(result).toEqual({
    ok: false,
    code: 'UNAUTHENTICATED',
    message: 'Sign in to save your changes.',
  })
  expect(mocks.saveTrip).not.toHaveBeenCalled()
})

it('generates entity IDs on the server and maps local directional travel keys for the verified owner', async () => {
  // Arrange
  mocks.requireUser.mockResolvedValue({ ok: true, data: { id: 'verified-owner' } })
  mocks.saveTrip.mockResolvedValue({ ok: true, data: { tripId: request.tripId, revision: 5 } })

  // Act
  const result = await saveTripEditorAction(request)
  const call = mocks.saveTrip.mock.calls[0]
  const savedSnapshot = call[2].snapshot

  // Assert
  expect(call[1]).toBe('verified-owner')
  expect(savedSnapshot.days[0].id).toMatch(/^[0-9a-f-]{36}$/)
  expect(savedSnapshot.days[0].activities[0].id).toMatch(/^[0-9a-f-]{36}$/)
  expect(savedSnapshot.days[0].travelEstimates[0]).toEqual({
    fromActivityId: savedSnapshot.days[0].activities[0].id,
    toActivityId: savedSnapshot.days[0].activities[1].id,
    minutes: 0,
  })
  expect(savedSnapshot.days[0].activities[0].placeLabel).toBeNull()
  expect(result).toMatchObject({
    ok: true,
    revision: 5,
    ids: { 'local-day-1': savedSnapshot.days[0].id },
  })
  expect(mocks.revalidatePath).toHaveBeenCalledWith(`/trips/${request.tripId}`)
})

it('rejects caller-supplied ownership fields before storage', async () => {
  // Arrange
  mocks.requireUser.mockResolvedValue({ ok: true, data: { id: 'verified-owner' } })

  // Act
  const result = await saveTripEditorAction({ ...request, ownerId: 'forged-owner' })

  // Assert
  expect(result).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' })
  expect(mocks.saveTrip).not.toHaveBeenCalled()
})

it('rejects a past day date at the authenticated save boundary', async () => {
  // Arrange
  mocks.requireUser.mockResolvedValue({ ok: true, data: { id: 'verified-owner' } })
  const date = new Date(`${todayDate()}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  const pastDate = date.toISOString().slice(0, 10)
  const invalidRequest = {
    ...request,
    snapshot: {
      ...request.snapshot,
      days: request.snapshot.days.map((day) => ({ ...day, date: pastDate })),
    },
  }

  // Act
  const result = await saveTripEditorAction(invalidRequest)

  // Assert
  expect(result).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' })
  expect(mocks.saveTrip).not.toHaveBeenCalled()
})
