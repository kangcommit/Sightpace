'use client'

import { useState } from 'react'
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
import type { TripRecoveryRecord } from '../recovery-storage'
import type { TripRecoveryStatus } from '../use-trip-draft-recovery'

export function TripEditorRecovery({
  status,
  record,
  storageUnavailable,
  onRestore,
  onKeepLocally,
  onDiscard,
  saveConflict,
  conflictMessage,
  conflictKeptLocally,
  onKeepConflictLocally,
  onDiscardConflict,
}: {
  status: TripRecoveryStatus
  record: TripRecoveryRecord | null
  storageUnavailable: boolean
  onRestore: () => void
  onKeepLocally: () => void
  onDiscard: () => void
  saveConflict: boolean
  conflictMessage: string | null
  conflictKeptLocally: boolean
  onKeepConflictLocally: () => void
  onDiscardConflict: () => void
}) {
  const [confirmDiscard, setConfirmDiscard] = useState<'recovery' | 'conflict' | null>(null)

  function handleDialogChange(open: boolean) {
    if (!open) setConfirmDiscard(null)
  }

  function handleOpenRecoveryDiscard() {
    setConfirmDiscard('recovery')
  }

  function handleOpenConflictDiscard() {
    setConfirmDiscard('conflict')
  }

  function handleCancelDiscard() {
    setConfirmDiscard(null)
  }

  function handleConfirmDiscard() {
    if (confirmDiscard === 'conflict') onDiscardConflict()
    else onDiscard()
    setConfirmDiscard(null)
  }

  return (
    <>
      {storageUnavailable ? (
        <Alert variant="destructive">
          <AlertDescription>
            This browser couldn’t access its recovery copy. Keep this page open; recent edits may
            not survive a refresh or browser close.
          </AlertDescription>
        </Alert>
      ) : null}
      {status === 'checking' ? (
        <p role="status" className="text-muted-foreground text-sm">
          Checking this device for unsaved trip changes…
        </p>
      ) : null}
      {status === 'available' && record ? (
        <Alert>
          <AlertDescription>
            Unsaved edits from this device are available for this saved version of the trip.
          </AlertDescription>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" onClick={onRestore}>
              Restore draft
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={onDiscard}>
              Discard draft
            </Button>
          </div>
        </Alert>
      ) : null}
      {status === 'stale' && record ? (
        <Alert variant="destructive">
          <AlertDescription>
            This device has edits based on an older saved version. Saving is paused so they can’t
            replace newer changes.
          </AlertDescription>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" onClick={onKeepLocally}>
              Keep editing locally
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={handleOpenRecoveryDiscard}
            >
              Discard local changes
            </Button>
          </div>
        </Alert>
      ) : null}
      {status === 'kept-local' ? (
        <Alert>
          <AlertDescription>
            Saving is paused. Your edits are kept on this device; compare with the latest saved trip
            and reapply changes deliberately.
          </AlertDescription>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={handleOpenRecoveryDiscard}
          >
            Discard local changes
          </Button>
        </Alert>
      ) : null}
      {saveConflict ? (
        <Alert variant="destructive">
          <AlertDescription>
            {conflictKeptLocally
              ? 'Saving is paused. Your edits are kept on this device; compare with the latest saved trip and reapply changes deliberately.'
              : (conflictMessage ??
                'The saved trip changed before these edits could be saved. Your local changes are preserved and won’t replace the newer version.')}
          </AlertDescription>
          <div className="flex flex-wrap gap-2">
            {!conflictKeptLocally ? (
              <Button type="button" className="min-h-11" onClick={onKeepConflictLocally}>
                Keep editing locally
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={handleOpenConflictDiscard}
            >
              Discard edits and reload latest
            </Button>
          </div>
        </Alert>
      ) : null}
      <AlertDialog open={confirmDiscard !== null} onOpenChange={handleDialogChange}>
        <AlertDialogPortal>
          <AlertDialogBackdrop />
          <AlertDialogViewport>
            <AlertDialogContent>
              <div className="flex flex-col gap-2">
                <AlertDialogTitle>Discard the local trip changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the saved edits from this device and loads the latest saved trip.
                  This cannot be undone.
                </AlertDialogDescription>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={handleCancelDiscard}
                >
                  Keep changes
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="min-h-11"
                  onClick={handleConfirmDiscard}
                >
                  Discard and reload latest
                </Button>
              </div>
            </AlertDialogContent>
          </AlertDialogViewport>
        </AlertDialogPortal>
      </AlertDialog>
    </>
  )
}
