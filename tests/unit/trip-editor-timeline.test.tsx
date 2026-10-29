import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TripEditor } from '@/features/trips/editor/trip-editor'
import { todayDate } from '@/features/trips/shared/date-rules'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), save: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/features/trips/server/save-trip-action', () => ({ saveTripEditorAction: mocks.save }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  mocks.save.mockResolvedValue({ ok: true, revision: 2, ids: {} })
})

const trip = {
  id: 'b0000000-0000-4000-8000-000000000001',
  title: 'Lisbon day',
  destination: 'Lisbon',
  revision: 1,
  days: [
    {
      id: 'b0000000-0000-4000-8000-000000000002',
      date: todayDate(),
      startMinute: 540,
      finishMinute: 720,
      activities: [
        {
          id: 'b0000000-0000-4000-8000-000000000003',
          title: 'Museum',
          placeLabel: null,
          durationMinutes: 60,
          fixedStartMinute: null,
        },
        {
          id: 'b0000000-0000-4000-8000-000000000004',
          title: 'Lunch',
          placeLabel: null,
          durationMinutes: 45,
          fixedStartMinute: 600,
        },
        {
          id: 'b0000000-0000-4000-8000-000000000005',
          title: 'Gallery',
          placeLabel: null,
          durationMinutes: 60,
          fixedStartMinute: null,
        },
      ],
      travelEstimates: [
        {
          fromActivityId: 'b0000000-0000-4000-8000-000000000003',
          toActivityId: 'b0000000-0000-4000-8000-000000000004',
          minutes: 30,
        },
      ],
    },
  ],
}

it('switches mobile views with keyboard tabs without losing the current draft', async () => {
  // Arrange
  render(<TripEditor trip={trip} sampleMode />)
  const listTab = screen.getByRole('tab', { name: 'List' })
  const timelineTab = screen.getByRole('tab', { name: 'Timeline' })

  // Act
  fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Lisbon weekend' } })
  listTab.focus()
  fireEvent.keyDown(listTab, { key: 'ArrowRight' })

  // Assert
  await waitFor(() => {
    expect(timelineTab).toHaveAttribute('aria-selected', 'true')
    expect(timelineTab).toHaveFocus()
  })
  expect(screen.getByLabelText('Trip name')).toHaveValue('Lisbon weekend')
  expect(screen.getByRole('tabpanel', { name: 'Timeline' })).not.toHaveClass('hidden')
  expect(screen.getByRole('tabpanel', { name: 'List' })).toHaveClass('hidden')
})

it('shows travel, booking lateness and provisional overrun with review controls', async () => {
  // Arrange
  render(<TripEditor trip={trip} sampleMode />)
  const timeline = screen.getByRole('tabpanel', { name: 'Timeline' })
  const lunch = within(timeline).getByRole('button', { name: /Edit Lunch/ })
  const gallery = within(timeline).getByRole('button', { name: /Edit Gallery/ })
  const issueSummary = screen.getByText('Review 3 timing issues')

  // Act
  fireEvent.click(issueSummary)
  fireEvent.click(screen.getByRole('button', { name: 'Travel time not set: Lunch to Gallery.' }))
  await waitFor(() =>
    expect(screen.getByLabelText('Travel minutes: Lunch to Gallery')).toHaveFocus(),
  )

  // Assert
  expect(within(timeline).getByText('Travel · 30 min')).toBeVisible()
  expect(within(timeline).getByText('Travel time not set')).toBeVisible()
  expect(lunch).toHaveAccessibleName(
    'Edit Lunch; projected 10:30 to 11:15; 45 minutes; booked 10:00; arrive 10:30, 30 minutes late',
  )
  expect(gallery).toHaveAccessibleName(
    'Edit Gallery; projected 11:15 to 12:15; 60 minutes; provisional because earlier travel time is missing',
  )
  expect(within(lunch).getByText('Booked 10:00')).toBeVisible()
  expect(within(lunch).getByText('Arrive 10:30 · 30 min late')).toBeVisible()
  expect(
    screen.getByText(/Projected finish 12:15 · day finishes 12:00 · 15 min after/),
  ).toBeVisible()
  expect(within(timeline).getByText('Provisional')).toBeVisible()
})

it('switches back to the list before focusing a hidden mobile conflict target', async () => {
  // Arrange
  render(<TripEditor trip={trip} sampleMode />)
  const listTab = screen.getByRole('tab', { name: 'List' })
  const issueSummary = screen.getByText('Review 3 timing issues')
  const travelInput = screen.getByLabelText('Travel minutes: Lunch to Gallery')

  // Act
  listTab.focus()
  fireEvent.keyDown(listTab, { key: 'ArrowRight' })
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true'),
  )
  fireEvent.click(issueSummary)
  fireEvent.click(screen.getByRole('button', { name: 'Travel time not set: Lunch to Gallery.' }))
  await waitFor(() => expect(travelInput).toHaveFocus())

  // Assert
  await waitFor(() => expect(listTab).toHaveAttribute('aria-selected', 'true'))
  expect(screen.getByRole('tabpanel', { name: 'List' })).not.toHaveClass('hidden')
})

it('explains an early arrival as waiting before the unchanged booking', () => {
  // Arrange
  const earlyTrip = {
    ...trip,
    days: [
      {
        ...trip.days[0],
        finishMinute: 1080,
        activities: [
          trip.days[0].activities[0],
          { ...trip.days[0].activities[1], fixedStartMinute: 720 },
        ],
        travelEstimates: [trip.days[0].travelEstimates[0]],
      },
    ],
  }
  render(<TripEditor trip={earlyTrip} sampleMode />)

  // Act
  const lunch = screen.getByRole('listitem', { name: 'Activity 2: Lunch' })
  const timeline = screen.getByRole('tabpanel', { name: 'Timeline' })

  // Assert
  expect(within(lunch).getByText('Arrive 10:30 · wait 90 min · booking 12:00.')).toBeVisible()
  expect(within(timeline).getByText('Wait 90 min · booking 12:00')).toBeVisible()
})

it('opens the existing activity editor from a timeline activity', () => {
  // Arrange
  render(<TripEditor trip={trip} sampleMode />)
  const timeline = screen.getByRole('tabpanel', { name: 'Timeline' })

  // Act
  fireEvent.click(within(timeline).getByRole('button', { name: /Edit Lunch/ }))

  // Assert
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Edit activity')
  expect(within(screen.getByRole('dialog')).getByLabelText('Name')).toHaveValue('Lunch')
})

it('keeps short fixed-late activity blocks tall enough for every visible detail', () => {
  // Arrange
  const shortTrip = {
    ...trip,
    days: [
      {
        ...trip.days[0],
        activities: [{ ...trip.days[0].activities[0], durationMinutes: 1, fixedStartMinute: 539 }],
        travelEstimates: [],
      },
    ],
  }
  render(<TripEditor trip={shortTrip} sampleMode />)
  const timeline = screen.getByRole('tabpanel', { name: 'Timeline' })
  const activity = within(timeline).getByRole('button', { name: /Edit Museum/ })

  // Act
  const renderedHeight = Number.parseFloat(activity.style.height)

  // Assert
  expect(renderedHeight).toBeGreaterThanOrEqual(80)
  expect(within(activity).getByText('Booked 08:59')).toBeVisible()
  expect(within(activity).getByText('Arrive 09:00 · 1 min late')).toBeVisible()
})
