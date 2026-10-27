import { z } from 'zod'
import { isDateTodayOrLater } from '../shared/date-rules'

const minute = z.number().int()
const uuid = z.uuid().optional()

export const tripEditorRecoveryDraftSchema = z.strictObject({
  title: z.string().max(120),
  destination: z.string().max(120),
  days: z
    .array(
      z.strictObject({
        key: z.string().min(1).max(80),
        id: uuid,
        date: z.union([z.iso.date(), z.literal('')]),
        startMinute: minute.min(0).max(1439),
        finishMinute: minute.min(0).max(1439),
        activities: z
          .array(
            z.strictObject({
              key: z.string().min(1).max(80),
              id: uuid,
              title: z.string().max(120),
              placeLabel: z.string().max(200),
              durationMinutes: minute.min(1).max(1439),
              fixedStartMinute: minute.min(0).max(1439).nullable(),
            }),
          )
          .max(100),
        travelEstimates: z
          .array(
            z.strictObject({
              fromKey: z.string().min(1).max(80),
              toKey: z.string().min(1).max(80),
              minutes: minute.min(0).max(1439),
            }),
          )
          .max(1000),
      }),
    )
    .max(30),
})

export const tripEditorDraftSchema = tripEditorRecoveryDraftSchema
  .superRefine((draft, context) => {
    if (draft.title.trim().length === 0)
      context.addIssue({ code: 'custom', path: ['title'], message: 'Enter a trip name.' })

    if (draft.destination.trim().length === 0)
      context.addIssue({
        code: 'custom',
        path: ['destination'],
        message: 'Enter a destination label.',
      })

    const dates = new Set<string>()
    const dayIds = new Set<string>()
    const activityIds = new Set<string>()
    const allKeys = new Set<string>()

    for (const [dayIndex, day] of draft.days.entries()) {
      if (
        day.startMinute >= day.finishMinute ||
        dates.has(day.date) ||
        (day.id && dayIds.has(day.id)) ||
        allKeys.has(day.key)
      )
        context.addIssue({
          code: 'custom',
          path: ['days', dayIndex],
          message: 'Check the day date and hours.',
        })
      dates.add(day.date)
      allKeys.add(day.key)
      if (day.id) dayIds.add(day.id)

      if (!isDateTodayOrLater(day.date))
        context.addIssue({
          code: 'custom',
          path: ['days', dayIndex, 'date'],
          message: 'Choose today or a future date.',
        })

      const keys = new Set<string>()
      for (const [activityIndex, activity] of day.activities.entries()) {
        if (activity.title.trim().length === 0)
          context.addIssue({
            code: 'custom',
            path: ['days', dayIndex, 'activities', activityIndex, 'title'],
            message: 'Enter an activity name.',
          })

        if (
          keys.has(activity.key) ||
          allKeys.has(activity.key) ||
          (activity.id && activityIds.has(activity.id))
        )
          context.addIssue({
            code: 'custom',
            path: ['days', dayIndex],
            message: 'Activities must be unique.',
          })
        keys.add(activity.key)
        allKeys.add(activity.key)
        if (activity.id) activityIds.add(activity.id)
      }

      const pairs = new Set<string>()
      for (const estimate of day.travelEstimates) {
        const pair = `${estimate.fromKey}\u0000${estimate.toKey}`
        if (
          estimate.fromKey === estimate.toKey ||
          !keys.has(estimate.fromKey) ||
          !keys.has(estimate.toKey) ||
          pairs.has(pair)
        )
          context.addIssue({
            code: 'custom',
            path: ['days', dayIndex],
            message: 'Travel estimates must connect two activities on this day.',
          })
        pairs.add(pair)
      }
    }
  })
  .transform((draft) => ({
    ...draft,
    title: draft.title.trim(),
    destination: draft.destination.trim(),
    days: draft.days.map((day) => ({
      ...day,
      activities: day.activities.map((activity) => ({
        ...activity,
        title: activity.title.trim(),
        placeLabel: activity.placeLabel.trim(),
      })),
    })),
  }))

export type TripEditorDraft = z.infer<typeof tripEditorRecoveryDraftSchema>
