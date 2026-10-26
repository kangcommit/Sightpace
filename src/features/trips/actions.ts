'use server'

import { redirect, unstable_rethrow } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { appRoutes } from '@/lib/routes'
import { requireUser } from '@/lib/session'
import { createTrip, deleteTrip } from '@/lib/trip-transactions'
import { isFirstDayDateAllowed } from './date-rules'

const uuid = z.uuid()
const clockPattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number)

  return hours * 60 + minutes
}

const startTime = z
  .string()
  .regex(clockPattern, 'Enter a valid start time.')
  .refine((value) => minutesFromTime(value) <= 1438, 'Choose a start time before 23:59.')
const finishTime = z
  .string()
  .regex(clockPattern, 'Enter a valid finish time.')
  .refine((value) => minutesFromTime(value) >= 1, 'Choose a finish time after 00:00.')

const createFields = z
  .strictObject({
    mutationId: uuid,
    title: z.string().trim().min(1, 'Enter a trip name.').max(120, 'Use 120 characters or fewer.'),
    destination: z
      .string()
      .trim()
      .min(1, 'Enter a destination label.')
      .max(120, 'Use 120 characters or fewer.'),
    date: z.iso
      .date('Enter a valid first day.')
      .refine((date) => isFirstDayDateAllowed(date), 'Choose today or a future date.'),
    startTime,
    finishTime,
  })
  .superRefine((values, context) => {
    if (
      clockPattern.test(values.startTime) &&
      clockPattern.test(values.finishTime) &&
      minutesFromTime(values.finishTime) <= minutesFromTime(values.startTime)
    )
      context.addIssue({
        code: 'custom',
        path: ['finishTime'],
        message: 'Finish time must be later than start time.',
      })
  })

export type CreateTripState = {
  values: {
    mutationId: string
    title: string
    destination: string
    date: string
    startTime: string
    finishTime: string
  }
  errors: Partial<Record<'title' | 'destination' | 'date' | 'startTime' | 'finishTime', string>>
  message: string | null
}

export type DeleteTripState = { message: string | null }

function formString(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

function hasOnlyFields(formData: FormData, allowed: string[]) {
  const seen = new Set<string>()

  for (const [key] of formData.entries()) {
    if (!allowed.includes(key) || seen.has(key)) return false
    seen.add(key)
  }

  return true
}

export async function createTripAction(
  previous: CreateTripState,
  formData: FormData,
): Promise<CreateTripState> {
  const values = {
    mutationId: formString(formData, 'mutationId'),
    title: formString(formData, 'title'),
    destination: formString(formData, 'destination'),
    date: formString(formData, 'date'),
    startTime: formString(formData, 'startTime'),
    finishTime: formString(formData, 'finishTime'),
  }

  let user: Awaited<ReturnType<typeof requireUser>>
  try {
    user = await requireUser()
  } catch {
    return {
      values: {
        ...previous.values,
        title: values.title,
        destination: values.destination,
        date: values.date,
        startTime: values.startTime,
        finishTime: values.finishTime,
      },
      errors: {},
      message: 'We couldn’t confirm you’re signed in. Please try again.',
    }
  }

  if (!user.ok) return { values, errors: {}, message: 'Sign in to create a trip.' }

  if (
    !hasOnlyFields(formData, [
      'mutationId',
      'title',
      'destination',
      'date',
      'startTime',
      'finishTime',
    ])
  )
    return {
      values: {
        ...previous.values,
        title: values.title,
        destination: values.destination,
        date: values.date,
        startTime: values.startTime,
        finishTime: values.finishTime,
      },
      errors: {},
      message: 'Something went wrong. Refresh the form and try again.',
    }

  const parsed = createFields.safeParse(values)

  if (!parsed.success) {
    const flattened = z.flattenError(parsed.error).fieldErrors

    return {
      values: {
        ...previous.values,
        title: values.title,
        destination: values.destination,
        date: values.date,
        startTime: values.startTime,
        finishTime: values.finishTime,
      },
      errors: {
        title: flattened.title?.[0],
        destination: flattened.destination?.[0],
        date: flattened.date?.[0],
        startTime: flattened.startTime?.[0],
        finishTime: flattened.finishTime?.[0],
      },
      message: 'Check the highlighted fields and try again.',
    }
  }

  try {
    const result = await createTrip(prisma, user.data.id, {
      mutationId: parsed.data.mutationId,
      title: parsed.data.title,
      destination: parsed.data.destination,
      days: [
        {
          date: parsed.data.date,
          startMinute: minutesFromTime(parsed.data.startTime),
          finishMinute: minutesFromTime(parsed.data.finishTime),
        },
      ],
    })

    if (!result.ok) return { values, errors: {}, message: result.error.message }

    redirect(appRoutes.trip(result.data.tripId))
  } catch (error) {
    unstable_rethrow(error)

    return { values, errors: {}, message: 'We couldn’t create this trip. Please try again.' }
  }
}

export async function deleteTripAction(
  _previous: DeleteTripState,
  formData: FormData,
): Promise<DeleteTripState> {
  const tripId = formString(formData, 'tripId')
  const mutationId = formString(formData, 'mutationId')
  const expectedRevision = Number(formString(formData, 'revision'))

  let user: Awaited<ReturnType<typeof requireUser>>
  try {
    user = await requireUser()
  } catch {
    return { message: 'We couldn’t confirm you’re signed in. Please try again.' }
  }

  if (!user.ok) return { message: 'Sign in to delete this trip.' }

  if (!hasOnlyFields(formData, ['tripId', 'mutationId', 'revision']))
    return { message: 'Something went wrong. Refresh your trips and try again.' }

  if (
    !uuid.safeParse(tripId).success ||
    !uuid.safeParse(mutationId).success ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 1
  )
    return { message: 'We couldn’t delete this trip. Refresh your trips and try again.' }

  try {
    const result = await deleteTrip(prisma, user.data.id, {
      tripId,
      mutationId,
      expectedRevision,
    })

    if (!result.ok) {
      return {
        message:
          result.error.code === 'CONFLICT'
            ? 'This trip has changed since you opened the delete prompt. Refresh your trips and try again.'
            : result.error.message,
      }
    }

    redirect(appRoutes.trips)
  } catch (error) {
    unstable_rethrow(error)

    return { message: 'We couldn’t delete this trip. It’s still in your trips. Please try again.' }
  }
}
