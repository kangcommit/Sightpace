import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  clearTripRecoveryDraft,
  readTripRecoveryDraft,
  writeTripRecoveryDraft,
} from '@/features/trips/editor/recovery-storage'

const userId = 'synthetic-user'
const tripId = 'c0000000-0000-4000-8000-000000000001'
const generationId = 'c0000000-0000-4000-8000-000000000002'
const recoveryKey = `sightpace:private:${userId}:${tripId}:draft`

const draft = {
  title: '',
  destination: 'Lisbon',
  days: [
    {
      key: 'day-1',
      id: 'c0000000-0000-4000-8000-000000000003',
      date: '',
      startMinute: 540,
      finishMinute: 1080,
      activities: [],
      travelEstimates: [],
    },
  ],
}

beforeEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('stores a bounded user-scoped draft while preserving incomplete editor fields', () => {
  // Arrange
  const now = Date.UTC(2026, 9, 27)

  // Act
  const stored = writeTripRecoveryDraft({
    generationId,
    userId,
    tripId,
    baseRevision: 4,
    draft,
    now,
  })
  const recovered = readTripRecoveryDraft(userId, tripId, now)

  // Assert
  expect(stored).toBe(true)
  expect(recovered).toMatchObject({
    kind: 'available',
    record: { generationId, userId, tripId, baseRevision: 4, draft },
  })
})

it('removes a recovery draft after the 24-hour retention window', () => {
  // Arrange
  const now = Date.UTC(2026, 9, 27)
  writeTripRecoveryDraft({ generationId, userId, tripId, baseRevision: 4, draft, now })

  // Act
  const recovered = readTripRecoveryDraft(userId, tripId, now + 24 * 60 * 60 * 1000 + 1)

  // Assert
  expect(recovered).toEqual({ kind: 'none' })
  expect(localStorage.getItem(recoveryKey)).toBeNull()
})

it('does not clear a newer recovery generation after an older save is acknowledged', () => {
  // Arrange
  const newerGenerationId = 'c0000000-0000-4000-8000-000000000004'
  writeTripRecoveryDraft({
    generationId: newerGenerationId,
    userId,
    tripId,
    baseRevision: 5,
    draft,
  })

  // Act
  const cleared = clearTripRecoveryDraft(userId, tripId, generationId)

  // Assert
  expect(cleared).toBe(true)
  expect(readTripRecoveryDraft(userId, tripId)).toMatchObject({
    kind: 'available',
    record: { generationId: newerGenerationId, baseRevision: 5 },
  })
})

it('reports unavailable browser storage without throwing or claiming a saved recovery copy', () => {
  // Arrange
  const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked storage')
  })

  // Act
  const recovered = readTripRecoveryDraft(userId, tripId)
  const cleared = clearTripRecoveryDraft(userId, tripId, generationId)

  // Assert
  expect(recovered).toEqual({ kind: 'unavailable' })
  expect(cleared).toBe(false)
  blocked.mockRestore()
})
