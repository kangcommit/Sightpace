import { ChevronDown } from 'lucide-react'
import type { MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { DayScheduleResult } from '@/lib/scheduling'
import type { EditorDay } from '../trip-editor-utils'
import { formatTime, toTime } from '../trip-editor-utils'

export function TripEditorScheduleSummary({
  day,
  schedule,
  onReviewIssue,
}: {
  day: EditorDay
  schedule: DayScheduleResult
  onReviewIssue: (targetId: string) => void
}) {
  const activitiesByKey = new Map(day.activities.map((activity) => [activity.key, activity]))
  const issues: Array<{ key: string; description: string; targetId: string }> = []

  for (const entry of schedule.entries) {
    const activity = activitiesByKey.get(entry.activityId)
    if (!activity) continue

    if (entry.waitMinutes > 0 && entry.intendedBookingStartMinute !== null) {
      issues.push({
        key: `wait-${activity.key}`,
        description: `Arrive ${formatTime(entry.arrivalMinute)} · wait ${entry.waitMinutes} min · booking ${toTime(entry.intendedBookingStartMinute)}.`,
        targetId: `activity-${activity.key}`,
      })
    }

    if (entry.lateMinutes > 0 && entry.intendedBookingStartMinute !== null) {
      issues.push({
        key: `late-${activity.key}`,
        description: `Booked ${toTime(entry.intendedBookingStartMinute)} · projected arrival ${formatTime(entry.arrivalMinute)} · ${entry.lateMinutes} min late.`,
        targetId: `activity-${activity.key}`,
      })
    }
  }

  for (const pair of schedule.warnings.missingTravelPairs) {
    const from = activitiesByKey.get(pair.fromActivityId)
    const to = activitiesByKey.get(pair.toActivityId)
    if (!from || !to) continue

    issues.push({
      key: `travel-${from.key}-${to.key}`,
      description: `Travel time not set: ${from.title} to ${to.title}.`,
      targetId: `travel-${from.key}-${to.key}`,
    })
  }

  const lastActivity = day.activities.at(-1)
  if (schedule.summary.overrunMinutes > 0 && lastActivity) {
    issues.push({
      key: 'day-overrun',
      description: `Projected finish ${formatTime(schedule.summary.projectedFinishMinute)} · ${schedule.summary.overrunMinutes} min after your day ends.`,
      targetId: `activity-${lastActivity.key}`,
    })
  }

  const nextDayEntry = schedule.entries.find((entry) => entry.projectedEndMinute >= 1440)
  if (schedule.warnings.nextDayProjection && nextDayEntry) {
    const activity = activitiesByKey.get(nextDayEntry.activityId)
    if (activity) {
      issues.push({
        key: 'next-day',
        description: `This plan extends into the next day at ${formatTime(nextDayEntry.projectedEndMinute)}. Overnight planning isn’t supported.`,
        targetId: `activity-${activity.key}`,
      })
    }
  }

  function handleReviewIssue(event: MouseEvent<HTMLButtonElement>) {
    const targetId = event.currentTarget.dataset.targetId
    if (targetId) onReviewIssue(targetId)
  }

  return (
    <section
      aria-label="Day schedule summary"
      className="bg-secondary/60 flex flex-col gap-2 rounded-xl p-4 sm:p-5"
    >
      <p>
        Projected finish {formatTime(schedule.summary.projectedFinishMinute)} · day finishes{' '}
        {toTime(day.finishMinute)}
        {schedule.summary.overrunMinutes
          ? ` · ${schedule.summary.overrunMinutes} min after your day ends`
          : ''}
      </p>
      {issues.length === 0 ? <p>No timing conflicts found with your estimates.</p> : null}
      {schedule.warnings.missingTravelPairs.length ? (
        <p className="text-warning">
          {schedule.warnings.missingTravelPairs.length} travel estimate
          {schedule.warnings.missingTravelPairs.length === 1 ? '' : 's'} not set. Later times use 0
          min until you add an estimate.
        </p>
      ) : null}
      {schedule.warnings.nextDayProjection ? (
        <p className="text-warning">
          This plan extends into the next day. Overnight planning isn’t supported.
        </p>
      ) : null}
      {issues.length > 0 ? (
        <Collapsible className="flex flex-col gap-2">
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                className="group/issue-trigger min-h-11 w-full justify-start gap-2 px-2 font-medium"
              />
            }
          >
            Review {issues.length} timing {issues.length === 1 ? 'issue' : 'issues'}
            <ChevronDown
              aria-hidden="true"
              data-icon="inline-end"
              className="transition-transform group-data-panel-open/issue-trigger:rotate-180"
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="flex flex-col gap-2">
              {issues.map((issue) => (
                <li key={issue.key}>
                  <Button
                    type="button"
                    variant="ghost"
                    data-target-id={issue.targetId}
                    className="h-auto min-h-11 justify-start px-2 py-2 text-left font-normal whitespace-normal"
                    onClick={handleReviewIssue}
                  >
                    {issue.description}
                  </Button>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </section>
  )
}
