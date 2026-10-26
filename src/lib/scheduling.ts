interface ScheduleActivityInput {
  id: string
  durationMinutes: number
  fixedStartMinute: number | null
}

interface ScheduleTravelInput {
  fromActivityId: string
  toActivityId: string
  minutes: number
}

export interface CalculateDayScheduleInput {
  startMinute: number
  finishMinute: number
  activities: readonly ScheduleActivityInput[]
  travelEstimates: readonly ScheduleTravelInput[]
}

interface ScheduledActivity {
  activityId: string
  arrivalMinute: number
  projectedStartMinute: number
  projectedEndMinute: number
  intendedBookingStartMinute: number | null
  intendedBookingEndMinute: number | null
  waitMinutes: number
  lateMinutes: number
  provisional: boolean
}

export interface DayScheduleResult {
  entries: ScheduledActivity[]
  summary: {
    projectedFinishMinute: number
    overrunMinutes: number
  }
  warnings: {
    missingTravelPairs: Array<{
      fromActivityId: string
      toActivityId: string
      assumedMinutes: 0
    }>
    nextDayProjection: boolean
  }
}

function pairKey(fromActivityId: string, toActivityId: string) {
  return `${fromActivityId}\u0000${toActivityId}`
}

export function calculateDaySchedule(input: CalculateDayScheduleInput): DayScheduleResult {
  const travelByPair = new Map(
    input.travelEstimates.map((estimate) => [
      pairKey(estimate.fromActivityId, estimate.toActivityId),
      estimate.minutes,
    ]),
  )
  const entries: ScheduledActivity[] = []
  const missingTravelPairs: DayScheduleResult['warnings']['missingTravelPairs'] = []
  let cursorMinute = input.startMinute
  let provisional = false

  for (const [index, activity] of input.activities.entries()) {
    let travelMinutes = 0

    if (index > 0) {
      const fromActivityId = input.activities[index - 1].id
      const knownTravel = travelByPair.get(pairKey(fromActivityId, activity.id))

      if (knownTravel === undefined) {
        provisional = true
        missingTravelPairs.push({ fromActivityId, toActivityId: activity.id, assumedMinutes: 0 })
      } else {
        travelMinutes = knownTravel
      }
    }

    const arrivalMinute = cursorMinute + travelMinutes
    const fixedStartMinute = activity.fixedStartMinute
    const projectedStartMinute =
      fixedStartMinute === null ? arrivalMinute : Math.max(arrivalMinute, fixedStartMinute)
    const projectedEndMinute = projectedStartMinute + activity.durationMinutes

    entries.push({
      activityId: activity.id,
      arrivalMinute,
      projectedStartMinute,
      projectedEndMinute,
      intendedBookingStartMinute: fixedStartMinute,
      intendedBookingEndMinute:
        fixedStartMinute === null ? null : fixedStartMinute + activity.durationMinutes,
      waitMinutes: fixedStartMinute === null ? 0 : Math.max(0, fixedStartMinute - arrivalMinute),
      lateMinutes: fixedStartMinute === null ? 0 : Math.max(0, arrivalMinute - fixedStartMinute),
      provisional,
    })

    cursorMinute = projectedEndMinute
  }

  return {
    entries,
    summary: {
      projectedFinishMinute: cursorMinute,
      overrunMinutes: Math.max(0, cursorMinute - input.finishMinute),
    },
    warnings: {
      missingTravelPairs,
      nextDayProjection: cursorMinute >= 1440,
    },
  }
}
