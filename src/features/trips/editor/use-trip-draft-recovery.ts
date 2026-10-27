'use client'

import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import type { TripEditorDraft } from './editor-contract'
import {
  clearTripRecoveryDraft,
  readTripRecoveryDraft,
  type TripRecoveryRecord,
  writeTripRecoveryDraft,
} from './recovery-storage'

export type TripRecoveryStatus = 'checking' | 'available' | 'stale' | 'ready' | 'kept-local'

export function useTripDraftRecovery({
  enabled,
  userId,
  tripId,
  revision,
  baseRevision,
  setDraft,
}: {
  enabled: boolean
  userId: string | undefined
  tripId: string
  revision: number
  baseRevision: number
  setDraft: Dispatch<SetStateAction<TripEditorDraft>>
}) {
  const [status, setStatus] = useState<TripRecoveryStatus>(enabled ? 'checking' : 'ready')
  const [record, setRecord] = useState<TripRecoveryRecord | null>(null)
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  const generationId = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !userId) {
      setStatus('ready')
      setRecord(null)
      generationId.current = null
      return
    }

    let active = true
    const result = readTripRecoveryDraft(userId, tripId)

    if (!active) return

    setStorageUnavailable(result.kind === 'unavailable')
    if (result.kind === 'available') {
      generationId.current = result.record.generationId
      setRecord(result.record)
      setStatus(result.record.baseRevision === revision ? 'available' : 'stale')
    } else {
      generationId.current = null
      setRecord(null)
      setStatus('ready')
    }

    return () => {
      active = false
    }
  }, [enabled, revision, tripId, userId])

  function restoreDraft() {
    if (status !== 'available' || !record || record.baseRevision !== revision) return false

    setDraft(record.draft)
    setRecord(null)
    setStatus('ready')
    return true
  }

  function keepDraftLocally() {
    if (status !== 'stale' || !record) return false

    setDraft(record.draft)
    setStatus('kept-local')
    return true
  }

  function discardRecoveryDraft() {
    if (!userId || !clearTripRecoveryDraft(userId, tripId, generationId.current)) {
      setStorageUnavailable(true)
      return false
    }

    setRecord(null)
    generationId.current = null
    setStatus('ready')
    setStorageUnavailable(false)
    return true
  }

  function discardPersistedDraft() {
    if (!userId) return false

    const current = readTripRecoveryDraft(userId, tripId)
    if (current.kind === 'unavailable') {
      setStorageUnavailable(true)
      return false
    }

    const currentGeneration =
      current.kind === 'available' ? current.record.generationId : generationId.current
    const cleared = clearTripRecoveryDraft(userId, tripId, currentGeneration)
    if (!cleared) {
      setStorageUnavailable(true)
      return false
    }

    generationId.current = null
    setRecord(null)
    setStatus('ready')
    setStorageUnavailable(false)
    return true
  }

  const clearPersistedDraft = useCallback(() => {
    if (!userId) return false

    const cleared = clearTripRecoveryDraft(userId, tripId, generationId.current)
    if (cleared) generationId.current = null
    else setStorageUnavailable(true)
    return cleared
  }, [tripId, userId])

  const persistDraft = useCallback(
    ({
      draft,
      dirty,
      saveStatus,
      currentRevision,
    }: {
      draft: TripEditorDraft
      dirty: boolean
      saveStatus: string
      currentRevision: number
    }) => {
      if (
        !enabled ||
        !userId ||
        status === 'checking' ||
        status === 'available' ||
        status === 'stale'
      )
        return true

      if (status === 'kept-local' || dirty || saveStatus !== 'idle') {
        const currentGeneration = generationId.current ?? crypto.randomUUID()
        const stored = writeTripRecoveryDraft({
          generationId: currentGeneration,
          userId,
          tripId,
          baseRevision:
            status === 'kept-local' ? (record?.baseRevision ?? currentRevision) : currentRevision,
          draft,
        })
        if (stored) generationId.current = currentGeneration
        setStorageUnavailable(!stored)
        return stored
      }

      const cleared = clearTripRecoveryDraft(userId, tripId, generationId.current)
      if (cleared) generationId.current = null
      setStorageUnavailable(!cleared)
      return cleared
    },
    [enabled, record?.baseRevision, status, tripId, userId],
  )

  return {
    canAutosave: status === 'ready',
    baseRevision: status === 'kept-local' ? (record?.baseRevision ?? baseRevision) : baseRevision,
    clearPersistedDraft,
    discardRecoveryDraft,
    discardPersistedDraft,
    generationId,
    keepDraftLocally,
    isLocalOnly: status === 'kept-local',
    record,
    persistDraft,
    restoreDraft,
    status,
    storageUnavailable,
  }
}
