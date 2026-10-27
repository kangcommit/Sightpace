'use client'

import Link from 'next/link'
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

export function TripEditorNavigationDialog({
  open,
  saveStatus,
  saveError,
  cleanupError,
  saveBlockedMessage,
  signInHref,
  canSave,
  canDiscard,
  onStay,
  onSaveAndLeave,
  onDiscardAndLeave,
}: {
  open: boolean
  saveStatus: string
  saveError: string | null
  cleanupError: string | null
  saveBlockedMessage: string
  signInHref: string
  canSave: boolean
  canDiscard: boolean
  onStay: () => void
  onSaveAndLeave: () => void
  onDiscardAndLeave: () => void
}) {
  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) onStay()
  }

  const retrying = saveStatus === 'failed' || saveStatus === 'unauthenticated'
  const saving = saveStatus === 'saving'

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogPortal>
        <AlertDialogBackdrop />
        <AlertDialogViewport>
          <AlertDialogContent>
            <div className="flex flex-col gap-2">
              <AlertDialogTitle>Leave this trip?</AlertDialogTitle>
              <AlertDialogDescription>
                Save your edits before leaving, or discard the local changes from this device.
              </AlertDialogDescription>
            </div>
            {saveError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {saveError}{' '}
                  {saveStatus === 'unauthenticated' ? (
                    <Link href={signInHref} target="_blank" rel="noreferrer">
                      Sign in in another tab, then retry.
                    </Link>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
            {cleanupError ? (
              <Alert variant="destructive">
                <AlertDescription>{cleanupError}</AlertDescription>
              </Alert>
            ) : null}
            {saving ? (
              <p role="status" className="text-muted-foreground text-sm">
                Saving your trip…
              </p>
            ) : null}
            {!canSave && !retrying ? (
              <p className="text-muted-foreground text-sm">{saveBlockedMessage}</p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="min-h-11" onClick={onStay}>
                Stay
              </Button>
              <Button
                type="button"
                className="min-h-11"
                disabled={!canSave || saving}
                onClick={onSaveAndLeave}
              >
                {retrying ? 'Retry save and leave' : 'Save and leave'}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="min-h-11"
                disabled={!canDiscard}
                onClick={onDiscardAndLeave}
              >
                Discard and leave
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialogViewport>
      </AlertDialogPortal>
    </AlertDialog>
  )
}
