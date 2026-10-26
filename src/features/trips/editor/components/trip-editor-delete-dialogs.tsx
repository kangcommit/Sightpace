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
import { formatDate, validDate } from '../trip-editor-utils'

export type ActivityDeleteTarget = {
  dayKey: string
  activityKey: string
  title: string
}

export type DayDeleteTarget = {
  key: string
  date: string
}

export function TripEditorDeleteDialogs({
  activityTarget,
  dayTarget,
  onCloseActivity,
  onDeleteActivity,
  onCloseDay,
  onDeleteDay,
}: {
  activityTarget: ActivityDeleteTarget | null
  dayTarget: DayDeleteTarget | null
  onCloseActivity: () => void
  onDeleteActivity: () => void
  onCloseDay: () => void
  onDeleteDay: () => void
}) {
  function handleActivityOpenChange(open: boolean) {
    if (!open) onCloseActivity()
  }

  function handleDayOpenChange(open: boolean) {
    if (!open) onCloseDay()
  }

  return (
    <>
      {activityTarget ? (
        <AlertDialog open onOpenChange={handleActivityOpenChange}>
          <AlertDialogPortal>
            <AlertDialogBackdrop />
            <AlertDialogViewport>
              <AlertDialogContent>
                <div className="flex flex-col gap-2">
                  <AlertDialogTitle>Delete “{activityTarget.title}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the activity and its travel estimates from your trip draft. Save
                    the trip to keep this change.
                  </AlertDialogDescription>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={onCloseActivity}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-11"
                    onClick={onDeleteActivity}
                  >
                    Delete
                  </Button>
                </div>
              </AlertDialogContent>
            </AlertDialogViewport>
          </AlertDialogPortal>
        </AlertDialog>
      ) : null}
      {dayTarget ? (
        <AlertDialog open onOpenChange={handleDayOpenChange}>
          <AlertDialogPortal>
            <AlertDialogBackdrop />
            <AlertDialogViewport>
              <AlertDialogContent>
                <div className="flex flex-col gap-2">
                  <AlertDialogTitle>
                    Delete Day “
                    {validDate(dayTarget.date) ? formatDate(dayTarget.date) : 'Choose date'}”?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the day, its activities and travel estimates from your trip draft.
                    Save the trip to keep this change.
                  </AlertDialogDescription>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" className="min-h-11" onClick={onCloseDay}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-11"
                    onClick={onDeleteDay}
                  >
                    Delete
                  </Button>
                </div>
              </AlertDialogContent>
            </AlertDialogViewport>
          </AlertDialogPortal>
        </AlertDialog>
      ) : null}
    </>
  )
}
