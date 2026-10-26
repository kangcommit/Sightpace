import { expect, it } from 'vitest'
import { tripEditorDraftSchema } from '@/features/trips/editor/editor-contract'
import { todayDate } from '@/features/trips/shared/date-rules'

const activityA = 'a0000000-0000-4000-8000-000000000001'
const activityB = 'a0000000-0000-4000-8000-000000000002'
const currentDate = todayDate()

function pastDate() {
  const date = new Date(`${currentDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

it('accepts confirmed zero travel and preserves a missing estimate as distinct', () => {
  // Arrange
  const draft = {
    title: 'Lisbon week',
    destination: 'Lisbon',
    days: [
      {
        key: 'day-1',
        date: currentDate,
        startMinute: 540,
        finishMinute: 1080,
        activities: [
          {
            key: activityA,
            title: 'Museum',
            placeLabel: '',
            durationMinutes: 60,
            fixedStartMinute: null,
          },
          {
            key: activityB,
            title: 'Lunch',
            placeLabel: '',
            durationMinutes: 45,
            fixedStartMinute: 720,
          },
        ],
        travelEstimates: [{ fromKey: activityA, toKey: activityB, minutes: 0 }],
      },
    ],
  }

  // Act
  const parsed = tripEditorDraftSchema.safeParse(draft)

  // Assert
  expect(parsed.success).toBe(true)
  if (parsed.success) expect(parsed.data.days[0].travelEstimates[0].minutes).toBe(0)
})

it.each([
  [
    'duplicate date',
    {
      days: [
        {
          key: 'day-1',
          date: currentDate,
          startMinute: 540,
          finishMinute: 1080,
          activities: [],
          travelEstimates: [],
        },
        {
          key: 'day-2',
          date: currentDate,
          startMinute: 540,
          finishMinute: 1080,
          activities: [],
          travelEstimates: [],
        },
      ],
    },
  ],
  [
    'invalid interval',
    {
      days: [
        {
          key: 'day-1',
          date: currentDate,
          startMinute: 1080,
          finishMinute: 540,
          activities: [],
          travelEstimates: [],
        },
      ],
    },
  ],
  [
    'fractional duration',
    {
      days: [
        {
          key: 'day-1',
          date: currentDate,
          startMinute: 540,
          finishMinute: 1080,
          activities: [
            {
              key: activityA,
              title: 'Museum',
              placeLabel: '',
              durationMinutes: 60.5,
              fixedStartMinute: null,
            },
          ],
          travelEstimates: [],
        },
      ],
    },
  ],
  [
    'forged travel endpoint',
    {
      days: [
        {
          key: 'day-1',
          date: currentDate,
          startMinute: 540,
          finishMinute: 1080,
          activities: [
            {
              key: activityA,
              title: 'Museum',
              placeLabel: '',
              durationMinutes: 60,
              fixedStartMinute: null,
            },
          ],
          travelEstimates: [{ fromKey: activityA, toKey: activityB, minutes: 0 }],
        },
      ],
    },
  ],
])('rejects %s before a save request is sent', (_name, patch) => {
  // Arrange
  const draft = {
    title: 'Lisbon week',
    destination: 'Lisbon',
    ...patch,
  }

  // Act
  const parsed = tripEditorDraftSchema.safeParse(draft)

  // Assert
  expect(parsed.success).toBe(false)
})

it('rejects a day dated before the current UTC date', () => {
  // Arrange
  const draft = {
    title: 'Lisbon week',
    destination: 'Lisbon',
    days: [
      {
        key: 'day-1',
        date: pastDate(),
        startMinute: 540,
        finishMinute: 1080,
        activities: [],
        travelEstimates: [],
      },
    ],
  }

  // Act
  const parsed = tripEditorDraftSchema.safeParse(draft)

  // Assert
  expect(parsed.success).toBe(false)
  if (!parsed.success) expect(parsed.error.issues[0].message).toBe('Choose today or a future date.')
})
