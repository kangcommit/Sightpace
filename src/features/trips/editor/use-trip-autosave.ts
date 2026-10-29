'use client'

import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react'
import { type SaveTripEditorResult, saveTripEditorAction } from '../server/save-trip-action'
import type { TripEditorDraft } from './editor-contract'

const saveDebounceMs = 500

type SaveRequest = {
  tripId: string
  mutationId: string
  expectedRevision: number
  snapshot: TripEditorDraft
}

type PendingSave = {
  request: SaveRequest
  sourceDraft: TripEditorDraft
}

type SaveError = Extract<SaveTripEditorResult, { ok: false }>
type SaveStatus = 'idle' | 'saving' | 'failed' | 'unauthenticated' | 'conflict' | 'invalid'

function normalizedDraft(draft: TripEditorDraft): TripEditorDraft {
  return {
    ...draft,
    title: draft.title.trim(),
    destination: draft.destination.trim(),
    days: draft.days.map((day) => ({
      ...day,
      activities: day.activities.map((activity) => ({
        ...activity,
        title: activity.title.trim(),
        placeLabel: activity.placeLabel.trim(),
      })),
    })),
  }
}

function withServerIds(draft: TripEditorDraft, ids: Record<string, string>) {
  return {
    ...draft,
    days: draft.days.map((day) => ({
      ...day,
      ...(ids[day.key] ? { id: ids[day.key] } : {}),
      activities: day.activities.map((activity) => ({
        ...activity,
        ...(ids[activity.key] ? { id: ids[activity.key] } : {}),
      })),
    })),
  }
}

export function useTripAutosave({
  tripId,
  initialDraft,
  initialRevision,
  draft,
  setDraft,
  canSave,
  enabled = true,
}: {
  tripId: string
  initialDraft: TripEditorDraft
  initialRevision: number
  draft: TripEditorDraft
  setDraft: Dispatch<SetStateAction<TripEditorDraft>>
  canSave: boolean
  enabled?: boolean
}) {
  const [savedDraft, setSavedDraft] = useState(initialDraft)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<SaveError | null>(null)
  const [needsReload, setNeedsReload] = useState(false)
  const pendingSave = useRef<PendingSave | null>(null)
  const blockedSnapshot = useRef<string | null>(null)
  const inFlight = useRef(false)
  const debounceTimer = useRef<number | null>(null)
  const revisionRef = useRef(initialRevision)
  const performSaveRef = useRef<(pending: PendingSave) => Promise<void>>(async () => {})
  const dirty = enabled && JSON.stringify(normalizedDraft(draft)) !== JSON.stringify(savedDraft)

  async function performSave(pending: PendingSave) {
    if (inFlight.current) return

    inFlight.current = true
    setStatus('saving')
    setError(null)

    try {
      const result = await saveTripEditorAction(pending.request)
      if (!result.ok) {
        setError(result)
        if (result.code === 'TEMPORARILY_UNAVAILABLE') {
          setStatus('failed')
          return
        }
        if (result.code === 'UNAUTHENTICATED') {
          setStatus('unauthenticated')
          return
        }
        pendingSave.current = null
        if (result.code === 'CONFLICT' || result.code === 'NOT_FOUND') {
          setNeedsReload(true)
          setStatus('conflict')
          return
        }
        blockedSnapshot.current = JSON.stringify(pending.sourceDraft)
        setStatus('invalid')
        return
      }

      pendingSave.current = null
      revisionRef.current = result.revision
      const persistedDraft = withServerIds(pending.request.snapshot, result.ids)
      setSavedDraft(persistedDraft)
      setDraft((current) => withServerIds(current, result.ids))
      setStatus('idle')
      setError(null)
    } catch {
      setStatus('failed')
      setError({
        ok: false,
        code: 'TEMPORARILY_UNAVAILABLE',
        message:
          'We couldn’t confirm whether your changes saved. Retry safely; your edits are still here.',
      })
    } finally {
      inFlight.current = false
    }
  }

  performSaveRef.current = performSave

  useEffect(() => {
    if (!enabled || !dirty || !canSave || needsReload || inFlight.current || pendingSave.current)
      return
    if (status === 'unauthenticated' || status === 'failed' || status === 'conflict') return

    const fingerprint = JSON.stringify(draft)
    if (status === 'invalid') {
      if (blockedSnapshot.current === fingerprint) return

      blockedSnapshot.current = null
      setStatus('idle')
      setError(null)
      return
    }

    const timer = window.setTimeout(() => {
      debounceTimer.current = null
      const pending: PendingSave = {
        request: {
          tripId,
          mutationId: crypto.randomUUID(),
          expectedRevision: revisionRef.current,
          snapshot: normalizedDraft(draft),
        },
        sourceDraft: draft,
      }
      pendingSave.current = pending
      void performSaveRef.current(pending)
    }, saveDebounceMs)
    debounceTimer.current = timer

    return () => {
      window.clearTimeout(timer)
      if (debounceTimer.current === timer) debounceTimer.current = null
    }
  }, [canSave, dirty, draft, enabled, needsReload, status, tripId])

  useEffect(() => {
    if (status !== 'conflict' || initialRevision === revisionRef.current) return

    pendingSave.current = null
    blockedSnapshot.current = null
    revisionRef.current = initialRevision
    setDraft(initialDraft)
    setSavedDraft(initialDraft)
    setNeedsReload(false)
    setError(null)
    setStatus('idle')
  }, [initialDraft, initialRevision, setDraft, status])

  function retrySave() {
    if (inFlight.current || !pendingSave.current) return
    void performSaveRef.current(pendingSave.current)
  }

  function cancelPendingSave() {
    if (inFlight.current) return false

    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    pendingSave.current = null
    return true
  }

  function saveNow() {
    if (!enabled || !canSave || needsReload || inFlight.current) return false

    if (pendingSave.current) {
      void performSaveRef.current(pendingSave.current)
      return true
    }

    if (!dirty) return false

    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }

    const pending: PendingSave = {
      request: {
        tripId,
        mutationId: crypto.randomUUID(),
        expectedRevision: revisionRef.current,
        snapshot: normalizedDraft(draft),
      },
      sourceDraft: draft,
    }
    pendingSave.current = pending
    void performSaveRef.current(pending)
    return true
  }

  return {
    dirty,
    error,
    needsReload,
    cancelPendingSave,
    retrySave,
    saveNow,
    revision: revisionRef.current,
    status,
  }
}
