import { ChevronDown, ChevronUp } from 'lucide-react'
import type { ChangeEvent, SubmitEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { EditorDay } from '../trip-editor-utils'
import { formatDate, validDate } from '../trip-editor-utils'

export function TripEditorDayNavigation({
  days,
  selectedKey,
  newDayOpen,
  date,
  start,
  finish,
  error,
  onSelect,
  onToggle,
  onDateChange,
  onStartChange,
  onFinishChange,
  onAdd,
}: {
  days: EditorDay[]
  selectedKey: string
  newDayOpen: boolean
  date: string
  start: string
  finish: string
  error: string | null
  onSelect: (key: string) => void
  onToggle: () => void
  onDateChange: (value: string) => void
  onStartChange: (value: string) => void
  onFinishChange: (value: string) => void
  onAdd: (date: string, start: string, finish: string) => boolean
}) {
  return (
    <>
      <section className="flex flex-col gap-4" aria-labelledby="trip-days-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="trip-days-heading" className="text-lg font-medium">
            Your days
          </h2>
        </div>
        <nav aria-label="Trip days" className="flex flex-wrap items-center gap-2">
          {days.map((day, index) => (
            <DayNavigationButton
              key={day.key}
              day={day}
              index={index}
              selected={day.key === selectedKey}
              onSelect={onSelect}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            aria-expanded={newDayOpen}
            aria-controls="new-day-form-panel"
            onClick={onToggle}
          >
            {days.length > 0 ? 'Add another day' : 'Add a day'}
            {newDayOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </Button>
        </nav>
      </section>
      <AddDayForm
        onAdd={onAdd}
        error={error}
        open={newDayOpen}
        date={date}
        onDateChange={onDateChange}
        start={start}
        onStartChange={onStartChange}
        finish={finish}
        onFinishChange={onFinishChange}
      />
    </>
  )
}

function DayNavigationButton({
  day,
  index,
  selected,
  onSelect,
}: {
  day: EditorDay
  index: number
  selected: boolean
  onSelect: (key: string) => void
}) {
  function handleSelect() {
    onSelect(day.key)
  }

  return (
    <Button
      variant={selected ? 'secondary' : 'outline'}
      aria-pressed={selected}
      className="min-h-11"
      onClick={handleSelect}
    >
      Day {index + 1} · {validDate(day.date) ? formatDate(day.date) : 'Choose date'}
    </Button>
  )
}

function AddDayForm({
  onAdd,
  error,
  open,
  date,
  onDateChange,
  start,
  onStartChange,
  finish,
  onFinishChange,
}: {
  onAdd: (date: string, start: string, finish: string) => boolean
  error: string | null
  open: boolean
  date: string
  onDateChange: (value: string) => void
  start: string
  onStartChange: (value: string) => void
  finish: string
  onFinishChange: (value: string) => void
}) {
  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    onAdd(date, start, finish)
  }

  function handleDateChange(event: ChangeEvent<HTMLInputElement>) {
    onDateChange(event.target.value)
  }

  function handleStartChange(event: ChangeEvent<HTMLInputElement>) {
    onStartChange(event.target.value)
  }

  function handleFinishChange(event: ChangeEvent<HTMLInputElement>) {
    onFinishChange(event.target.value)
  }

  return (
    <div id="new-day-form-panel" hidden={!open}>
      <form
        className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
        onSubmit={handleSubmit}
      >
        <Field>
          <FieldLabel htmlFor="new-day-date">New day date</FieldLabel>
          <Input
            id="new-day-date"
            type="date"
            required
            className="block!"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'new-day-error' : undefined}
            value={date}
            onChange={handleDateChange}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-day-start">Starts at</FieldLabel>
          <Input
            id="new-day-start"
            type="time"
            required
            className="block!"
            max="23:58"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'new-day-error' : undefined}
            value={start}
            onChange={handleStartChange}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-day-finish">Finishes at</FieldLabel>
          <Input
            id="new-day-finish"
            type="time"
            required
            className="block!"
            min="00:01"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'new-day-error' : undefined}
            value={finish}
            onChange={handleFinishChange}
          />
        </Field>
        <Button className="min-h-11" type="submit">
          Add day
        </Button>
        {error ? (
          <p id="new-day-error" role="alert" className="text-destructive text-sm sm:col-span-4">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  )
}
