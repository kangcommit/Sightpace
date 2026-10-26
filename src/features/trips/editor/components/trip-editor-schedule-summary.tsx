import type { DayScheduleResult } from '@/lib/scheduling'
import { formatTime, toTime } from '../trip-editor-utils'

export function TripEditorScheduleSummary({
  schedule,
  finishMinute,
}: {
  schedule: DayScheduleResult
  finishMinute: number
}) {
  return (
    <section
      aria-label="Day schedule summary"
      className="bg-muted/50 flex flex-col gap-2 rounded-lg p-4"
    >
      <p>
        Projected finish {formatTime(schedule.summary.projectedFinishMinute)} · day finishes{' '}
        {toTime(finishMinute)}
        {schedule.summary.overrunMinutes
          ? ` · ${schedule.summary.overrunMinutes} min after your day ends`
          : ''}
      </p>
      {schedule.warnings.missingTravelPairs.length ? (
        <p className="text-amber-800 dark:text-amber-200">
          {schedule.warnings.missingTravelPairs.length} travel estimate
          {schedule.warnings.missingTravelPairs.length === 1 ? '' : 's'} not set. Later times use 0
          min until you add an estimate.
        </p>
      ) : null}
      {schedule.warnings.nextDayProjection ? (
        <p className="text-amber-800 dark:text-amber-200">
          This plan extends into the next day. Overnight planning isn’t supported.
        </p>
      ) : null}
    </section>
  )
}
