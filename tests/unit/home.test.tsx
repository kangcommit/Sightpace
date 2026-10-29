import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import Page from '@/app/page'

vi.mock('@/lib/session', () => ({ requireUser: vi.fn().mockResolvedValue({ ok: false }) }))

describe('home page', () => {
  it('introduces the planner and links to the editable sample and sign-in', async () => {
    // Arrange
    const page = await Page()

    // Act
    render(page)

    // Assert
    expect(
      screen.getByRole('heading', { name: 'See what fits into your travel day' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try sample' })).toHaveAttribute('href', '/demo')
    expect(screen.getAllByRole('link', { name: 'Sign in' }).at(-1)).toHaveAttribute(
      'href',
      '/sign-in',
    )
    expect(screen.getByText(/Lunch · booked 12:00/)).toBeInTheDocument()
  })
})
