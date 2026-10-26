import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { DayScheduleResult } from '@/lib/scheduling'
import type { EditorActivity, EditorDay } from '../trip-editor-utils'
import { formatTime, toTime } from '../trip-editor-utils'

type ScheduleEntry = DayScheduleResult['entries'][number]

export function TripEditorActivities({
  day,
  scheduleByKey,
  onAdd,
  onMove,
  onEdit,
  onDelete,
  onTravelChange,
}: {
  day: EditorDay
  scheduleByKey: ReadonlyMap<string, ScheduleEntry>
  onAdd: () => void
  onMove: (activity: EditorActivity, index: number, offset: -1 | 1) => void
  onEdit: (activity: EditorActivity) => void
  onDelete: (activity: EditorActivity) => void
  onTravelChange: (from: string, to: string, minutes: number | null) => void
}) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="activities-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="activities-heading" className="font-medium">
          Activities
        </h3>
        <Button className="min-h-11" onClick={onAdd}>
          <Plus aria-hidden="true" /> Add activity
        </Button>
      </div>
      {day.activities.length === 0 ? (
        <p className="text-muted-foreground">No activities yet. Add your first activity.</p>
      ) : null}
      <ol className="flex flex-col gap-4">
        {day.activities.map((activity, index) => (
          <ActivityItem
            key={activity.key}
            activity={activity}
            index={index}
            day={day}
            entry={scheduleByKey.get(activity.key)}
            onMove={onMove}
            onEdit={onEdit}
            onDelete={onDelete}
            onTravelChange={onTravelChange}
          />
        ))}
      </ol>
    </section>
  )
}

function ActivityItem({
  activity,
  index,
  day,
  entry,
  onMove,
  onEdit,
  onDelete,
  onTravelChange,
}: {
  activity: EditorActivity
  index: number
  day: EditorDay
  entry: ScheduleEntry | undefined
  onMove: (activity: EditorActivity, index: number, offset: -1 | 1) => void
  onEdit: (activity: EditorActivity) => void
  onDelete: (activity: EditorActivity) => void
  onTravelChange: (from: string, to: string, minutes: number | null) => void
}) {
  const nextActivity = day.activities[index + 1]

  function handleMoveUp() {
    onMove(activity, index, -1)
  }

  function handleMoveDown() {
    onMove(activity, index, 1)
  }

  function handleEdit() {
    onEdit(activity)
  }

  function handleDelete() {
    onDelete(activity)
  }

  function handleTravelChange(minutes: number | null) {
    if (!nextActivity) return

    onTravelChange(activity.key, nextActivity.key, minutes)
  }

  return (
    <li
      tabIndex={-1}
      aria-label={`Activity ${index + 1}: ${activity.title}`}
      data-activity-key={activity.key}
      className="flex flex-col gap-2 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {index + 1}. {activity.title}
          </p>
          <p className="text-muted-foreground text-sm">
            {entry
              ? `${formatTime(entry.projectedStartMinute)}–${formatTime(entry.projectedEndMinute)}`
              : 'Time not calculated'}{' '}
            · {activity.durationMinutes} min
            {activity.placeLabel ? ` · ${activity.placeLabel}` : ''}
          </p>
          {activity.fixedStartMinute !== null && entry?.lateMinutes ? (
            <p className="text-sm">
              Booked {toTime(activity.fixedStartMinute)}
              {` · projected arrival ${formatTime(entry.arrivalMinute)} · ${entry.lateMinutes} min late`}
            </p>
          ) : null}
          {entry?.provisional ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Provisional: earlier travel time is missing.
            </p>
          ) : null}
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            className="min-h-11 min-w-11"
            aria-label={`Move ${activity.title} up`}
            disabled={index === 0}
            onClick={handleMoveUp}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            className="min-h-11 min-w-11"
            aria-label={`Move ${activity.title} down`}
            disabled={index === day.activities.length - 1}
            onClick={handleMoveDown}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-lg"
            className="min-h-11 min-w-11"
            aria-label={`Edit ${activity.title}`}
            onClick={handleEdit}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            variant="destructive"
            className="min-h-11 min-w-11"
            aria-label={`Delete ${activity.title}`}
            onClick={handleDelete}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      {nextActivity ? (
        <TravelControl
          key={`${activity.key}:${nextActivity.key}`}
          day={day}
          from={activity.key}
          to={nextActivity.key}
          onChange={handleTravelChange}
        />
      ) : null}
    </li>
  )
}

function TravelControl({
  day,
  from,
  to,
  onChange,
}: {
  day: EditorDay
  from: string
  to: string
  onChange: (minutes: number | null) => void
}) {
  const estimate = day.travelEstimates.find((item) => item.fromKey === from && item.toKey === to)
  const [value, setValue] = useState(estimate ? String(estimate.minutes) : '')
  const invalid =
    value !== '' && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 1439)
  const errorId = `travel-error-${from}-${to}`
  const fromTitle = day.activities.find((item) => item.key === from)?.title ?? 'activity'
  const toTitle = day.activities.find((item) => item.key === to)?.title ?? 'activity'

  function handleValueChange(event: ChangeEvent<HTMLInputElement>) {
    setValue(event.target.value)
  }

  function handleSetEstimate() {
    onChange(Number(value))
  }

  function handleClearEstimate() {
    setValue('')
    onChange(null)
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-t pt-3">
      <Field className="min-w-40 flex-1">
        <FieldLabel htmlFor={`travel-${from}-${to}`}>
          Travel minutes: {fromTitle} to {toTitle}
        </FieldLabel>
        <Input
          id={`travel-${from}-${to}`}
          type="number"
          min={0}
          max={1439}
          step={1}
          placeholder="Not set"
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          value={value}
          onChange={handleValueChange}
        />
      </Field>
      <Button
        variant="outline"
        className="min-h-11"
        disabled={value === '' || invalid}
        onClick={handleSetEstimate}
      >
        {estimate ? 'Update estimate' : 'Set estimate'}
      </Button>
      {invalid ? (
        <p id={errorId} className="text-destructive w-full text-sm">
          Enter a whole number from 0 to 1439 minutes.
        </p>
      ) : null}
      {estimate ? (
        <Button variant="outline" className="min-h-11" onClick={handleClearEstimate}>
          Clear
        </Button>
      ) : null}
      <p className="text-muted-foreground w-full text-sm">
        {estimate
          ? `Travel estimate · ${estimate.minutes} min`
          : 'Travel time not set. Later times use 0 min until you add an estimate.'}
      </p>
    </div>
  )
}
