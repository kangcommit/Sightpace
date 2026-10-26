'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { saveTrip } from '@/lib/trip-transactions'
import { tripEditorDraftSchema } from '../editor/editor-contract'

const requestSchema = z.strictObject({
  tripId: z.uuid(),
  mutationId: z.uuid(),
  expectedRevision: z.number().int().positive(),
  snapshot: tripEditorDraftSchema,
})

export type SaveTripEditorResult =
  | { ok: true; revision: number; ids: Record<string, string> }
  | {
      ok: false
      code:
        | 'UNAUTHENTICATED'
        | 'VALIDATION_ERROR'
        | 'NOT_FOUND'
        | 'CONFLICT'
        | 'TEMPORARILY_UNAVAILABLE'
      message: string
    }

export async function saveTripEditorAction(input: unknown): Promise<SaveTripEditorResult> {
  let user: Awaited<ReturnType<typeof requireUser>>
  try {
    user = await requireUser()
  } catch {
    return {
      ok: false,
      code: 'TEMPORARILY_UNAVAILABLE',
      message:
        'We couldn’t confirm your session. Your changes are still here; reload before saving again.',
    }
  }

  if (!user.ok)
    return { ok: false, code: 'UNAUTHENTICATED', message: 'Sign in to save your changes.' }

  const parsed = requestSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Check the highlighted fields and try again.',
    }

  const ids: Record<string, string> = {}
  const snapshot = {
    title: parsed.data.snapshot.title,
    destination: parsed.data.snapshot.destination,
    days: parsed.data.snapshot.days.map((day) => {
      const dayId = day.id ?? randomUUID()
      ids[day.key] = dayId
      const activityIds = new Map(
        day.activities.map((activity) => {
          const id = activity.id ?? randomUUID()
          ids[activity.key] = id
          return [activity.key, id] as const
        }),
      )
      const activityId = (key: string) => {
        const id = activityIds.get(key)

        if (!id) throw new Error('Invalid travel reference')

        return id
      }

      return {
        id: dayId,
        date: day.date,
        startMinute: day.startMinute,
        finishMinute: day.finishMinute,
        activities: day.activities.map((activity) => ({
          id: activityId(activity.key),
          title: activity.title.trim(),
          placeLabel: activity.placeLabel.trim() || null,
          durationMinutes: activity.durationMinutes,
          fixedStartMinute: activity.fixedStartMinute,
        })),
        travelEstimates: day.travelEstimates.map((travel) => ({
          fromActivityId: activityId(travel.fromKey),
          toActivityId: activityId(travel.toKey),
          minutes: travel.minutes,
        })),
      }
    }),
  }

  const result = await saveTrip(prisma, user.data.id, {
    tripId: parsed.data.tripId,
    mutationId: parsed.data.mutationId,
    expectedRevision: parsed.data.expectedRevision,
    snapshot,
  })

  if (!result.ok)
    return {
      ok: false,
      code:
        result.error.code === 'IDEMPOTENCY_CONFLICT'
          ? 'CONFLICT'
          : result.error.code === 'CONFLICT'
            ? 'CONFLICT'
            : result.error.code === 'NOT_FOUND'
              ? 'NOT_FOUND'
              : result.error.code === 'VALIDATION_ERROR'
                ? 'VALIDATION_ERROR'
                : result.error.code === 'UNAUTHENTICATED'
                  ? 'UNAUTHENTICATED'
                  : 'TEMPORARILY_UNAVAILABLE',
      message:
        result.error.code === 'CONFLICT' || result.error.code === 'IDEMPOTENCY_CONFLICT'
          ? 'This trip changed since you opened it. Reload before saving again; your edits are still here.'
          : result.error.code === 'NOT_FOUND'
            ? 'This trip is no longer available.'
            : result.error.code === 'VALIDATION_ERROR'
              ? 'Check the highlighted fields and try again.'
              : 'We couldn’t confirm whether the trip saved. Reload to check before saving again; your edits are still here.',
    }

  revalidatePath(`/trips/${parsed.data.tripId}`)
  return { ok: true, revision: result.data.revision, ids }
}
