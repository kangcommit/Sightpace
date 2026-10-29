import { X } from 'lucide-react'
import type { ChangeEvent, SubmitEvent } from 'react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { EditorActivity } from '../trip-editor-utils'
import { fromTime, toTime } from '../trip-editor-utils'

export function ActivityDialog({
  current,
  onClose,
  onCommit,
}: {
  current: EditorActivity | null
  onClose: () => void
  onCommit: (activity: EditorActivity) => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(current?.title ?? '')
  const [placeLabel, setPlaceLabel] = useState(current?.placeLabel ?? '')
  const [duration, setDuration] = useState(String(current?.durationMinutes ?? ''))
  const [fixed, setFixed] = useState(current?.fixedStartMinute !== null && current !== null)
  const [fixedTime, setFixedTime] = useState(
    current?.fixedStartMinute == null ? '' : toTime(current.fixedStartMinute),
  )
  const [error, setError] = useState<string | null>(null)
  const durationRef = useRef<HTMLInputElement>(null)
  const bookingRef = useRef<HTMLInputElement>(null)

  function handleDialogOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleTitleChange(event: ChangeEvent<HTMLInputElement>) {
    setTitle(event.target.value)
  }

  function handlePlaceLabelChange(event: ChangeEvent<HTMLInputElement>) {
    setPlaceLabel(event.target.value)
  }

  function handleDurationChange(event: ChangeEvent<HTMLInputElement>) {
    setDuration(event.target.value)
  }

  function handleFixedTimeChange(event: ChangeEvent<HTMLInputElement>) {
    setFixedTime(event.target.value)
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const minutes = Number(duration)
    if (!title.trim()) {
      setError('Enter an activity name.')
      nameRef.current?.focus()
      return
    }
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1439) {
      setError('Duration must be a whole number from 1 to 1439 minutes.')
      durationRef.current?.focus()
      return
    }
    if (fixed && !/^([01]\d|2[0-3]):[0-5]\d$/.test(fixedTime)) {
      setError('Enter a valid start time.')
      bookingRef.current?.focus()
      return
    }
    setError(null)
    onCommit({
      key: current?.key ?? `draft-activity-${crypto.randomUUID()}`,
      ...(current?.id ? { id: current.id } : {}),
      title: title.trim(),
      placeLabel: placeLabel.trim(),
      durationMinutes: minutes,
      fixedStartMinute: fixed ? fromTime(fixedTime) : null,
    })
  }

  return (
    <Dialog open onOpenChange={handleDialogOpenChange}>
      <DialogContent initialFocus={nameRef}>
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>{current ? 'Edit activity' : 'Add activity'}</DialogTitle>
          <Tooltip>
            <TooltipTrigger
              render={
                <DialogClose
                  aria-label="Close activity editor"
                  className="focus-visible:ring-ring focus-visible:ring-3"
                />
              }
            >
              <X aria-hidden="true" className="size-5" />
            </TooltipTrigger>
            <TooltipContent side="left">Close activity editor</TooltipContent>
          </Tooltip>
        </div>
        <DialogDescription>
          Enter the stop details. The schedule updates when you add or edit the activity.
        </DialogDescription>
        <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel
                htmlFor="activity-title"
                className="after:text-destructive after:content-['*']"
              >
                Name
              </FieldLabel>
              <Input
                ref={nameRef}
                id="activity-title"
                placeholder="Visit Borobudur Temple"
                value={title}
                maxLength={120}
                required
                aria-invalid={Boolean(error && !title.trim())}
                aria-describedby={error && !title.trim() ? 'activity-editor-error' : undefined}
                onChange={handleTitleChange}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="activity-place">Place label</FieldLabel>
              <Input
                id="activity-place"
                placeholder="Borobudur Temple, Central Java"
                value={placeLabel}
                maxLength={200}
                onChange={handlePlaceLabelChange}
              />
            </Field>
            <Field>
              <FieldLabel
                htmlFor="activity-duration"
                className="after:text-destructive after:content-['*']"
              >
                Duration (minutes)
              </FieldLabel>
              <Input
                ref={durationRef}
                id="activity-duration"
                type="number"
                placeholder="60"
                min={1}
                max={1439}
                step={1}
                required
                aria-invalid={Boolean(
                  error &&
                    (!Number.isInteger(Number(duration)) ||
                      Number(duration) < 1 ||
                      Number(duration) > 1439),
                )}
                aria-describedby={
                  error &&
                  (!Number.isInteger(Number(duration)) ||
                    Number(duration) < 1 ||
                    Number(duration) > 1439)
                    ? 'activity-editor-error'
                    : undefined
                }
                value={duration}
                onChange={handleDurationChange}
              />
            </Field>
            <Field>
              <div className="flex min-h-11 items-center gap-3">
                <Checkbox id="activity-fixed-booking" checked={fixed} onCheckedChange={setFixed} />
                <FieldLabel htmlFor="activity-fixed-booking" className="cursor-pointer">
                  Set a fixed start time
                </FieldLabel>
              </div>
              {fixed ? (
                <>
                  <FieldLabel
                    htmlFor="activity-fixed-time"
                    className="after:text-destructive after:content-['*']"
                  >
                    Start time
                  </FieldLabel>
                  <Input
                    ref={bookingRef}
                    id="activity-fixed-time"
                    type="time"
                    required
                    className="block!"
                    aria-invalid={Boolean(error && fixed && !fixedTime)}
                    aria-describedby={
                      error && fixed && !fixedTime ? 'activity-editor-error' : undefined
                    }
                    value={fixedTime}
                    onChange={handleFixedTimeChange}
                  />
                </>
              ) : null}
              <FieldDescription>
                Activities follow the previous stop by default. A fixed time leaves a gap when
                reached early; if you arrive late, the plan shows the set time and projected arrival
                separately.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {error ? (
            <p id="activity-editor-error" role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" className="min-h-11">
              {current ? 'Save activity' : 'Add activity'}
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
