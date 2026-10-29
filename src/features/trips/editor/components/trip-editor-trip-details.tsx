import type { ChangeEvent } from 'react'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { TripEditorDraft } from '../editor-contract'

export function TripEditorTripDetails({
  draft,
  titleInvalid,
  destinationInvalid,
  onTitleChange,
  onDestinationChange,
}: {
  draft: TripEditorDraft
  titleInvalid: boolean
  destinationInvalid: boolean
  onTitleChange: (title: string) => void
  onDestinationChange: (destination: string) => void
}) {
  function handleTitleChange(event: ChangeEvent<HTMLInputElement>) {
    onTitleChange(event.target.value)
  }

  function handleDestinationChange(event: ChangeEvent<HTMLInputElement>) {
    onDestinationChange(event.target.value)
  }

  return (
    <section className="flex flex-col gap-4 pt-3" aria-label="Trip details">
      <p className="text-primary text-sm font-semibold">Your itinerary</p>
      <h1 className="text-3xl font-semibold tracking-tight">{draft.title || 'Untitled trip'}</h1>
      <p className="text-muted-foreground">{draft.destination}</p>
      <div className="grid gap-4 md:max-w-3xl md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="trip-title">Trip name</FieldLabel>
          <Input
            id="trip-title"
            maxLength={120}
            required
            aria-invalid={titleInvalid}
            aria-describedby={titleInvalid ? 'trip-title-error' : undefined}
            value={draft.title}
            onChange={handleTitleChange}
          />
          {titleInvalid ? (
            <p id="trip-title-error" className="text-destructive text-sm">
              Enter a trip name.
            </p>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="trip-destination">Destination label</FieldLabel>
          <Input
            id="trip-destination"
            maxLength={120}
            required
            aria-invalid={destinationInvalid}
            aria-describedby={destinationInvalid ? 'trip-destination-error' : undefined}
            value={draft.destination}
            onChange={handleDestinationChange}
          />
          {destinationInvalid ? (
            <p id="trip-destination-error" className="text-destructive text-sm">
              Enter a destination label.
            </p>
          ) : null}
        </Field>
      </div>
    </section>
  )
}
