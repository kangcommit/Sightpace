'use client'

import { Trash2 } from 'lucide-react'
import { useActionState, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogViewport,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { deleteTripAction } from '../server/actions'

function DeleteTripControl({
  tripId,
  revision,
  mutationId,
  onClose,
}: {
  tripId: string
  revision: number
  mutationId: string
  onClose: () => void
}) {
  const [state, action, pending] = useActionState(deleteTripAction, { message: null })

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="mutationId" value={mutationId} />
      <input type="hidden" name="revision" value={revision} />
      {state.message && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onClose}
          className="min-h-11"
        >
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={pending} className="min-h-11">
          {pending ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {pending ? 'Deleting trip' : ''}
      </span>
    </form>
  )
}

export function DeleteTripButton({
  tripId,
  title,
  revision,
  mutationId,
}: {
  tripId: string
  title: string
  revision: number
  mutationId: string
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  function handleOpenConfirmation() {
    setConfirmOpen(true)
  }

  function handleCloseConfirmation() {
    setConfirmOpen(false)
  }

  return (
    <>
      <Button
        variant="destructive"
        size="icon"
        aria-label={`Delete ${title}`}
        className="min-h-11 min-w-11"
        onClick={handleOpenConfirmation}
      >
        <Trash2 aria-hidden="true" />
      </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogPortal>
          <AlertDialogBackdrop />
          <AlertDialogViewport>
            <AlertDialogContent>
              <div className="flex flex-col gap-2">
                <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes this trip and its saved days and activities.
                </AlertDialogDescription>
              </div>
              <DeleteTripControl
                tripId={tripId}
                revision={revision}
                mutationId={mutationId}
                onClose={handleCloseConfirmation}
              />
            </AlertDialogContent>
          </AlertDialogViewport>
        </AlertDialogPortal>
      </AlertDialog>
    </>
  )
}
