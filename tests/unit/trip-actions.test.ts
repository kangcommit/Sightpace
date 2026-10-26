import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createTrip: vi.fn(),
  deleteTrip: vi.fn(),
  redirect: vi.fn((path: string) => {
    const error = new Error(`Redirect to ${path}`) as Error & { digest: string }
    error.digest = `NEXT_REDIRECT;push;${path};307;`
    throw error
  }),
  unstableRethrow: vi.fn((error: unknown) => {
    if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw error
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  unstable_rethrow: mocks.unstableRethrow,
}))
vi.mock('@/lib/session', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/trip-transactions', () => ({
  createTrip: mocks.createTrip,
  deleteTrip: mocks.deleteTrip,
}))

import { type CreateTripState, createTripAction, deleteTripAction } from '@/features/trips/actions'
import { todayDate } from '@/features/trips/date-rules'

const initial: CreateTripState = {
  values: {
    mutationId: '10000000-0000-4000-8000-000000000002',
    title: '',
    destination: '',
    date: todayDate(),
    startTime: '',
    finishTime: '',
  },
  errors: {},
  message: null,
}

function createForm(overrides: Record<string, string> = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries({
    mutationId: initial.values.mutationId,
    title: 'Lisbon week',
    destination: 'Lisbon',
    date: initial.values.date,
    startTime: '09:00',
    finishTime: '18:00',
    ...overrides,
  }))
    form.set(key, value)
  return form
}

describe('private trip actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retains submitted values and returns associated validation errors', async () => {
    // Arrange
    mocks.requireUser.mockResolvedValue({ ok: true, data: { id: 'verified-owner' } })
    const form = createForm({ title: '   ' })

    // Act
    const result = await createTripAction(initial, form)

    // Assert
    expect(result).toMatchObject({
      values: { title: '   ', destination: 'Lisbon' },
      errors: { title: 'Enter a trip name.' },
    })
    expect(result.message).toBe('Check the highlighted fields and try again.')
    expect(mocks.requireUser).toHaveBeenCalledOnce()
    expect(mocks.createTrip).not.toHaveBeenCalled()
  })

  it('rejects a first day before the current date without creating a trip', async () => {
    // Arrange
    mocks.requireUser.mockResolvedValue({ ok: true, data: { id: 'verified-owner' } })
    const past = new Date(`${todayDate()}T00:00:00.000Z`)
    past.setUTCDate(past.getUTCDate() - 1)
    const form = createForm({ date: past.toISOString().slice(0, 10) })

    // Act
    const result = await createTripAction(initial, form)

    // Assert
    expect(result.values.date).toBe(past.toISOString().slice(0, 10))
    expect(result.errors.date).toBe('Choose today or a future date.')
    expect(result.message).toBe('Check the highlighted fields and try again.')
    expect(mocks.createTrip).not.toHaveBeenCalled()
  })

  it.each([
    [{ startTime: '' }, 'startTime', 'Enter a valid start time.'],
    [{ finishTime: '' }, 'finishTime', 'Enter a valid finish time.'],
    [{ startTime: '23:59' }, 'startTime', 'Choose a start time before 23:59.'],
    [{ finishTime: '00:00' }, 'finishTime', 'Choose a finish time after 00:00.'],
    [
      { startTime: '18:00', finishTime: '09:00' },
      'finishTime',
      'Finish time must be later than start time.',
    ],
  ] as const)('rejects invalid day hours %s', async (overrides, field, message) => {
    // Arrange
    mocks.requireUser.mockResolvedValue({ ok: true, data: { id: 'verified-owner' } })
    const form = createForm(overrides)

    // Act
    const result = await createTripAction(initial, form)

    // Assert
    expect(result.values.startTime).toBe(form.get('startTime'))
    expect(result.values.finishTime).toBe(form.get('finishTime'))
    expect(result.errors[field]).toBe(message)
    expect(mocks.createTrip).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated create without calling storage', async () => {
    // Arrange
    mocks.requireUser.mockResolvedValue({ ok: false, error: { code: 'UNAUTHENTICATED' } })

    // Act
    const result = await createTripAction(initial, createForm({ title: '   ' }))

    // Assert
    expect(result.message).toBe('Sign in to create a trip.')
    expect(mocks.createTrip).not.toHaveBeenCalled()
  })

  it('uses the verified owner and saves the submitted first-day hours', async () => {
    // Arrange
    mocks.requireUser.mockResolvedValue({ ok: true, data: { id: 'verified-owner' } })
    mocks.createTrip.mockResolvedValue({
      ok: true,
      data: { tripId: '20000000-0000-4000-8000-000000000001', revision: 1 },
    })

    // Act
    let redirectError: unknown
    try {
      await createTripAction(initial, createForm({ startTime: '07:30', finishTime: '20:15' }))
    } catch (error) {
      redirectError = error
    }

    // Assert
    expect(mocks.createTrip).toHaveBeenCalledWith(expect.anything(), 'verified-owner', {
      mutationId: initial.values.mutationId,
      title: 'Lisbon week',
      destination: 'Lisbon',
      days: [expect.objectContaining({ startMinute: 450, finishMinute: 1215 })],
    })
    expect(redirectError).toMatchObject({
      digest: 'NEXT_REDIRECT;push;/trips/20000000-0000-4000-8000-000000000001;307;',
    })
  })

  it.each(['ownerId', 'tripId', 'dayId'])('rejects a client-controlled %s field', async (field) => {
    // Arrange
    mocks.requireUser.mockResolvedValue({ ok: true, data: { id: 'verified-owner' } })

    // Act
    const result = await createTripAction(initial, createForm({ [field]: 'forged-value' }))

    // Assert
    expect(result.message).toBe('Something went wrong. Refresh the form and try again.')
    expect(mocks.createTrip).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated delete without calling storage', async () => {
    // Arrange
    mocks.requireUser.mockResolvedValue({ ok: false, error: { code: 'UNAUTHENTICATED' } })
    const form = new FormData()
    form.set('tripId', 'invalid')
    form.set('mutationId', initial.values.mutationId)
    form.set('revision', '1')

    // Act
    const result = await deleteTripAction({ message: null }, form)

    // Assert
    expect(result.message).toBe('Sign in to delete this trip.')
    expect(mocks.deleteTrip).not.toHaveBeenCalled()
  })

  it('deletes with the verified owner and the submitted revision', async () => {
    // Arrange
    const tripId = '40000000-0000-4000-8000-000000000001'
    mocks.requireUser.mockResolvedValue({ ok: true, data: { id: 'verified-owner' } })
    mocks.deleteTrip.mockResolvedValue({
      ok: true,
      data: { tripId, deleted: true },
    })
    const form = new FormData()
    form.set('tripId', tripId)
    form.set('mutationId', initial.values.mutationId)
    form.set('revision', '3')

    // Act
    let redirectError: unknown
    try {
      await deleteTripAction({ message: null }, form)
    } catch (error) {
      redirectError = error
    }

    // Assert
    expect(mocks.deleteTrip).toHaveBeenCalledWith(expect.anything(), 'verified-owner', {
      tripId,
      mutationId: initial.values.mutationId,
      expectedRevision: 3,
    })
    expect(redirectError).toMatchObject({ digest: 'NEXT_REDIRECT;push;/trips;307;' })
  })
})
