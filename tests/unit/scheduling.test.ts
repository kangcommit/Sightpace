import { describe, expect, it } from 'vitest'
import { type CalculateDayScheduleInput, calculateDaySchedule } from '@/lib/scheduling'

function input(overrides: Partial<CalculateDayScheduleInput> = {}): CalculateDayScheduleInput {
  return {
    startMinute: 540,
    finishMinute: 1080,
    activities: [],
    travelEstimates: [],
    ...overrides,
  }
}

function activity(id: string, durationMinutes: number, fixedStartMinute: number | null = null) {
  return { id, durationMinutes, fixedStartMinute }
}

describe('calculateDaySchedule', () => {
  it('keeps booking time fixed while projecting late attendance and downstream delay', () => {
    // Arrange
    const day = input({
      activities: [activity('breakfast', 45), activity('museum', 90), activity('lunch', 60, 720)],
      travelEstimates: [
        { fromActivityId: 'breakfast', toActivityId: 'museum', minutes: 20 },
        { fromActivityId: 'museum', toActivityId: 'lunch', minutes: 30 },
      ],
    })

    // Act
    const result = calculateDaySchedule(day)

    // Assert
    expect(result.entries).toEqual([
      expect.objectContaining({
        activityId: 'breakfast',
        arrivalMinute: 540,
        projectedEndMinute: 585,
      }),
      expect.objectContaining({
        activityId: 'museum',
        arrivalMinute: 605,
        projectedEndMinute: 695,
      }),
      expect.objectContaining({
        activityId: 'lunch',
        arrivalMinute: 725,
        intendedBookingStartMinute: 720,
        intendedBookingEndMinute: 780,
        projectedStartMinute: 725,
        projectedEndMinute: 785,
        waitMinutes: 0,
        lateMinutes: 5,
      }),
    ])
    expect(result.summary).toEqual({ projectedFinishMinute: 785, overrunMinutes: 0 })
  })

  it('reports waiting before an early booking and no wait or lateness at an exact arrival', () => {
    // Arrange
    const day = input({
      activities: [
        activity('breakfast', 45),
        activity('early-lunch', 60, 720),
        activity('museum', 75),
        activity('exact-lunch', 60, 900),
      ],
      travelEstimates: [
        { fromActivityId: 'breakfast', toActivityId: 'early-lunch', minutes: 20 },
        { fromActivityId: 'early-lunch', toActivityId: 'museum', minutes: 30 },
        { fromActivityId: 'museum', toActivityId: 'exact-lunch', minutes: 15 },
      ],
    })

    // Act
    const result = calculateDaySchedule(day)

    // Assert
    expect(result.entries[1]).toMatchObject({
      arrivalMinute: 605,
      projectedStartMinute: 720,
      waitMinutes: 115,
      lateMinutes: 0,
    })
    expect(result.entries[3]).toMatchObject({
      arrivalMinute: 900,
      projectedStartMinute: 900,
      waitMinutes: 0,
      lateMinutes: 0,
    })
  })

  it('propagates a late booking attendance into following bookings', () => {
    // Arrange
    const day = input({
      activities: [activity('first-booking', 60, 600), activity('second-booking', 60, 630)],
      travelEstimates: [
        { fromActivityId: 'first-booking', toActivityId: 'second-booking', minutes: 0 },
      ],
    })

    // Act
    const result = calculateDaySchedule(day)

    // Assert
    expect(result.entries[0]).toMatchObject({
      intendedBookingStartMinute: 600,
      projectedStartMinute: 600,
      projectedEndMinute: 660,
    })
    expect(result.entries[1]).toMatchObject({
      arrivalMinute: 660,
      intendedBookingStartMinute: 630,
      projectedStartMinute: 660,
      lateMinutes: 30,
      projectedEndMinute: 720,
    })
  })

  it('distinguishes unknown travel from confirmed zero and keeps downstream times provisional', () => {
    // Arrange
    const day = input({
      activities: [activity('a', 20), activity('b', 20), activity('c', 20)],
      travelEstimates: [{ fromActivityId: 'b', toActivityId: 'c', minutes: 0 }],
    })

    // Act
    const result = calculateDaySchedule(day)

    // Assert
    expect(result.entries.map(({ provisional }) => provisional)).toEqual([false, true, true])
    expect(result.entries[2].arrivalMinute).toBe(result.entries[1].projectedEndMinute)
    expect(result.warnings.missingTravelPairs).toEqual([
      { fromActivityId: 'a', toActivityId: 'b', assumedMinutes: 0 },
    ])
  })

  it('uses only directional estimates for the current adjacent order and restores saved pairs on reorder', () => {
    // Arrange
    const activities = [activity('a', 10), activity('b', 10), activity('c', 10)]
    const travelEstimates = [
      { fromActivityId: 'a', toActivityId: 'b', minutes: 20 },
      { fromActivityId: 'b', toActivityId: 'c', minutes: 30 },
      { fromActivityId: 'c', toActivityId: 'a', minutes: 40 },
    ]
    const originalOrder = input({ activities, travelEstimates })
    const reordered = input({
      activities: [activities[0], activities[2], activities[1]],
      travelEstimates,
    })

    // Act
    const originalResult = calculateDaySchedule(originalOrder)
    const reorderedResult = calculateDaySchedule(reordered)
    const restoredResult = calculateDaySchedule(input({ activities, travelEstimates }))

    // Assert
    expect(originalResult.entries.map(({ arrivalMinute }) => arrivalMinute)).toEqual([
      540, 570, 610,
    ])
    expect(reorderedResult.warnings.missingTravelPairs).toEqual([
      { fromActivityId: 'a', toActivityId: 'c', assumedMinutes: 0 },
      { fromActivityId: 'c', toActivityId: 'b', assumedMinutes: 0 },
    ])
    expect(reorderedResult.entries.map(({ provisional }) => provisional)).toEqual([
      false,
      true,
      true,
    ])
    expect(restoredResult.entries).toEqual(originalResult.entries)
  })

  it('reports no overrun at finish equality and does not wrap projections at midnight', () => {
    // Arrange
    const atFinish = input({
      finishMinute: 570,
      activities: [activity('last-stop', 30)],
    })
    const crossingMidnight = input({
      startMinute: 1430,
      finishMinute: 1439,
      activities: [activity('late-stop', 10)],
    })

    // Act
    const finishResult = calculateDaySchedule(atFinish)
    const crossingResult = calculateDaySchedule(crossingMidnight)

    // Assert
    expect(finishResult.summary).toEqual({ projectedFinishMinute: 570, overrunMinutes: 0 })
    expect(crossingResult.entries[0].projectedEndMinute).toBe(1440)
    expect(crossingResult.summary).toEqual({ projectedFinishMinute: 1440, overrunMinutes: 1 })
    expect(crossingResult.warnings.nextDayProjection).toBe(true)
  })

  it('retains a booking before day start and reports it late instead of moving it', () => {
    // Arrange
    const day = input({ activities: [activity('early-booking', 30, 480)] })

    // Act
    const result = calculateDaySchedule(day)

    // Assert
    expect(result.entries[0]).toMatchObject({
      arrivalMinute: 540,
      intendedBookingStartMinute: 480,
      intendedBookingEndMinute: 510,
      projectedStartMinute: 540,
      lateMinutes: 60,
    })
  })

  it('handles an empty day without adding conflicts or mutating its inputs', () => {
    // Arrange
    const day = input()

    // Act
    const result = calculateDaySchedule(day)

    // Assert
    expect(result).toEqual({
      entries: [],
      summary: { projectedFinishMinute: 540, overrunMinutes: 0 },
      warnings: { missingTravelPairs: [], nextDayProjection: false },
    })
    expect(day).toEqual(input())
  })
})
