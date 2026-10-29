import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TripsError from '@/app/trips/error'

describe('trips error boundary', () => {
  it('offers a focused retry action without sign-in or extra recovery copy', () => {
    // Arrange
    const reset = vi.fn()

    render(<TripsError reset={reset} />)

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    // Assert
    expect(screen.getByRole('heading', { name: 'We couldn’t open your trips' })).toBeVisible()
    expect(reset).toHaveBeenCalledOnce()
    expect(screen.queryByRole('link', { name: 'Back to sign in' })).not.toBeInTheDocument()
    expect(screen.queryByText(/please try again/i)).not.toBeInTheDocument()
  })
})
