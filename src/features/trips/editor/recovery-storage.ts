import { z } from 'zod'
import { PRIVATE_STORAGE_PREFIX } from '@/lib/brand'
import { type TripEditorDraft, tripEditorRecoveryDraftSchema } from './editor-contract'

const recoveryLifetimeMs = 24 * 60 * 60 * 1000
const maximumClockSkewMs = 5 * 60 * 1000
const maximumRecordLength = 1_000_000

const recoveryRecordSchema = z.strictObject({
  version: z.literal(1),
  generationId: z.uuid(),
  userId: z.string().min(1).max(200),
  tripId: z.uuid(),
  baseRevision: z.number().int().min(1),
  updatedAt: z.number().int().min(0),
  draft: tripEditorRecoveryDraftSchema,
})

export type TripRecoveryRecord = z.infer<typeof recoveryRecordSchema>

export type RecoveryReadResult =
  | { kind: 'none' }
  | { kind: 'available'; record: TripRecoveryRecord }
  | { kind: 'unavailable' }

function recoveryKey(userId: string, tripId: string) {
  return `${PRIVATE_STORAGE_PREFIX}${userId}:${tripId}:draft`
}

export function readTripRecoveryDraft(
  userId: string,
  tripId: string,
  now = Date.now(),
): RecoveryReadResult {
  const key = recoveryKey(userId, tripId)

  try {
    const serialized = window.localStorage.getItem(key)
    if (serialized === null) return { kind: 'none' }

    const parsed =
      serialized.length <= maximumRecordLength
        ? recoveryRecordSchema.safeParse(JSON.parse(serialized))
        : { success: false as const }

    if (
      !parsed.success ||
      parsed.data.userId !== userId ||
      parsed.data.tripId !== tripId ||
      parsed.data.updatedAt > now + maximumClockSkewMs ||
      now - parsed.data.updatedAt > recoveryLifetimeMs
    ) {
      window.localStorage.removeItem(key)
      return { kind: 'none' }
    }

    return { kind: 'available', record: parsed.data }
  } catch {
    return { kind: 'unavailable' }
  }
}

export function writeTripRecoveryDraft({
  generationId,
  userId,
  tripId,
  baseRevision,
  draft,
  now = Date.now(),
}: {
  generationId: string
  userId: string
  tripId: string
  baseRevision: number
  draft: TripEditorDraft
  now?: number
}) {
  const parsed = recoveryRecordSchema.safeParse({
    version: 1,
    generationId,
    userId,
    tripId,
    baseRevision,
    updatedAt: now,
    draft,
  })

  if (!parsed.success) return false

  try {
    window.localStorage.setItem(recoveryKey(userId, tripId), JSON.stringify(parsed.data))
    return true
  } catch {
    return false
  }
}

export function clearTripRecoveryDraft(
  userId: string,
  tripId: string,
  generationId: string | null,
) {
  try {
    if (!generationId) return true

    const key = recoveryKey(userId, tripId)
    const serialized = window.localStorage.getItem(key)
    if (serialized === null) return true

    const current = recoveryRecordSchema.safeParse(JSON.parse(serialized))
    if (current.success && current.data.generationId === generationId)
      window.localStorage.removeItem(key)

    return true
  } catch {
    return false
  }
}
