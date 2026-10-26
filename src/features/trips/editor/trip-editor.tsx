'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { signInPath } from '@/lib/auth-redirect'
import { calculateDaySchedule } from '@/lib/scheduling'
import { isDateTodayOrLater, todayDate } from '../shared/date-rules'
import { ActivityDialog } from './components/activity-dialog'
import { TripEditorActivities } from './components/trip-editor-activities'
import { TripEditorDayFields } from './components/trip-editor-day-fields'
import { TripEditorDayNavigation } from './components/trip-editor-day-navigation'
import {
  type ActivityDeleteTarget,
  type DayDeleteTarget,
  TripEditorDeleteDialogs,
} from './components/trip-editor-delete-dialogs'
import { TripEditorScheduleSummary } from './components/trip-editor-schedule-summary'
import { TripEditorTripDetails } from './components/trip-editor-trip-details'
import type { TripEditorDraft } from './editor-contract'
import type { EditorActivity, InitialTrip } from './trip-editor-utils'
import { fromTime, toDraft, validDate } from './trip-editor-utils'
import { useTripAutosave } from './use-trip-autosave'

export function TripEditor({
  trip,
  minimumDate = todayDate(),
}: {
  trip: InitialTrip
  minimumDate?: string
}) {
  const router = useRouter()
  const initial = useMemo(() => toDraft(trip), [trip])
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
  const {
    dirty,
    error: saveError,
    needsReload,
    retrySave,
    status: saveStatus,
  } = useTripAutosave({
    tripId: trip.id,
    initialDraft: initial,
    initialRevision: trip.revision,
    draft,
    setDraft,
    canSave,
  })

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

  function handleRefresh() {
    router.refresh()
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
        {selected ? (
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
            <TripEditorActivities
              day={selected}
              scheduleByKey={scheduleByKey}
              onAdd={handleAddActivity}
              onMove={moveActivity}
              onEdit={handleEditActivity}
              onDelete={handleDeleteActivityRequest}
              onTravelChange={setTravelEstimate}
            />
            {schedule ? (
              <TripEditorScheduleSummary schedule={schedule} finishMinute={selected.finishMinute} />
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">Add a day to start planning.</p>
        )}
      </section>
      {announcement ? (
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      ) : null}
      {saveError ? (
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
          {needsReload ? (
            <Button variant="outline" className="min-h-11" onClick={handleRefresh}>
              Discard edits and reload latest
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
      <p role="status" aria-live="polite" className="sr-only">
        {saveStatus === 'saving'
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
