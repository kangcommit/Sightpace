import { expect, it } from 'vitest'
import { calculateDaySchedule } from '@/lib/scheduling'

it('recalculates a 100-stop day within the proposed 50 ms target', () => {
  // Arrange
  const activities = Array.from({ length: 100 }, (_, index) => ({
    id: `activity-${index}`,
    durationMinutes: 45,
    fixedStartMinute: null,
  }))
  const travelEstimates = activities.slice(1).map((activity, index) => ({
    fromActivityId: activities[index].id,
    toActivityId: activity.id,
    minutes: 10,
  }))
  const input = { startMinute: 540, finishMinute: 1080, activities, travelEstimates }

  // Act
  for (let index = 0; index < 5; index += 1) calculateDaySchedule(input)
  const durations: number[] = []
  let result = calculateDaySchedule(input)

  for (let index = 0; index < 15; index += 1) {
    const start = performance.now()
    result = calculateDaySchedule(input)
    durations.push(performance.now() - start)
  }

  const median = durations.sort((left, right) => left - right)[Math.floor(durations.length / 2)]
  console.info(`100-stop scheduling median: ${median.toFixed(3)} ms`)

  // Assert
  expect(result.entries).toHaveLength(100)
  expect(median).toBeLessThan(50)
})
