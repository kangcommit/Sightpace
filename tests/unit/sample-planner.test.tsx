import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { sampleTrip } from '@/features/trips/sample/sample-data'
import { SamplePlanner } from '@/features/trips/sample/sample-planner'
import { todayDate } from '@/features/trips/shared/date-rules'
import { calculateDaySchedule } from '@/lib/scheduling'

const mocks = vi.hoisted(() => ({ push: vi.fn(), create: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/features/trips/server/create-sample-copy-action', () => ({
  createSampleCopyAction: mocks.create,
}))

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.clearAllMocks()
})
beforeEach(() =>
  mocks.create.mockResolvedValue({ ok: true, tripId: '30000000-0000-4000-8000-000000000001' }),
)

it('keeps the sample booking at noon while showing the five-minute late arrival', () => {
  // Arrange
  const day = sampleTrip(todayDate()).days[0]
  if (!day) throw new Error('Sample day is missing.')

  // Act
  const schedule = calculateDaySchedule({
    startMinute: day.startMinute,
    finishMinute: day.finishMinute,
    activities: day.activities.map(({ id, durationMinutes, fixedStartMinute }) => ({
      id,
      durationMinutes,
      fixedStartMinute,
    })),
    travelEstimates: day.travelEstimates,
  })

  // Assert
  const lunch = schedule.entries.find((entry) => entry.activityId === day.activities[2]?.id)
  expect(lunch).toMatchObject({
    arrivalMinute: 725,
    intendedBookingStartMinute: 720,
    lateMinutes: 5,
  })
  expect(schedule.warnings.missingTravelPairs).toHaveLength(1)
  expect(schedule.entries.at(-1)?.provisional).toBe(true)
})

it('carries edited sample data through sign-in and creates the same private copy action', async () => {
  // Arrange
  const trip = sampleTrip(todayDate())
  const { unmount } = render(<SamplePlanner trip={trip} authenticated={false} />)
  await screen.findByRole('button', { name: 'Save a copy' })

  // Act
  fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Porto weekend' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save a copy' }))
  const signInPath = mocks.push.mock.calls[0]?.[0]
  const transferredSnapshot = JSON.parse(sessionStorage.getItem('trailplan:demo:copy') ?? '{}')

  unmount()
  render(<SamplePlanner trip={trip} authenticated />)
  await screen.findByRole('heading', { name: 'Save a copy to your trips?' })
  const restoredTitle = (screen.getByLabelText('Trip name') as HTMLInputElement).value

  fireEvent.click(screen.getByRole('button', { name: 'Save copy' }))
  await waitFor(() => {
    if (mocks.push.mock.calls.length < 2) throw new Error('Copy navigation has not completed.')
  })
  const copyRequest = mocks.create.mock.calls[0]?.[0]
  const tripPath = mocks.push.mock.calls[1]?.[0]
  const remainingTransfer = sessionStorage.getItem('trailplan:demo:copy')

  // Assert
  expect(signInPath).toBe('/sign-in?returnTo=%2Fdemo')
  expect(transferredSnapshot.snapshot.title).toBe('Porto weekend')
  expect(restoredTitle).toBe('Porto weekend')
  expect(copyRequest).toEqual(
    expect.objectContaining({ snapshot: expect.objectContaining({ title: 'Porto weekend' }) }),
  )
  expect(tripPath).toBe('/trips/30000000-0000-4000-8000-000000000001')
  expect(remainingTransfer).toBeNull()
})

it('asks before resetting an edited sample and restores the starter values', async () => {
  // Arrange
  render(<SamplePlanner trip={sampleTrip(todayDate())} authenticated />)
  await screen.findByRole('button', { name: 'Reset sample' })

  // Act
  fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Changed title' } })
  fireEvent.click(screen.getByRole('button', { name: 'Reset sample' }))
  const resetDialogTitle = await screen
    .findByRole('heading', { name: 'Reset sample?' })
    .then((heading) => heading.textContent)
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset sample' }),
  )
  await waitFor(() => {
    if ((screen.getByLabelText('Trip name') as HTMLInputElement).value !== 'A day in Porto')
      throw new Error('Sample reset has not completed.')
  })
  const resetTripName = (screen.getByLabelText('Trip name') as HTMLInputElement).value
  const copyActionCalls = mocks.create.mock.calls.length

  // Assert
  expect(resetDialogTitle).toBe('Reset sample?')
  expect(resetTripName).toBe('A day in Porto')
  expect(copyActionCalls).toBe(0)
})
