import type { TripEditorDraft } from './editor-contract'

export type InitialTrip = {
  id: string
  title: string
  destination: string
  revision: number
  days: Array<{
    id: string
    date: string
    startMinute: number
    finishMinute: number
    activities: Array<{
      id: string
      title: string
      placeLabel: string | null
      durationMinutes: number
      fixedStartMinute: number | null
    }>
    travelEstimates: Array<{ fromActivityId: string; toActivityId: string; minutes: number }>
  }>
}

export type EditorDay = TripEditorDraft['days'][number]
export type EditorActivity = EditorDay['activities'][number]

export const toTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

export const fromTime = (time: string) => {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

export const formatTime = (minute: number) => {
  const dayOffset = Math.floor(minute / 1440)
  const time = toTime(minute % 1440)

  if (dayOffset === 0) return time

  return `${time} (${dayOffset === 1 ? 'next day' : `${dayOffset} days later`})`
}

export const formatDate = (date: string) =>
  new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00.000Z`))

export const validDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false

  const parsed = new Date(`${date}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date
}

export function toDraft(trip: InitialTrip): TripEditorDraft {
  return {
    title: trip.title,
    destination: trip.destination,
    days: trip.days.map((day) => ({
      key: day.id,
      id: day.id,
      date: day.date,
      startMinute: day.startMinute,
      finishMinute: day.finishMinute,
      activities: day.activities.map((activity) => ({
        ...activity,
        key: activity.id,
        id: activity.id,
        placeLabel: activity.placeLabel ?? '',
      })),
      travelEstimates: day.travelEstimates.map((item) => ({
        fromKey: item.fromActivityId,
        toKey: item.toActivityId,
        minutes: item.minutes,
      })),
    })),
  }
}
