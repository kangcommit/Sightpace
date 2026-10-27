'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { signInPath } from '@/lib/auth-redirect'
import { calculateDaySchedule } from '@/lib/scheduling'
import { isDateTodayOrLater, todayDate } from '../shared/date-rules'
import { ActivityDialog } from './components/activity-dialog'
import { TripEditorDayFields } from './components/trip-editor-day-fields'
import { TripEditorDayNavigation } from './components/trip-editor-day-navigation'
import { TripEditorDayView } from './components/trip-editor-day-view'
import {
  type ActivityDeleteTarget,
  type DayDeleteTarget,
  TripEditorDeleteDialogs,
} from './components/trip-editor-delete-dialogs'
import { TripEditorNavigationDialog } from './components/trip-editor-navigation-dialog'
import { TripEditorRecovery } from './components/trip-editor-recovery'
import { TripEditorTripDetails } from './components/trip-editor-trip-details'
import type { TripEditorDraft } from './editor-contract'
import type { EditorActivity, InitialTrip } from './trip-editor-utils'
import { fromTime, toDraft, validDate } from './trip-editor-utils'
import { useTripAutosave } from './use-trip-autosave'
import { useTripDraftRecovery } from './use-trip-draft-recovery'

export function TripEditor({
  trip,
  userId,
  minimumDate = todayDate(),
  initialDraft,
  sampleMode = false,
  onDraftChange,
}: {
  trip: InitialTrip
  userId?: string
  minimumDate?: string
  initialDraft?: TripEditorDraft
  sampleMode?: boolean
  onDraftChange?: (draft: TripEditorDraft) => void
}) {
  const router = useRouter()
  const initial = useMemo(() => initialDraft ?? toDraft(trip), [initialDraft, trip])
  const [recoveryBaseRevision] = useState(trip.revision)
  const [draft, setDraft] = useState(initial)
  const [selectedKey, setSelectedKey] = useState(initial.days[0]?.key ?? '')
  const [newDayOpen, setNewDayOpen] = useState(false)
  const [newDayDate, setNewDayDate] = useState('')
  const [newDayStart, setNewDayStart] = useState('')
  const [newDayFinish, setNewDayFinish] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ActivityDeleteTarget | null>(null)
  const [deleteDayTarget, setDeleteDayTarget] = useState<DayDeleteTarget | null>(null)
  const [editing, setEditing] = useState<EditorActivity | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dayError, setDayError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [conflictKeptLocally, setConflictKeptLocally] = useState(false)
  const [navigationHref, setNavigationHref] = useState<string | null>(null)
  const [leaveIntent, setLeaveIntent] = useState<'save' | 'discard' | null>(null)
  const [navigationError, setNavigationError] = useState<string | null>(null)
  const selected = draft.days.find((day) => day.key === selectedKey) ?? draft.days[0]
  const dateCounts = new Map<string, number>()
  for (const day of draft.days) dateCounts.set(day.date, (dateCounts.get(day.date) ?? 0) + 1)
  const selectedDuplicateDate = selected ? (dateCounts.get(selected.date) ?? 0) > 1 : false
  const titleInvalid = draft.title.trim().length === 0
  const destinationInvalid = draft.destination.trim().length === 0
  const invalidDay = (day: TripEditorDraft['days'][number]) =>
    !validDate(day.date) ||
    !isDateTodayOrLater(day.date, minimumDate) ||
    (dateCounts.get(day.date) ?? 0) > 1 ||
    day.startMinute < 0 ||
    day.startMinute > 1438 ||
    day.finishMinute < 1 ||
    day.finishMinute > 1439 ||
    day.startMinute >= day.finishMinute
  const schedule = selected
    ? calculateDaySchedule({
        startMinute: selected.startMinute,
        finishMinute: selected.finishMinute,
        activities: selected.activities.map(({ key, durationMinutes, fixedStartMinute }) => ({
          id: key,
          durationMinutes,
          fixedStartMinute,
        })),
        travelEstimates: selected.travelEstimates.map(({ fromKey, toKey, minutes }) => ({
          fromActivityId: fromKey,
          toActivityId: toKey,
          minutes,
        })),
      })
    : null
  const scheduleByKey = new Map(schedule?.entries.map((entry) => [entry.activityId, entry]) ?? [])
  const canSave = !titleInvalid && !destinationInvalid && !draft.days.some(invalidDay)
  const recoveryEnabled = !sampleMode && Boolean(userId)
  const recovery = useTripDraftRecovery({
    enabled: recoveryEnabled,
    userId,
    tripId: trip.id,
    revision: recoveryBaseRevision,
    baseRevision: recoveryBaseRevision,
    setDraft,
  })
  const {
    dirty,
    error: saveError,
    needsReload,
    retrySave,
    cancelPendingSave,
    saveNow,
    revision: currentRevision,
    status: saveStatus,
  } = useTripAutosave({
    tripId: trip.id,
    initialDraft: initial,
    initialRevision: trip.revision,
    draft,
    setDraft,
    canSave,
    enabled: !sampleMode && (!recoveryEnabled || recovery.canAutosave),
  })
  const hasPendingChanges =
    dirty ||
    saveStatus === 'saving' ||
    saveStatus === 'failed' ||
    saveStatus === 'unauthenticated' ||
    needsReload ||
    recovery.status === 'stale' ||
    recovery.isLocalOnly
  const canSaveBeforeLeaving =
    canSave && !needsReload && recovery.status === 'ready' && !recovery.isLocalOnly
  const saveBlockedMessage =
    needsReload || recovery.status === 'stale' || recovery.isLocalOnly
      ? 'Resolve the older local changes before saving and leaving.'
      : 'Fix highlighted fields before saving and leaving.'

  function handleStayOnTrip() {
    setNavigationHref(null)
    setLeaveIntent(null)
    setNavigationError(null)
  }

  function handleSaveAndLeave() {
    if (!navigationHref || !canSaveBeforeLeaving) return

    setNavigationError(null)
    if (!dirty && saveStatus === 'idle') {
      if (!recovery.clearPersistedDraft()) {
        setNavigationError(
          'The saved changes could not be cleared from this device. Keep this page open and try again.',
        )
        return
      }

      const destination = navigationHref
      handleStayOnTrip()
      router.push(destination)
      return
    }

    setLeaveIntent('save')
    if (saveStatus === 'failed' || saveStatus === 'unauthenticated') {
      retrySave()
      return
    }

    if (!saveNow())
      setNavigationError('Your changes could not be saved yet. Keep this page open and retry.')
  }

  function handleDiscardAndLeave() {
    if (!navigationHref || !cancelPendingSave()) return
    if (!recovery.discardPersistedDraft()) {
      setNavigationError(
        'The recovery copy could not be cleared. Keep this page open and try again.',
      )
      return
    }

    router.push(navigationHref)
    handleStayOnTrip()
  }

  useEffect(() => {
    if (!navigationHref || leaveIntent !== 'save' || dirty || saveStatus !== 'idle') return
    if (!recovery.clearPersistedDraft()) {
      setNavigationError(
        'The saved changes could not be cleared from this device. Keep this page open and try again.',
      )
      setLeaveIntent(null)
      return
    }

    router.push(navigationHref)
    setNavigationHref(null)
    setLeaveIntent(null)
    setNavigationError(null)
  }, [dirty, leaveIntent, navigationHref, recovery.clearPersistedDraft, router, saveStatus])

  useEffect(() => {
    if (sampleMode || !hasPendingChanges) return

    function handleDocumentClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return

      const clicked = event.target
      if (!(clicked instanceof Element)) return

      const anchor = clicked.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search &&
        destination.hash === window.location.hash
      )
        return

      event.preventDefault()
      event.stopPropagation()
      setNavigationError(null)
      setLeaveIntent(null)
      setNavigationHref(`${destination.pathname}${destination.search}${destination.hash}`)
    }

    window.document.addEventListener('click', handleDocumentClick, true)

    return () => window.document.removeEventListener('click', handleDocumentClick, true)
  }, [hasPendingChanges, sampleMode])

  useEffect(() => {
    if (sampleMode || !hasPendingChanges) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasPendingChanges, sampleMode])

  useEffect(() => {
    recovery.persistDraft({ draft, dirty, saveStatus, currentRevision })
  }, [currentRevision, dirty, draft, recovery.persistDraft, saveStatus])

  useEffect(() => {
    onDraftChange?.(draft)
  }, [draft, onDraftChange])

  function updateDay(
    key: string,
    update: (day: TripEditorDraft['days'][number]) => TripEditorDraft['days'][number],
  ) {
    setDraft((current) => ({
      ...current,
      days: current.days
        .map((day) => (day.key === key ? update(day) : day))
        .sort((left, right) => left.date.localeCompare(right.date)),
    }))
  }

  function handleTitleChange(title: string) {
    setDraft((current) => ({ ...current, title }))
  }

  function handleDestinationChange(destination: string) {
    setDraft((current) => ({ ...current, destination }))
  }

  function handleToggleNewDay() {
    setNewDayOpen((current) => !current)
  }

  function handleSelectedDateChange(date: string) {
    if (!selected) return

    updateDay(selected.key, (day) => ({ ...day, date }))
  }

  function handleSelectedStartChange(startMinute: number) {
    if (!selected) return

    updateDay(selected.key, (day) => ({ ...day, startMinute }))
  }

  function handleSelectedFinishChange(finishMinute: number) {
    if (!selected) return

    updateDay(selected.key, (day) => ({ ...day, finishMinute }))
  }

  function handleDeleteDayRequest() {
    if (!selected) return

    setDeleteDayTarget({ key: selected.key, date: selected.date })
  }

  function handleAddActivity() {
    setEditing(null)
    setDialogOpen(true)
  }

  function handleEditActivity(activity: EditorActivity) {
    setEditing(activity)
    setDialogOpen(true)
  }

  function handleDeleteActivityRequest(activity: EditorActivity) {
    if (!selected) return

    setDeleteTarget({
      dayKey: selected.key,
      activityKey: activity.key,
      title: activity.title,
    })
  }

  function handleDiscardRecovery() {
    const reloadLatest = recovery.status === 'stale' || recovery.isLocalOnly
    if (!recovery.discardRecoveryDraft()) return

    if (recovery.isLocalOnly) setDraft(initial)
    if (reloadLatest) router.refresh()
  }

  function handleDiscardConflict() {
    if (!recovery.clearPersistedDraft()) return

    router.refresh()
  }

  function handleKeepConflictLocally() {
    setConflictKeptLocally(true)
  }

  function handleCloseActivityDelete() {
    setDeleteTarget(null)
  }

  function handleCloseDayDelete() {
    setDeleteDayTarget(null)
  }

  function handleCloseActivityDialog() {
    setDialogOpen(false)
    setEditing(null)
  }

  function addDay(date: string, start: string, finish: string) {
    setDayError(null)
    if (!date || !start || !finish || fromTime(start) >= fromTime(finish)) {
      setDayError('Enter a date and a finish time later than the start time.')
      return false
    }
    if (!validDate(date)) {
      setDayError('Enter a valid day date.')
      return false
    }
    if (!isDateTodayOrLater(date, minimumDate)) {
      setDayError('Choose today or a future date.')
      return false
    }
    if (draft.days.some((day) => day.date === date)) {
      setDayError('A day already uses this date.')
      return false
    }
    if (draft.days.length >= 30) {
      setDayError('A trip can have up to 30 days.')
      return false
    }
    const key = `draft-day-${crypto.randomUUID()}`
    const day = {
      key,
      date,
      startMinute: fromTime(start),
      finishMinute: fromTime(finish),
      activities: [],
      travelEstimates: [],
    }
    setDraft((current) => ({
      ...current,
      days: [...current.days, day].sort((a, b) => a.date.localeCompare(b.date)),
    }))
    setSelectedKey(key)
    setNewDayDate('')
    setNewDayStart('')
    setNewDayFinish('')
    setNewDayOpen(false)
    return true
  }

  function commitActivity(activity: TripEditorDraft['days'][number]['activities'][number]) {
    if (!selected) return
    updateDay(selected.key, (day) => ({
      ...day,
      activities: editing
        ? day.activities.map((item) => (item.key === editing.key ? activity : item))
        : [...day.activities, activity],
    }))
    setDialogOpen(false)
    setEditing(null)
  }

  function moveActivity(activity: EditorActivity, index: number, offset: -1 | 1) {
    if (!selected) return

    updateDay(selected.key, (day) => {
      const activities = [...day.activities]
      const destination = index + offset
      ;[activities[index], activities[destination]] = [activities[destination], activities[index]]
      return { ...day, activities }
    })
    setAnnouncement(
      `Moved ${activity.title} to position ${index + (offset === -1 ? 0 : 2)} of ${selected.activities.length}.`,
    )
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-activity-key="${CSS.escape(activity.key)}"]`)
        ?.focus(),
    )
  }

  function setTravelEstimate(from: string, to: string, minutes: number | null) {
    if (!selected) return

    updateDay(selected.key, (day) => ({
      ...day,
      travelEstimates:
        minutes === null
          ? day.travelEstimates.filter((item) => item.fromKey !== from || item.toKey !== to)
          : [
              ...day.travelEstimates.filter((item) => item.fromKey !== from || item.toKey !== to),
              { fromKey: from, toKey: to, minutes },
            ],
    }))
  }

  function deleteActivity() {
    if (!deleteTarget) return

    updateDay(deleteTarget.dayKey, (day) => ({
      ...day,
      activities: day.activities.filter((item) => item.key !== deleteTarget.activityKey),
      travelEstimates: day.travelEstimates.filter(
        (item) =>
          item.fromKey !== deleteTarget.activityKey && item.toKey !== deleteTarget.activityKey,
      ),
    }))
    setDeleteTarget(null)
  }

  function deleteDay() {
    if (!deleteDayTarget) return

    setDraft((current) => ({
      ...current,
      days: current.days.filter((day) => day.key !== deleteDayTarget.key),
    }))
    setSelectedKey(draft.days.find((day) => day.key !== deleteDayTarget.key)?.key ?? '')
    setDeleteDayTarget(null)
  }

  return (
    <div className="flex flex-col gap-8">
      {!sampleMode ? (
        <TripEditorRecovery
          status={recovery.status}
          record={recovery.record}
          storageUnavailable={recovery.storageUnavailable}
          onRestore={recovery.restoreDraft}
          onKeepLocally={recovery.keepDraftLocally}
          onDiscard={handleDiscardRecovery}
          saveConflict={needsReload}
          conflictMessage={saveError?.message ?? null}
          conflictKeptLocally={conflictKeptLocally || recovery.isLocalOnly}
          onKeepConflictLocally={handleKeepConflictLocally}
          onDiscardConflict={handleDiscardConflict}
        />
      ) : null}
      <TripEditorTripDetails
        draft={draft}
        titleInvalid={titleInvalid}
        destinationInvalid={destinationInvalid}
        onTitleChange={handleTitleChange}
        onDestinationChange={handleDestinationChange}
      />

      <section className="flex flex-col gap-4" aria-label="Trip planning">
        <TripEditorDayNavigation
          days={draft.days}
          selectedKey={selected?.key ?? ''}
          newDayOpen={newDayOpen}
          minimumDate={minimumDate}
          date={newDayDate}
          start={newDayStart}
          finish={newDayFinish}
          error={dayError}
          onSelect={setSelectedKey}
          onToggle={handleToggleNewDay}
          onDateChange={setNewDayDate}
          onStartChange={setNewDayStart}
          onFinishChange={setNewDayFinish}
          onAdd={addDay}
        />
        {selected && schedule ? (
          <>
            <TripEditorDayFields
              day={selected}
              minimumDate={minimumDate}
              duplicateDate={selectedDuplicateDate}
              onDateChange={handleSelectedDateChange}
              onStartChange={handleSelectedStartChange}
              onFinishChange={handleSelectedFinishChange}
              onDelete={handleDeleteDayRequest}
            />
            <TripEditorDayView
              day={selected}
              schedule={schedule}
              scheduleByKey={scheduleByKey}
              onAddActivity={handleAddActivity}
              onMoveActivity={moveActivity}
              onEditActivity={handleEditActivity}
              onDeleteActivity={handleDeleteActivityRequest}
              onTravelChange={setTravelEstimate}
            />
          </>
        ) : selected ? null : (
          <p className="text-muted-foreground">Add a day to start planning.</p>
        )}
      </section>
      {announcement ? (
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      ) : null}
      {!sampleMode ? (
        <TripEditorNavigationDialog
          open={navigationHref !== null}
          saveStatus={saveStatus}
          saveError={saveError?.message ?? null}
          cleanupError={navigationError}
          saveBlockedMessage={saveBlockedMessage}
          signInHref={signInPath(`/trips/${trip.id}`)}
          canSave={canSaveBeforeLeaving}
          canDiscard={saveStatus !== 'saving'}
          onStay={handleStayOnTrip}
          onSaveAndLeave={handleSaveAndLeave}
          onDiscardAndLeave={handleDiscardAndLeave}
        />
      ) : null}
      {!sampleMode && saveError && !needsReload ? (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="destructive">
            <AlertDescription>
              {saveError.message}{' '}
              {saveError.code === 'UNAUTHENTICATED' ? (
                <>
                  Your edits remain in this tab.{' '}
                  <Link
                    href={signInPath(`/trips/${trip.id}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-visible:ring-ring rounded-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
                  >
                    Sign in in another tab
                  </Link>
                  , then retry saving.
                </>
              ) : null}
            </AlertDescription>
          </Alert>
          {saveError.code === 'TEMPORARILY_UNAVAILABLE' || saveError.code === 'UNAUTHENTICATED' ? (
            <Button variant="outline" className="min-h-11" onClick={retrySave}>
              Retry save
            </Button>
          ) : null}
        </div>
      ) : null}
      <TripEditorDeleteDialogs
        activityTarget={deleteTarget}
        dayTarget={deleteDayTarget}
        onCloseActivity={handleCloseActivityDelete}
        onDeleteActivity={deleteActivity}
        onCloseDay={handleCloseDayDelete}
        onDeleteDay={deleteDay}
      />
      {!sampleMode && recovery.status !== 'checking' ? (
        <p role="status" aria-live="polite" className="sr-only">
          {needsReload || recovery.status === 'stale' || recovery.isLocalOnly
            ? 'Saving paused'
            : recovery.status === 'available'
              ? 'Unsaved changes are available on this device'
              : saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'failed'
                  ? 'Changes haven’t saved'
                  : saveStatus === 'unauthenticated'
                    ? 'Saving paused'
                    : !canSave && dirty
                      ? 'Fix the highlighted fields to save'
                      : dirty
                        ? 'Unsaved changes'
                        : 'All changes saved'}
        </p>
      ) : null}
      {dialogOpen ? (
        <ActivityDialog
          key={editing?.key ?? 'new'}
          current={editing}
          onClose={handleCloseActivityDialog}
          onCommit={commitActivity}
        />
      ) : null}
    </div>
  )
}
