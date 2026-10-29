import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import TripsPage from '@/app/trips/page'

const mocks = vi.hoisted(() => ({ listTrips: vi.fn(), redirect: vi.fn(), requireUser: vi.fn() }))

vi.mock('next/link', async () => {
  const { createElement } = await import('react')

  return {
    default: ({ href, children, ...props }: { href: string; children?: React.ReactNode }) =>
      createElement('a', { href, ...props }, children),
  }
})
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/components/auth/private-page-header', () => ({ PrivatePageHeader: () => null }))
vi.mock('@/components/auth/private-session', () => ({
  PrivateSession: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/features/trips/forms/delete-trip-control', () => ({
  DeleteTripButton: ({ title }: { title: string }) => (
    <button type="button" aria-label={`Delete ${title}`} />
  ),
}))
vi.mock('@/features/trips/server/queries', () => ({ listTrips: mocks.listTrips }))
vi.mock('@/lib/session', () => ({ requireUser: mocks.requireUser }))

afterEach(cleanup)

beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ ok: true, data: { id: 'user-1' } })
  mocks.listTrips.mockResolvedValue({ ok: true, data: { items: [], page: 1, totalPages: 1 } })
})

it('uses the shadcn empty state with a direct create-trip action', async () => {
  // Arrange
  const page = await TripsPage({ searchParams: Promise.resolve({}) })

  // Act
  render(page)

  // Assert
  expect(screen.getByRole('heading', { name: 'Plan your first trip', level: 2 })).toBeVisible()
  expect(screen.getByText('Your saved trips are private to this account.')).toBeVisible()
  expect(screen.getByText('Create trip').closest('a')).toHaveAttribute('href', '/trips/new')
})

it('uses shadcn items for saved trips and keeps the row actions reachable', async () => {
  // Arrange
  const tripId = 'a0000000-0000-4000-8000-000000000001'
  mocks.listTrips.mockResolvedValue({
    ok: true,
    data: {
      items: [
        {
          id: tripId,
          title: 'Lisbon week',
          destination: 'Lisbon',
          revision: 3,
          startDate: '2026-10-26',
          endDate: '2026-10-30',
        },
      ],
      page: 1,
      totalPages: 2,
    },
  })
  const page = await TripsPage({ searchParams: Promise.resolve({}) })

  // Act
  render(page)

  // Assert
  expect(screen.getByRole('list', { name: 'Saved trips' })).toBeVisible()
  expect(
    within(screen.getByRole('list', { name: 'Saved trips' })).getByRole('listitem'),
  ).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Saved trips', level: 2 })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Lisbon week', level: 3 })).toBeVisible()
  expect(screen.getByRole('link', { name: /Lisbon week Lisbon/ })).toHaveAttribute(
    'href',
    `/trips/${tripId}`,
  )
  expect(screen.getByRole('button', { name: 'Delete Lisbon week' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute('href', '/trips?page=2')
})
