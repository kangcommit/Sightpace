'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { signInPath } from '@/lib/auth-redirect'
import { appRoutes } from '@/lib/routes'
import { type CreateTripState, createTripAction } from './actions'

export function CreateTripForm({
  initialState,
  minimumDate,
}: {
  initialState: CreateTripState
  minimumDate: string
}) {
  const [state, action, pending] = useActionState(createTripAction, initialState)
  const [dateValue, setDateValue] = useState(initialState.values.date)
  const [startTimeValue, setStartTimeValue] = useState(initialState.values.startTime)
  const [finishTimeValue, setFinishTimeValue] = useState(initialState.values.finishTime)

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="mutationId" value={state.values.mutationId} />
      {state.message && !Object.values(state.errors).some(Boolean) && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.message === 'Sign in to create a trip.' && (
        <Link
          className="flex min-h-11 items-center self-start"
          href={signInPath(appRoutes.newTrip)}
        >
          Sign in again
        </Link>
      )}
      <FieldGroup>
        <Field data-invalid={Boolean(state.errors.title)}>
          <FieldLabel htmlFor="trip-title">Trip name</FieldLabel>
          <Input
            id="trip-title"
            name="title"
            required
            maxLength={120}
            placeholder="e.g. Summer in Portugal"
            defaultValue={state.values.title}
            aria-invalid={Boolean(state.errors.title) || undefined}
            aria-describedby={state.errors.title ? 'trip-title-error' : undefined}
          />
          {state.errors.title && (
            <FieldError id="trip-title-error">{state.errors.title}</FieldError>
          )}
        </Field>
        <Field data-invalid={Boolean(state.errors.destination)}>
          <FieldLabel htmlFor="trip-destination">Destination label</FieldLabel>
          <Input
            id="trip-destination"
            name="destination"
            required
            maxLength={120}
            placeholder="e.g. Lisbon, Portugal"
            defaultValue={state.values.destination}
            aria-invalid={Boolean(state.errors.destination) || undefined}
            aria-describedby={state.errors.destination ? 'trip-destination-error' : undefined}
          />
          {state.errors.destination && (
            <FieldError id="trip-destination-error">{state.errors.destination}</FieldError>
          )}
        </Field>
        <Field data-invalid={Boolean(state.errors.date)}>
          <FieldLabel htmlFor="trip-date">First day date</FieldLabel>
          <Input
            id="trip-date"
            type="date"
            name="date"
            required
            min={minimumDate}
            value={dateValue}
            onChange={(event) => setDateValue(event.target.value)}
            className="block!"
            aria-invalid={Boolean(state.errors.date) || undefined}
            aria-describedby={
              state.errors.date ? 'trip-date-hint trip-date-error' : 'trip-date-hint'
            }
          />
          <FieldDescription id="trip-date-hint">Choose today or later.</FieldDescription>
          {state.errors.date && <FieldError id="trip-date-error">{state.errors.date}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(state.errors.startTime)}>
          <FieldLabel htmlFor="trip-startTime">Day starts at</FieldLabel>
          <Input
            id="trip-startTime"
            type="time"
            name="startTime"
            required
            min="00:00"
            max="23:58"
            step={60}
            value={startTimeValue}
            onChange={(event) => setStartTimeValue(event.target.value)}
            className="block!"
            aria-invalid={Boolean(state.errors.startTime) || undefined}
            aria-describedby={state.errors.startTime ? 'trip-startTime-error' : undefined}
          />
          {state.errors.startTime && (
            <FieldError id="trip-startTime-error">{state.errors.startTime}</FieldError>
          )}
        </Field>
        <Field data-invalid={Boolean(state.errors.finishTime)}>
          <FieldLabel htmlFor="trip-finishTime">Day finishes at</FieldLabel>
          <Input
            id="trip-finishTime"
            type="time"
            name="finishTime"
            required
            min="00:01"
            max="23:59"
            step={60}
            value={finishTimeValue}
            onChange={(event) => setFinishTimeValue(event.target.value)}
            className="block!"
            aria-invalid={Boolean(state.errors.finishTime) || undefined}
            aria-describedby={state.errors.finishTime ? 'trip-finishTime-error' : undefined}
          />
          {state.errors.finishTime && (
            <FieldError id="trip-finishTime-error">{state.errors.finishTime}</FieldError>
          )}
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? 'Creating trip…' : 'Create trip'}
        </Button>
        <Button
          render={<Link href={appRoutes.trips} />}
          nativeButton={false}
          variant="outline"
          className="min-h-11"
        >
          Cancel
        </Button>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {pending ? 'Creating trip' : ''}
      </span>
    </form>
  )
}
