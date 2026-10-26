import type { ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { isDateTodayOrLater } from '../../shared/date-rules'
import type { EditorDay } from '../trip-editor-utils'
import { fromTime, toTime, validDate } from '../trip-editor-utils'

export function TripEditorDayFields({
  day,
  minimumDate,
  duplicateDate,
  onDateChange,
  onStartChange,
  onFinishChange,
  onDelete,
}: {
  day: EditorDay
  minimumDate: string
  duplicateDate: boolean
  onDateChange: (date: string) => void
  onStartChange: (minute: number) => void
  onFinishChange: (minute: number) => void
  onDelete: () => void
}) {
  const invalidDate =
    !validDate(day.date) || !isDateTodayOrLater(day.date, minimumDate) || duplicateDate
  const invalidHours =
    day.startMinute > 1438 || day.finishMinute < 1 || day.startMinute >= day.finishMinute

  function handleDateChange(event: ChangeEvent<HTMLInputElement>) {
    onDateChange(event.target.value)
  }

  function handleStartChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.value) onStartChange(fromTime(event.target.value))
  }

  function handleFinishChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.value) onFinishChange(fromTime(event.target.value))
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="day-date">Day date</FieldLabel>
          <Input
            id="day-date"
            type="date"
            required
            className="block!"
            min={minimumDate}
            value={day.date}
            aria-invalid={invalidDate}
            aria-describedby={invalidDate ? 'day-date-error' : undefined}
            onChange={handleDateChange}
          />
          {invalidDate ? (
            <p id="day-date-error" className="text-destructive text-sm">
              {!validDate(day.date)
                ? 'Enter a valid day date.'
                : !isDateTodayOrLater(day.date, minimumDate)
                  ? 'Choose today or a future date.'
                  : 'A day already uses this date.'}
            </p>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="day-start">Day starts at</FieldLabel>
          <Input
            id="day-start"
            type="time"
            className="block!"
            max="23:58"
            value={toTime(day.startMinute)}
            aria-invalid={day.startMinute > 1438 || day.startMinute >= day.finishMinute}
            aria-describedby={invalidHours ? 'day-hours-error' : undefined}
            onChange={handleStartChange}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="day-finish">Day finishes at</FieldLabel>
          <Input
            id="day-finish"
            type="time"
            className="block!"
            min="00:01"
            value={toTime(day.finishMinute)}
            aria-invalid={day.finishMinute < 1 || day.startMinute >= day.finishMinute}
            aria-describedby={invalidHours ? 'day-hours-error' : undefined}
            onChange={handleFinishChange}
          />
          {invalidHours ? (
            <p id="day-hours-error" className="text-destructive text-sm">
              {day.startMinute > 1438
                ? 'Choose a start time before 23:59.'
                : day.finishMinute < 1
                  ? 'Choose a finish time after 00:00.'
                  : 'Finish time must be later than start time.'}
            </p>
          ) : null}
        </Field>
      </div>
      <Button variant="outline" className="min-h-11 self-start" onClick={onDelete}>
        Delete day
      </Button>
    </>
  )
}
