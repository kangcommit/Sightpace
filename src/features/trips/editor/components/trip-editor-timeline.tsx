import type { MouseEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import type { DayScheduleResult } from '@/lib/scheduling'
import type { EditorDay } from '../trip-editor-utils'
import { formatTime, toTime } from '../trip-editor-utils'

const pixelsPerMinute = 0.8
const minimumActivityHeight = 56
const minimumGapHeight = 22

type TimelineSegment =
  | {
      kind: 'activity'
      key: string
      title: string
      durationMinutes: number
      entry: DayScheduleResult['entries'][number]
      start: number
      end: number
    }
  | {
      kind: 'travel'
      key: string
      minutes: number | null
      start: number
      end: number
    }
  | {
      kind: 'wait'
      key: string
      minutes: number
      bookingMinute: number
      start: number
      end: number
    }

type PositionedSegment = TimelineSegment & { top: number; height: number; extraHeight: number }

export function TripEditorTimeline({
  day,
  schedule,
  onEditActivity,
}: {
  day: EditorDay
  schedule: DayScheduleResult
  onEditActivity: (activity: EditorDay['activities'][number]) => void
}) {
  const activityByKey = new Map(day.activities.map((activity) => [activity.key, activity]))
  const timelineValues = [
    day.startMinute,
    day.finishMinute,
    schedule.summary.projectedFinishMinute,
    ...schedule.entries.flatMap((entry) => [
      entry.arrivalMinute,
      entry.projectedStartMinute,
      entry.projectedEndMinute,
      ...(entry.intendedBookingStartMinute === null ? [] : [entry.intendedBookingStartMinute]),
    ]),
  ]
  const rangeStart = Math.max(0, Math.floor(Math.min(...timelineValues) / 60) * 60)
  const rangeEnd = Math.max(rangeStart + 60, Math.ceil(Math.max(...timelineValues) / 60) * 60)
  const rangeMinutes = rangeEnd - rangeStart
  const scale = Math.min(pixelsPerMinute, 720 / rangeMinutes)
  const tickInterval =
    rangeMinutes <= 18 * 60
      ? 30
      : rangeMinutes <= 36 * 60
        ? 60
        : rangeMinutes <= 7 * 1440
          ? 180
          : 720
  const firstTick = Math.ceil(rangeStart / tickInterval) * tickInterval
  const segments: TimelineSegment[] = []

  for (const [index, entry] of schedule.entries.entries()) {
    const activity = activityByKey.get(entry.activityId)
    if (!activity) continue

    if (index > 0) {
      const previous = schedule.entries[index - 1]
      const previousActivity = previous ? activityByKey.get(previous.activityId) : undefined
      const estimate = previousActivity
        ? day.travelEstimates.find(
            (item) => item.fromKey === previousActivity.key && item.toKey === activity.key,
          )
        : undefined

      segments.push({
        kind: 'travel',
        key: `travel-${previousActivity?.key ?? 'unknown'}-${activity.key}`,
        minutes: estimate?.minutes ?? null,
        start: previous?.projectedEndMinute ?? entry.arrivalMinute,
        end: entry.arrivalMinute,
      })
    }

    if (entry.waitMinutes > 0 && entry.intendedBookingStartMinute !== null) {
      segments.push({
        kind: 'wait',
        key: `wait-${activity.key}`,
        minutes: entry.waitMinutes,
        bookingMinute: entry.intendedBookingStartMinute,
        start: entry.arrivalMinute,
        end: entry.projectedStartMinute,
      })
    }

    segments.push({
      kind: 'activity',
      key: activity.key,
      title: activity.title,
      durationMinutes: activity.durationMinutes,
      entry,
      start: entry.projectedStartMinute,
      end: entry.projectedEndMinute,
    })
  }

  let totalExtraHeight = 0
  const positionedSegments: PositionedSegment[] = segments.map((segment) => {
    const elapsedHeight = (segment.end - segment.start) * scale
    const contentHeight =
      segment.kind === 'activity'
        ? Math.max(minimumActivityHeight, activityContentHeight(segment.entry))
        : minimumGapHeight
    const height = Math.max(contentHeight, elapsedHeight)
    const extraHeight = height - elapsedHeight
    const top = (segment.start - rangeStart) * scale + totalExtraHeight
    totalExtraHeight += extraHeight

    return { ...segment, top, height, extraHeight }
  })

  function yForTime(minute: number) {
    const extraHeight = positionedSegments.reduce(
      (total, segment) => total + (segment.end <= minute ? segment.extraHeight : 0),
      0,
    )

    return (minute - rangeStart) * scale + extraHeight
  }

  const timelineHeight = Math.max(180, rangeMinutes * scale + totalExtraHeight)
  const ticks: number[] = []

  function handleTimelineActivityClick(event: MouseEvent<HTMLButtonElement>) {
    const activityKey = event.currentTarget.dataset.activityKey
    const activity = activityKey ? activityByKey.get(activityKey) : undefined
    if (activity) onEditActivity(activity)
  }

  for (let minute = firstTick; minute <= rangeEnd; minute += tickInterval) ticks.push(minute)

  return (
    <section aria-labelledby="timeline-heading" className="flex min-w-0 flex-col gap-4">
      <div className="flex min-h-11 items-center">
        <h3 id="timeline-heading" className="font-medium">
          Timeline
        </h3>
      </div>
      {day.activities.length === 0 ? (
        <Empty className="flex-none items-start justify-start gap-1 rounded-none p-0 text-left">
          <EmptyHeader className="items-start gap-1">
            <EmptyTitle role="heading" aria-level={4}>
              No activities yet
            </EmptyTitle>
            <EmptyDescription>
              Add a stop from Activities to see it on the timeline.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      <div className="relative min-w-0" style={{ height: `${timelineHeight}px` }}>
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {ticks.map((minute) => {
            const major = minute % 60 === 0

            return (
              <div
                key={minute}
                className="absolute right-0 left-0 flex items-center"
                style={{ top: `${yForTime(minute)}px` }}
              >
                <span className="text-muted-foreground bg-background w-14 shrink-0 -translate-y-1/2 pr-2 text-right text-xs tabular-nums">
                  {major ? formatTime(minute) : ''}
                </span>
                <span
                  className={`flex-1 border-t ${major ? 'border-border' : 'border-border/50 border-dashed'}`}
                />
              </div>
            )
          })}
          <div
            className="border-primary/60 absolute right-0 left-14 border-t-2"
            style={{ top: `${yForTime(day.startMinute)}px` }}
          />
          <div
            className="border-foreground/50 absolute right-0 left-14 border-t-2"
            style={{ top: `${yForTime(day.finishMinute)}px` }}
          />
          {positionedSegments
            .filter(
              (segment) =>
                segment.kind === 'activity' && segment.entry.intendedBookingStartMinute !== null,
            )
            .map((segment) => {
              if (segment.kind !== 'activity') return null

              const bookingMinute = segment.entry.intendedBookingStartMinute
              if (bookingMinute === null) return null
              const bookingTop =
                bookingMinute === segment.entry.projectedStartMinute
                  ? segment.top
                  : yForTime(bookingMinute)

              return (
                <div
                  key={`booking-${segment.key}`}
                  className="border-foreground/70 absolute right-0 left-14 border-t-2 border-dashed"
                  style={{ top: `${bookingTop}px` }}
                />
              )
            })}
        </div>
        {positionedSegments.map((segment) => {
          if (segment.kind === 'activity') {
            const activity = activityByKey.get(segment.entry.activityId)
            if (!activity) return null

            const ariaDescription = activityDescription(
              segment.title,
              segment.durationMinutes,
              segment.entry,
            )

            return (
              <Button
                key={segment.key}
                type="button"
                variant="outline"
                aria-label={ariaDescription}
                data-activity-key={activity.key}
                className={`absolute right-1 left-14 z-10 flex h-auto flex-col items-start justify-start gap-0.5 overflow-hidden rounded-md px-2 py-1 text-left text-xs font-normal whitespace-normal ${segment.entry.provisional ? 'border-dashed' : ''}`}
                style={{ top: `${segment.top}px`, height: `${segment.height}px` }}
                onClick={handleTimelineActivityClick}
              >
                <span className="line-clamp-2 font-medium">{segment.title}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatTime(segment.entry.projectedStartMinute)}–
                  {formatTime(segment.entry.projectedEndMinute)} · {segment.durationMinutes} min
                </span>
                {segment.entry.intendedBookingStartMinute !== null ? (
                  <span>Booked {toTime(segment.entry.intendedBookingStartMinute)}</span>
                ) : null}
                {segment.entry.lateMinutes > 0 ? (
                  <span>
                    Arrive {formatTime(segment.entry.arrivalMinute)} · {segment.entry.lateMinutes}{' '}
                    min late
                  </span>
                ) : null}
                {segment.entry.provisional ? (
                  <Badge
                    variant="outline"
                    className="border-amber-700/40 bg-amber-50 text-amber-900 dark:border-amber-300/40 dark:bg-amber-950/40 dark:text-amber-100"
                  >
                    Provisional
                  </Badge>
                ) : null}
              </Button>
            )
          }

          return (
            <div
              key={segment.key}
              aria-hidden="true"
              className={`absolute right-1 left-14 z-10 flex items-center gap-2 overflow-hidden border-l-2 px-2 text-xs ${segment.kind === 'wait' ? 'border-primary/60 bg-muted/70 text-foreground' : segment.minutes === null ? 'border-dashed border-amber-700 bg-amber-50 text-amber-900 dark:border-amber-300 dark:bg-amber-950/40 dark:text-amber-100' : 'border-border bg-muted/60 text-muted-foreground border-dashed'}`}
              style={{ top: `${segment.top}px`, height: `${segment.height}px` }}
            >
              <span className="truncate">
                {segment.kind === 'wait'
                  ? `Wait ${segment.minutes} min · booking ${toTime(segment.bookingMinute)}`
                  : segment.minutes === null
                    ? 'Travel time not set'
                    : `Travel · ${segment.minutes} min`}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function activityContentHeight(entry: DayScheduleResult['entries'][number]) {
  const lineCount =
    2 +
    Number(entry.intendedBookingStartMinute !== null) +
    Number(entry.lateMinutes > 0) +
    Number(entry.provisional)

  return Math.max(
    minimumActivityHeight,
    lineCount * 16 + Number(entry.provisional) * 4 + 10 + (lineCount - 1) * 2,
  )
}

function activityDescription(
  title: string,
  durationMinutes: number,
  entry: DayScheduleResult['entries'][number],
) {
  const description = [
    `Edit ${title}`,
    `projected ${formatTime(entry.projectedStartMinute)} to ${formatTime(entry.projectedEndMinute)}`,
    `${durationMinutes} minutes`,
  ]

  if (entry.intendedBookingStartMinute !== null)
    description.push(`booked ${toTime(entry.intendedBookingStartMinute)}`)
  if (entry.waitMinutes > 0)
    description.push(`arrive ${formatTime(entry.arrivalMinute)}, wait ${entry.waitMinutes} minutes`)
  if (entry.lateMinutes > 0)
    description.push(`arrive ${formatTime(entry.arrivalMinute)}, ${entry.lateMinutes} minutes late`)
  if (entry.provisional) description.push('provisional because earlier travel time is missing')

  return description.join('; ')
}
