'use server'

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { createSampleCopy } from '@/lib/trip-transactions'
import { tripEditorDraftSchema } from '../editor/editor-contract'

const requestSchema = z.strictObject({ mutationId: z.uuid(), snapshot: tripEditorDraftSchema })

export type CreateSampleCopyResult =
  | { ok: true; tripId: string }
  | {
      ok: false
      code:
        | 'UNAUTHENTICATED'
        | 'VALIDATION_ERROR'
        | 'IDEMPOTENCY_CONFLICT'
        | 'TEMPORARILY_UNAVAILABLE'
      message: string
    }

export async function createSampleCopyAction(input: unknown): Promise<CreateSampleCopyResult> {
  let user: Awaited<ReturnType<typeof requireUser>>
  try {
    user = await requireUser()
  } catch {
    return {
      ok: false,
      code: 'TEMPORARILY_UNAVAILABLE',
      message: 'We couldn’t confirm your session. Your sample is still here; try again.',
    }
  }
  if (!user.ok) return { ok: false, code: 'UNAUTHENTICATED', message: 'Sign in to save a copy.' }

  const parsed = requestSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Check the trip details and try again.' }

  const { mutationId, snapshot } = parsed.data
  const result = await createSampleCopy(prisma, user.data.id, {
    mutationId,
    title: snapshot.title.trim(),
    destination: snapshot.destination.trim(),
    days: snapshot.days.map((day) => ({
      key: day.key,
      date: day.date,
      startMinute: day.startMinute,
      finishMinute: day.finishMinute,
      activities: day.activities.map(
        ({ key, title, placeLabel, durationMinutes, fixedStartMinute }) => ({
          key,
          title: title.trim(),
          placeLabel: placeLabel.trim(),
          durationMinutes,
          fixedStartMinute,
        }),
      ),
      travelEstimates: day.travelEstimates,
    })),
  })

  if (result.ok) return { ok: true, tripId: result.data.tripId }
  return {
    ok: false,
    code:
      result.error.code === 'IDEMPOTENCY_CONFLICT'
        ? 'IDEMPOTENCY_CONFLICT'
        : result.error.code === 'VALIDATION_ERROR'
          ? 'VALIDATION_ERROR'
          : 'TEMPORARILY_UNAVAILABLE',
    message: result.error.message,
  }
}
