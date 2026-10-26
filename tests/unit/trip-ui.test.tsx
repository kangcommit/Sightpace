import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CreateTripForm } from '@/features/trips/forms/create-trip-form'
import { DeleteTripButton } from '@/features/trips/forms/delete-trip-control'
import type { CreateTripState } from '@/features/trips/server/actions'

afterEach(cleanup)

const initialState: CreateTripState = {
  values: {
    mutationId: '30000000-0000-4000-8000-000000000002',
    title: 'Lisbon week',
    destination: 'Lisbon',
    date: '2026-10-26',
    startTime: '',
    finishTime: '',
  },
  errors: { title: 'Enter a trip name.' },
  message: 'Check the highlighted fields and try again.',
}

it('labels creation fields and shows an associated validation error', () => {
  // Arrange
  render(<CreateTripForm initialState={initialState} minimumDate="2026-10-26" />)

  // Act
  const title = screen.getByRole('textbox', { name: 'Trip name' })
  const destination = screen.getByRole('textbox', { name: 'Destination label' })
  const date = screen.getByLabelText('First day date')
  const startTime = screen.getByLabelText('Day starts at')
  const finishTime = screen.getByLabelText('Day finishes at')
  fireEvent.change(title, { target: { value: 'Lisbon and Porto' } })

  // Assert
  expect(title).toHaveAttribute('aria-invalid', 'true')
  expect(title).toHaveAttribute('aria-describedby', 'trip-title-error')
  expect(title).toHaveAttribute('placeholder', 'e.g. Summer in Portugal')
  expect(title).not.toHaveFocus()
  expect(title).toHaveValue('Lisbon and Porto')
  expect(screen.getByText('Enter a trip name.')).toBeVisible()
  expect(screen.queryByText('Check the highlighted fields and try again.')).not.toBeInTheDocument()
  expect(destination).toHaveValue('Lisbon')
  expect(destination).toHaveAttribute('placeholder', 'e.g. Lisbon, Portugal')
  expect(date).toHaveValue('2026-10-26')
  expect(date).toHaveAttribute('min', '2026-10-26')
  expect(startTime).toHaveValue('')
  expect(startTime).toBeRequired()
  expect(startTime).toHaveAttribute('max', '23:58')
  expect(finishTime).toHaveValue('')
  expect(finishTime).toBeRequired()
  expect(finishTime).toHaveAttribute('min', '00:01')
  expect(document.querySelector('input[name="tripId"]')).toBeNull()
  expect(document.querySelector('input[name="dayId"]')).toBeNull()
  expect(screen.queryByText('Your first day is set to 09:00–18:00.')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Create trip' })).toBeEnabled()
})

it('associates an invalid finish-time error', () => {
  // Arrange
  render(
    <CreateTripForm
      minimumDate="2026-10-26"
      initialState={{
        ...initialState,
        values: { ...initialState.values, startTime: '18:00', finishTime: '09:00' },
        errors: { finishTime: 'Finish time must be later than start time.' },
      }}
    />,
  )

  // Act
  const finishTime = screen.getByLabelText('Day finishes at')
  // Assert
  expect(finishTime).toHaveAttribute('aria-invalid', 'true')
  expect(finishTime).toHaveAttribute('aria-describedby', 'trip-finishTime-error')
  expect(screen.getByText('Finish time must be later than start time.')).toBeVisible()
  expect(screen.queryByText('Check the highlighted fields and try again.')).not.toBeInTheDocument()
  expect(finishTime).toHaveValue('09:00')
})

it('keeps the form-level alert for errors without an associated field', () => {
  // Arrange
  render(
    <CreateTripForm
      minimumDate="2026-10-26"
      initialState={{
        ...initialState,
        errors: {},
        message: 'We couldn’t create this trip. Please try again.',
      }}
    />,
  )

  // Act
  const alert = screen.getByRole('alert')
  // Assert
  expect(alert).toHaveTextContent('We couldn’t create this trip. Please try again.')
})

it('associates the first-day error when the server rejects a past date', () => {
  // Arrange
  render(
    <CreateTripForm
      minimumDate="2026-10-26"
      initialState={{
        ...initialState,
        errors: { date: 'Choose today or a future date.' },
      }}
    />,
  )

  // Act
  const date = screen.getByLabelText('First day date')
  // Assert
  expect(date).toHaveAttribute('aria-invalid', 'true')
  expect(date).toHaveAttribute('aria-describedby', 'trip-date-hint trip-date-error')
  expect(screen.getByText('Choose today or a future date.')).toBeVisible()
})

it('opens a named delete confirmation from the direct delete button', () => {
  // Arrange
  render(
    <DeleteTripButton
      tripId="30000000-0000-4000-8000-000000000001"
      title={initialState.values.title}
      revision={1}
      mutationId={initialState.values.mutationId}
    />,
  )

  // Act
  const deleteButton = screen.getByRole('button', { name: 'Delete Lisbon week' })
  expect(deleteButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  fireEvent.click(deleteButton)

  // Assert
  expect(screen.getByRole('alertdialog')).toBeVisible()
  expect(screen.getByText('Delete “Lisbon week”?')).toBeVisible()
  expect(screen.getByRole('button', { name: /^Delete$/ })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible()
})
