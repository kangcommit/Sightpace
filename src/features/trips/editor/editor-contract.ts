import { z } from 'zod'
import { isDateTodayOrLater } from '../shared/date-rules'

const minute = z.number().int()
const uuid = z.uuid().optional()

export const tripEditorDraftSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(120),
    destination: z.string().trim().min(1).max(120),
    days: z
      .array(
        z.strictObject({
          key: z.string().min(1).max(80),
          id: uuid,
          date: z.iso.date().refine(isDateTodayOrLater, 'Choose today or a future date.'),
          startMinute: minute.min(0).max(1438),
          finishMinute: minute.min(1).max(1439),
          activities: z
            .array(
              z.strictObject({
                key: z.string().min(1).max(80),
                id: uuid,
                title: z.string().trim().min(1).max(120),
                placeLabel: z.string().trim().max(200),
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
  .superRefine((draft, context) => {
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

      const keys = new Set<string>()
      for (const activity of day.activities) {
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

export type TripEditorDraft = z.infer<typeof tripEditorDraftSchema>
