'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
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
import { signInPath } from '@/lib/auth-redirect'
import { appRoutes } from '@/lib/routes'
import { type TripEditorDraft, tripEditorDraftSchema } from '../editor/editor-contract'
import { TripEditor } from '../editor/trip-editor'
import type { InitialTrip } from '../editor/trip-editor-utils'
import { createSampleCopyAction } from '../server/create-sample-copy-action'

const transferKey = 'trailplan:demo:copy'
type Transfer = { mutationId: string; snapshot: TripEditorDraft }

export function SamplePlanner({
  trip,
  authenticated,
}: {
  trip: InitialTrip
  authenticated: boolean
}) {
  const router = useRouter()
  const baseline = useMemo(
    () =>
      tripEditorDraftSchema.parse({
        title: trip.title,
        destination: trip.destination,
        days: trip.days.map((day) => ({
          key: day.id,
          date: day.date,
          startMinute: day.startMinute,
          finishMinute: day.finishMinute,
          activities: day.activities.map((activity) => ({
            ...activity,
            key: activity.id,
            placeLabel: activity.placeLabel ?? '',
          })),
          travelEstimates: day.travelEstimates.map((item) => ({
            fromKey: item.fromActivityId,
            toKey: item.toActivityId,
            minutes: item.minutes,
          })),
        })),
      }),
    [trip],
  )
  const [draft, setDraft] = useState(baseline)
  const [editorKey, setEditorKey] = useState(0)
  const [ready, setReady] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [transfer, setTransfer] = useState<Transfer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let restored: Transfer | null = null
    try {
      const stored = sessionStorage.getItem(transferKey)
      if (stored) {
        const parsed: unknown = JSON.parse(stored)
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'mutationId' in parsed &&
          'snapshot' in parsed
        ) {
          const value = parsed as { mutationId: unknown; snapshot: unknown }
          const mutationId = z.uuid().safeParse(value.mutationId)
          if (mutationId.success) {
            const snapshot = tripEditorDraftSchema.safeParse(value.snapshot)
            if (snapshot.success)
              restored = { mutationId: mutationId.data, snapshot: snapshot.data }
          }
        }
        sessionStorage.removeItem(transferKey)
      }
    } catch {
      setError(
        'This tab could not restore the sample edits. They remain available only in this page.',
      )
    }
    if (restored) {
      setTransfer(restored)
      setDraft(restored.snapshot)
      setEditorKey((current) => current + 1)
      if (authenticated) setCopyOpen(true)
    }
    setReady(true)
  }, [authenticated])

  const handleDraftChange = useCallback((next: TripEditorDraft) => {
    setDraft(next)
    setTransfer((current) =>
      current && JSON.stringify(current.snapshot) !== JSON.stringify(next) ? null : current,
    )
  }, [])
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline)

  function handleResetRequest() {
    if (dirty) setResetOpen(true)
  }

  function handleReset() {
    setDraft(baseline)
    setEditorKey((current) => current + 1)
    setResetOpen(false)
    setTransfer(null)
    setError(null)
  }

  function handleCopyRequest() {
    setError(null)
    const next = transfer ?? { mutationId: crypto.randomUUID(), snapshot: draft }
    setTransfer(next)
    if (!authenticated) {
      try {
        sessionStorage.setItem(transferKey, JSON.stringify(next))
      } catch {
        setError(
          'Your browser could not keep these edits for sign-in. Keep this tab open and try again.',
        )
        return
      }
      router.push(signInPath(appRoutes.demo))
      return
    }
    setCopyOpen(true)
  }

  async function handleConfirmCopy() {
    if (!transfer || pending) return
    setPending(true)
    setError(null)
    try {
      const result = await createSampleCopyAction(transfer)
      if (!result.ok) {
        setError(result.message)
        if (result.code === 'UNAUTHENTICATED') {
          try {
            sessionStorage.setItem(transferKey, JSON.stringify(transfer))
            router.push(signInPath(appRoutes.demo))
          } catch {
            setError(
              'Sign in expired. Your edits are still here; keep this tab open and try again.',
            )
          }
        }
        return
      }
      sessionStorage.removeItem(transferKey)
      router.push(appRoutes.trip(result.tripId))
    } catch {
      setError(
        'We couldn’t confirm whether the copy was saved. Retry safely; the same copy request will be used.',
      )
    } finally {
      setPending(false)
    }
  }

  function handleResetOpenChange(open: boolean) {
    if (!open) setResetOpen(false)
  }

  function handleCopyOpenChange(open: boolean) {
    if (!pending && !open) setCopyOpen(false)
  }

  if (!ready)
    return (
      <p role="status" className="sr-only">
        Loading your sample…
      </p>
    )

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <Link href={appRoutes.home} className="flex min-h-11 w-fit items-center font-semibold">
        TrailPlan
      </Link>
      <section className="flex flex-col gap-4" aria-label="Sample trip">
        <Alert>
          <AlertDescription>
            Sample trip · changes are temporary. A reload may reset them.
          </AlertDescription>
        </Alert>
        {error && !copyOpen ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" className="min-h-11" onClick={handleCopyRequest}>
            Save a copy
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={handleResetRequest}
            disabled={!dirty}
          >
            Reset sample
          </Button>
        </div>
      </section>
      <TripEditor
        key={editorKey}
        trip={trip}
        initialDraft={draft}
        sampleMode
        onDraftChange={handleDraftChange}
      />
      <AlertDialog open={resetOpen} onOpenChange={handleResetOpenChange}>
        <AlertDialogPortal>
          <AlertDialogBackdrop />
          <AlertDialogViewport>
            <AlertDialogContent>
              <AlertDialogTitle>Reset sample?</AlertDialogTitle>
              <AlertDialogDescription>
                This restores the original Porto day and discards your sample edits.
              </AlertDialogDescription>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setResetOpen(false)}
                >
                  Keep editing
                </Button>
                <Button type="button" className="min-h-11" onClick={handleReset}>
                  Reset sample
                </Button>
              </div>
            </AlertDialogContent>
          </AlertDialogViewport>
        </AlertDialogPortal>
      </AlertDialog>
      <AlertDialog open={copyOpen} onOpenChange={handleCopyOpenChange}>
        <AlertDialogPortal>
          <AlertDialogBackdrop />
          <AlertDialogViewport>
            <AlertDialogContent>
              <AlertDialogTitle>Save a copy to your trips?</AlertDialogTitle>
              <AlertDialogDescription>
                Your current sample edits will be copied to your private trips.
              </AlertDialogDescription>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setCopyOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={handleConfirmCopy}
                  disabled={pending}
                >
                  {pending ? 'Saving copy…' : 'Save copy'}
                </Button>
              </div>
            </AlertDialogContent>
          </AlertDialogViewport>
        </AlertDialogPortal>
      </AlertDialog>
    </main>
  )
}
