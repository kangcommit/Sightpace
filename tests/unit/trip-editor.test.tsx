import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TripEditor } from '@/features/trips/editor/trip-editor'
import { todayDate } from '@/features/trips/shared/date-rules'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), save: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/features/trips/server/save-trip-action', () => ({ saveTripEditorAction: mocks.save }))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

beforeEach(() => {
  mocks.save.mockResolvedValue({ ok: true, revision: 2, ids: {} })
})

const currentDate = todayDate()

function offsetDate(days: number) {
  const date = new Date(`${currentDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const trip = {
  id: 'b0000000-0000-4000-8000-000000000001',
  title: 'Lisbon week',
  destination: 'Lisbon',
  revision: 1,
  days: [
    {
      id: 'b0000000-0000-4000-8000-000000000002',
      date: currentDate,
      startMinute: 540,
      finishMinute: 1080,
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
          fixedStartMinute: 720,
        },
      ],
      travelEstimates: [],
    },
  ],
}

function openNewDayForm() {
  const trigger = screen.getByRole('button', { name: 'Add another day' })
  fireEvent.click(trigger)
  return trigger
}

it('reveals a clearly labeled new-day form on demand', () => {
  // Arrange
  render(<TripEditor trip={trip} />)
  const dayNavigation = screen.getByRole('navigation', { name: 'Trip days' })
  const trigger = within(dayNavigation).getByRole('button', { name: 'Add another day' })

  // Act
  fireEvent.click(trigger)

  // Assert
  expect(within(dayNavigation).getByRole('button', { name: /Day 1 ·/ })).toBeVisible()
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByLabelText('New day date')).toBeVisible()
})

it('keeps sample edits local without invoking private autosave', async () => {
  // Arrange
  vi.useFakeTimers()
  render(<TripEditor trip={trip} sampleMode />)

  // Act
  fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Edited sample' } })
  await act(async () => {
    vi.advanceTimersByTime(1000)
  })

  // Assert
  expect(mocks.save).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Trip name')).toHaveValue('Edited sample')
})

it('preserves new-day values when the form is hidden and shown again', () => {
  // Arrange
  render(<TripEditor trip={trip} />)
  const trigger = screen.getByRole('button', { name: 'Add another day' })

  // Act
  fireEvent.click(trigger)
  fireEvent.change(screen.getByLabelText('New day date'), { target: { value: offsetDate(1) } })
  fireEvent.click(trigger)
  fireEvent.click(trigger)

  // Assert
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByLabelText('New day date')).toHaveValue(offsetDate(1))
})

it('recalculates missing-travel projections and provisional timing immediately', () => {
  // Arrange
  render(<TripEditor trip={trip} />)

  // Act
  const lunch = screen.getByRole('listitem', { name: 'Activity 2: Lunch' })

  // Assert
  expect(lunch).toBeVisible()
  expect(lunch).toHaveTextContent('12:00–12:45')
  expect(within(lunch).queryByText(/Booked/)).not.toBeInTheDocument()
  expect(screen.getByText(/travel estimate not set/i)).toBeVisible()
  expect(screen.getByText('Provisional: earlier travel time is missing.')).toBeVisible()
  expect(screen.getByText(/Projected finish/)).toHaveTextContent('12:45')
})

it('shows a late booking separately from projected attendance', () => {
  // Arrange
  const lateTrip = {
    ...trip,
    days: [
      {
        ...trip.days[0],
        activities: [
          trip.days[0].activities[0],
          { ...trip.days[0].activities[1], fixedStartMinute: 600 },
        ],
        travelEstimates: [
          {
            fromActivityId: trip.days[0].activities[0].id,
            toActivityId: trip.days[0].activities[1].id,
            minutes: 30,
          },
        ],
      },
    ],
  }
  render(<TripEditor trip={lateTrip} />)

  // Act
  const lunch = screen.getByRole('listitem', { name: 'Activity 2: Lunch' })

  // Assert
  expect(lunch).toHaveTextContent('10:30–11:15')
  expect(
    within(lunch).getByText('Booked 10:00 · projected arrival 10:30 · 30 min late'),
  ).toBeVisible()
})

it('formats activity times after midnight as next-day clock times without a duplicate booking line', () => {
  // Arrange
  const overnightTrip = {
    ...trip,
    days: [
      {
        ...trip.days[0],
        startMinute: 1344,
        finishMinute: 1439,
        activities: [
          {
            ...trip.days[0].activities[0],
            title: 'Cycling',
            durationMinutes: 200,
            fixedStartMinute: 1344,
          },
        ],
        travelEstimates: [],
      },
    ],
  }
  render(<TripEditor trip={overnightTrip} />)

  // Act
  const cycling = screen.getByRole('listitem', { name: 'Activity 1: Cycling' })

  // Assert
  expect(cycling).toHaveTextContent('22:24–01:44 (next day)')
  expect(within(cycling).queryByText(/Booked/)).not.toBeInTheDocument()
  expect(screen.getByText(/Projected finish/)).toHaveTextContent('01:44 (next day)')
})

it('moves an activity by keyboard-accessible controls, follows focus, and announces position', async () => {
  // Arrange
  render(<TripEditor trip={trip} />)

  // Act
  const moveUp = screen.getByRole('button', { name: 'Move Lunch up' })
  moveUp.focus()
  fireEvent.keyDown(moveUp, { key: 'Enter' })
  fireEvent.click(moveUp)
  const items = screen.getAllByRole('listitem')

  // Assert
  await waitFor(() => expect(items[0]).toHaveFocus())
  expect(items[0]).toHaveTextContent('1. Lunch')
  expect(items[1]).toHaveTextContent('2. Museum')
  expect(screen.getByText('Moved Lunch to position 1 of 2.')).toBeInTheDocument()
})

it('opens an activity editor from its icon-only edit button', () => {
  // Arrange
  render(<TripEditor trip={trip} />)

  // Act
  fireEvent.click(screen.getByRole('button', { name: 'Edit Lunch' }))

  // Assert
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Edit activity')
})

it('shows activity field examples as placeholders without pre-filling new activity values', () => {
  // Arrange
  render(
    <TripEditor
      trip={{ ...trip, days: [{ ...trip.days[0], activities: [], travelEstimates: [] }] }}
    />,
  )

  // Act
  fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Set a fixed start time' }))

  // Assert
  expect(within(dialog).getByLabelText('Name')).toHaveAttribute('placeholder', 'Visit the museum')
  expect(within(dialog).getByLabelText('Name')).toHaveValue('')
  expect(within(dialog).getByLabelText('Place label')).toHaveAttribute(
    'placeholder',
    'National Museum, Lisbon',
  )
  expect(within(dialog).getByLabelText('Place label')).toHaveValue('')
  expect(within(dialog).getByLabelText('Duration (minutes)')).toHaveAttribute('placeholder', '60')
  expect(within(dialog).getByLabelText('Duration (minutes)')).toHaveValue(null)
  expect(within(dialog).getByLabelText('Start time')).toHaveValue('')
})

it('keeps an activity when its shadcn delete confirmation is cancelled', () => {
  // Arrange
  render(<TripEditor trip={trip} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete Museum' }))
  const confirmation = screen.getByRole('alertdialog')

  // Act
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))

  // Assert
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(screen.getByText('1. Museum')).toBeVisible()
})

it('deletes an activity from the local draft after confirmation', () => {
  // Arrange
  render(<TripEditor trip={trip} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete Museum' }))
  const confirmation = screen.getByRole('alertdialog')

  // Act
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))

  // Assert
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(screen.queryByText('1. Museum')).not.toBeInTheDocument()
  expect(screen.getByText('1. Lunch')).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes')
  expect(mocks.save).not.toHaveBeenCalled()
})

it('keeps a day and its activities when its delete confirmation is cancelled', () => {
  // Arrange
  render(<TripEditor trip={trip} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete day' }))
  const confirmation = screen.getByRole('alertdialog')

  // Act
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))

  // Assert
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Day 1 ·/ })).toBeVisible()
  expect(screen.getByText('1. Museum')).toBeVisible()
})

it('deletes a day and its activities from the local draft after confirmation', () => {
  // Arrange
  render(<TripEditor trip={trip} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete day' }))
  const confirmation = screen.getByRole('alertdialog')

  // Act
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))

  // Assert
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Day 1 ·/ })).not.toBeInTheDocument()
  expect(screen.queryByText('1. Museum')).not.toBeInTheDocument()
  expect(screen.getByText('Add a day to start planning.')).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes')
  expect(mocks.save).not.toHaveBeenCalled()
})

it('validates a local activity draft and keeps it in the editor until committed', () => {
  // Arrange
  render(
    <TripEditor
      trip={{ ...trip, days: [{ ...trip.days[0], activities: [], travelEstimates: [] }] }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Gallery' } })
  fireEvent.change(within(dialog).getByLabelText('Duration (minutes)'), { target: { value: '0' } })

  // Act
  const form = dialog.querySelector('form')
  if (!form) throw new Error('Activity form is missing')
  fireEvent.submit(form)

  // Assert
  expect(within(dialog).getByText(/Duration must be a whole number/)).toBeVisible()
  expect(within(dialog).getByLabelText('Duration (minutes)')).toHaveFocus()
  expect(screen.queryByText('1. Gallery')).not.toBeInTheDocument()
  expect(mocks.save).not.toHaveBeenCalled()
})

it('uses the fixed-start option to reveal the optional time field', () => {
  // Arrange
  render(
    <TripEditor
      trip={{ ...trip, days: [{ ...trip.days[0], activities: [], travelEstimates: [] }] }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
  const dialog = screen.getByRole('dialog')

  // Act
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Set a fixed start time' }))

  // Assert
  expect(within(dialog).getByLabelText('Start time')).toBeVisible()
  expect(within(dialog).getByText(/Activities follow the previous stop by default/)).toBeVisible()
})

it('allows a fixed start time to leave a gap after the previous activity', () => {
  // Arrange
  const morningTrip = {
    ...trip,
    days: [
      {
        ...trip.days[0],
        startMinute: 410,
        activities: [
          {
            ...trip.days[0].activities[0],
            title: 'Activity A',
            durationMinutes: 10,
          },
        ],
        travelEstimates: [],
      },
    ],
  }
  render(<TripEditor trip={morningTrip} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Activity B' } })
  fireEvent.change(within(dialog).getByLabelText('Duration (minutes)'), {
    target: { value: '50' },
  })
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Set a fixed start time' }))
  fireEvent.change(within(dialog).getByLabelText('Start time'), { target: { value: '10:00' } })

  // Act
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add activity' }))

  // Assert
  expect(screen.getByRole('listitem', { name: 'Activity 1: Activity A' })).toHaveTextContent(
    '06:50–07:00',
  )
  expect(screen.getByRole('listitem', { name: 'Activity 2: Activity B' })).toHaveTextContent(
    '10:00–10:50',
  )
})

it('requires explicit day boundaries, rejects duplicate dates inline, and clears fields after adding', () => {
  // Arrange
  render(
    <TripEditor
      trip={{ ...trip, days: [{ ...trip.days[0], activities: [], travelEstimates: [] }] }}
    />,
  )
  openNewDayForm()
  const date = screen.getByLabelText('New day date')
  const start = screen.getByLabelText('Starts at')
  const finish = screen.getByLabelText('Finishes at')
  fireEvent.change(date, { target: { value: offsetDate(1) } })
  fireEvent.change(start, { target: { value: '08:15' } })
  fireEvent.change(finish, { target: { value: '17:45' } })

  // Act
  fireEvent.click(screen.getByRole('button', { name: 'Add day' }))

  // Assert
  expect(screen.getByRole('button', { name: /Day 2 ·/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByLabelText('Day starts at')).toHaveValue('08:15')
  expect(screen.getByLabelText('Day finishes at')).toHaveValue('17:45')
  expect(date).toHaveValue('')
  expect(start).toHaveValue('')
  expect(finish).toHaveValue('')
})

it('prevents adding a day before the current date', () => {
  // Arrange
  render(<TripEditor trip={trip} minimumDate={currentDate} />)
  openNewDayForm()
  const date = screen.getByLabelText('New day date')
  fireEvent.change(date, { target: { value: offsetDate(-1) } })
  fireEvent.change(screen.getByLabelText('Starts at'), { target: { value: '08:15' } })
  fireEvent.change(screen.getByLabelText('Finishes at'), { target: { value: '17:45' } })
  const form = date.closest('form')
  if (!form) throw new Error('New day form is missing')

  // Act
  fireEvent.submit(form)

  // Assert
  expect(date).toHaveAttribute('min', currentDate)
  expect(date).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByText('Choose today or a future date.')).toBeVisible()
  expect(screen.getAllByRole('button', { name: /Day / })).toHaveLength(1)
})

it('marks an existing past day invalid and pauses autosave until its date is corrected', async () => {
  // Arrange
  vi.useFakeTimers()
  render(
    <TripEditor
      minimumDate={currentDate}
      trip={{
        ...trip,
        days: [{ ...trip.days[0], date: offsetDate(-1) }],
      }}
    />,
  )
  const date = screen.getByLabelText('Day date')
  fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Updated trip' } })

  // Act
  await act(async () => vi.advanceTimersByTimeAsync(1000))

  // Assert
  expect(date).toHaveAttribute('min', currentDate)
  expect(date).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByText('Choose today or a future date.')).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('Fix the highlighted fields to save')
  expect(mocks.save).not.toHaveBeenCalled()
})

it('associates a duplicate new-day date error with its input', () => {
  // Arrange
  render(<TripEditor trip={trip} />)
  openNewDayForm()
  const date = screen.getByLabelText('New day date')
  fireEvent.change(date, { target: { value: currentDate } })
  fireEvent.change(screen.getByLabelText('Starts at'), { target: { value: '08:15' } })
  fireEvent.change(screen.getByLabelText('Finishes at'), { target: { value: '17:45' } })

  // Act
  fireEvent.click(screen.getByRole('button', { name: 'Add day' }))

  // Assert
  expect(date).toHaveAttribute('aria-invalid', 'true')
  expect(date).toHaveAttribute('aria-describedby', 'new-day-error')
  expect(screen.getByText('A day already uses this date.')).toBeVisible()
})

it('focuses the activity name on open and returns focus to its trigger after Escape', async () => {
  // Arrange
  render(
    <TripEditor
      trip={{ ...trip, days: [{ ...trip.days[0], activities: [], travelEstimates: [] }] }}
    />,
  )
  const trigger = screen.getByRole('button', { name: 'Add activity' })
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog')
  const name = within(dialog).getByLabelText('Name')

  // Act
  await waitFor(() => expect(name).toHaveFocus())
  fireEvent.keyDown(document, { key: 'Escape' })

  // Assert
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
})

it('closes a modified activity form without a confirmation and leaves the trip unchanged', () => {
  // Arrange
  const confirm = vi.spyOn(window, 'confirm')
  render(
    <TripEditor
      trip={{ ...trip, days: [{ ...trip.days[0], activities: [], travelEstimates: [] }] }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
  const dialog = screen.getByRole('dialog')
  const name = within(dialog).getByLabelText('Name')
  fireEvent.change(name, { target: { value: 'Draft museum' } })

  // Act
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

  // Assert
  expect(confirm).not.toHaveBeenCalled()
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByText('1. Draft museum')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('All changes saved')
  expect(mocks.save).not.toHaveBeenCalled()
})

it('commits an activity locally and queues it for autosave', () => {
  // Arrange
  render(
    <TripEditor
      trip={{ ...trip, days: [{ ...trip.days[0], activities: [], travelEstimates: [] }] }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Gallery' } })
  fireEvent.change(within(dialog).getByLabelText('Duration (minutes)'), { target: { value: '50' } })

  // Act
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add activity' }))

  // Assert
  expect(screen.getByText('1. Gallery')).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes')
  expect(mocks.save).not.toHaveBeenCalled()
})

it('autosaves valid edits after a 500ms debounce', async () => {
  // Arrange
  vi.useFakeTimers()
  render(<TripEditor trip={trip} />)
  const name = screen.getByLabelText('Trip name')
  fireEvent.change(name, { target: { value: 'Lisbon and Sintra' } })

  // Act
  await act(async () => vi.advanceTimersByTimeAsync(500))

  // Assert
  expect(mocks.save).toHaveBeenCalledOnce()
  expect(mocks.save.mock.calls[0][0]).toMatchObject({
    tripId: trip.id,
    expectedRevision: trip.revision,
    snapshot: { title: 'Lisbon and Sintra' },
  })
  expect(mocks.save.mock.calls[0][0].mutationId).toMatch(/^[0-9a-f-]{36}$/i)
  expect(screen.getByRole('status')).toHaveTextContent('All changes saved')
})

it('serializes saves and sends edits made during a write as the next revision', async () => {
  // Arrange
  vi.useFakeTimers()
  let resolveFirst: ((result: unknown) => void) | undefined
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
  render(<TripEditor trip={trip} />)
  fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'First edit' } })

  // Act
  await act(async () => vi.advanceTimersByTimeAsync(500))
  fireEvent.change(screen.getByLabelText('Destination label'), {
    target: { value: 'Lisbon and Sintra' },
  })
  await act(async () => vi.advanceTimersByTimeAsync(1000))
  const requestsWhileFirstSaveWasPending = mocks.save.mock.calls.length
  await act(async () => {
    resolveFirst?.({ ok: true, revision: 2, ids: {} })
  })
  await act(async () => vi.advanceTimersByTimeAsync(500))

  // Assert
  expect(requestsWhileFirstSaveWasPending).toBe(1)
  expect(mocks.save).toHaveBeenCalledTimes(2)
  expect(mocks.save.mock.calls[1][0]).toMatchObject({
    expectedRevision: 2,
    snapshot: { title: 'First edit', destination: 'Lisbon and Sintra' },
  })
})

it('retries an uncertain save with the exact same mutation and snapshot', async () => {
  // Arrange
  vi.useFakeTimers()
  mocks.save.mockRejectedValueOnce(new Error('response lost'))
  mocks.save.mockResolvedValueOnce({ ok: true, revision: 2, ids: {} })
  render(<TripEditor trip={trip} />)
  fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Retry trip' } })

  // Act
  await act(async () => vi.advanceTimersByTimeAsync(500))
  const originalRequest = structuredClone(mocks.save.mock.calls[0][0])
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
  await act(async () => vi.runAllTimersAsync())

  // Assert
  expect(mocks.save).toHaveBeenCalledTimes(2)
  expect(mocks.save.mock.calls[1][0]).toEqual(originalRequest)
  expect(screen.getByRole('status')).toHaveTextContent('All changes saved')
})

it('pauses autosave after session expiry and keeps the draft available for retry', async () => {
  // Arrange
  vi.useFakeTimers()
  mocks.save.mockResolvedValueOnce({
    ok: false,
    code: 'UNAUTHENTICATED',
    message: 'Sign in to save your changes.',
  })
  render(<TripEditor trip={trip} />)
  const name = screen.getByLabelText('Trip name')
  fireEvent.change(name, { target: { value: 'Private draft' } })

  // Act
  await act(async () => vi.advanceTimersByTimeAsync(500))
  fireEvent.change(name, { target: { value: 'Private draft with edits' } })
  await act(async () => vi.advanceTimersByTimeAsync(1000))

  // Assert
  expect(name).toHaveValue('Private draft with edits')
  expect(screen.getByRole('status')).toHaveTextContent('Saving paused')
  expect(screen.getByRole('link', { name: 'Sign in in another tab' })).toHaveAttribute(
    'target',
    '_blank',
  )
  expect(screen.getByRole('button', { name: 'Retry save' })).toBeVisible()
  expect(mocks.save).toHaveBeenCalledOnce()
})

it('retains a conflicting draft and requires a deliberate reload before another save', async () => {
  // Arrange
  vi.useFakeTimers()
  mocks.save.mockResolvedValue({
    ok: false,
    code: 'CONFLICT',
    message:
      'This trip changed since you opened it. Reload before saving again; your edits are still here.',
  })
  render(<TripEditor trip={trip} />)
  const name = screen.getByLabelText('Trip name')
  fireEvent.change(name, { target: { value: 'Local edit' } })

  // Act
  await act(async () => vi.advanceTimersByTimeAsync(500))

  // Assert
  expect(screen.getByRole('button', { name: 'Discard edits and reload latest' })).toBeVisible()
  expect(name).toHaveValue('Local edit')
  expect(screen.getByText(/This trip changed since you opened it/)).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes')
  fireEvent.click(screen.getByRole('button', { name: 'Discard edits and reload latest' }))
  expect(mocks.refresh).toHaveBeenCalledOnce()
})
