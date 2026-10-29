'use client'

import { useRef, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { DayScheduleResult } from '@/lib/scheduling'
import type { EditorActivity, EditorDay } from '../trip-editor-utils'
import { TripEditorActivities } from './trip-editor-activities'
import { TripEditorScheduleSummary } from './trip-editor-schedule-summary'
import { TripEditorTimeline } from './trip-editor-timeline'

type DayView = 'list' | 'timeline'

export function TripEditorDayView({
  day,
  schedule,
  scheduleByKey,
  onAddActivity,
  onMoveActivity,
  onEditActivity,
  onDeleteActivity,
  onTravelChange,
}: {
  day: EditorDay
  schedule: DayScheduleResult
  scheduleByKey: ReadonlyMap<string, DayScheduleResult['entries'][number]>
  onAddActivity: () => void
  onMoveActivity: (activity: EditorActivity, index: number, offset: -1 | 1) => void
  onEditActivity: (activity: EditorActivity) => void
  onDeleteActivity: (activity: EditorActivity) => void
  onTravelChange: (from: string, to: string, minutes: number | null) => void
}) {
  const [view, setView] = useState<DayView>('list')
  const reviewTargetId = useRef<string | null>(null)

  function selectView(nextView: DayView) {
    setView(nextView)
  }

  function handleViewChange(nextView: string) {
    if (nextView === 'list' || nextView === 'timeline') selectView(nextView)
  }

  function handleFocusReviewTarget() {
    const targetId = reviewTargetId.current
    if (!targetId) return

    document.getElementById(targetId)?.focus()
    reviewTargetId.current = null
  }

  function handleReviewIssue(targetId: string) {
    reviewTargetId.current = targetId
    selectView('list')
    requestAnimationFrame(handleFocusReviewTarget)
  }

  const listVisibility = view === 'list' ? 'min-w-0' : 'hidden min-w-0 md:block'
  const timelineVisibility = view === 'timeline' ? 'min-w-0' : 'hidden min-w-0 md:block'

  return (
    <>
      <Tabs value={view} onValueChange={handleViewChange} className="contents">
        <TabsList
          activateOnFocus
          aria-label="Day view"
          className="h-auto min-h-11 w-fit gap-1 rounded-lg p-1 md:hidden"
        >
          <TabsTrigger
            id="day-view-tab-list"
            value="list"
            aria-controls="day-view-panel-list"
            className="min-h-11"
          >
            List
          </TabsTrigger>
          <TabsTrigger
            id="day-view-tab-timeline"
            value="timeline"
            aria-controls="day-view-panel-timeline"
            className="min-h-11"
          >
            Timeline
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:gap-6">
        <div
          id="day-view-panel-list"
          role="tabpanel"
          aria-labelledby="day-view-tab-list"
          className={listVisibility}
        >
          <TripEditorActivities
            day={day}
            scheduleByKey={scheduleByKey}
            onAdd={onAddActivity}
            onMove={onMoveActivity}
            onEdit={onEditActivity}
            onDelete={onDeleteActivity}
            onTravelChange={onTravelChange}
          />
        </div>
        <div
          id="day-view-panel-timeline"
          role="tabpanel"
          aria-labelledby="day-view-tab-timeline"
          className={timelineVisibility}
        >
          <TripEditorTimeline day={day} schedule={schedule} onEditActivity={onEditActivity} />
        </div>
      </div>
      <TripEditorScheduleSummary day={day} schedule={schedule} onReviewIssue={handleReviewIssue} />
    </>
  )
}
