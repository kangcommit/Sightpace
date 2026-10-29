import { describe, expect, it } from 'vitest'
import { appRoutes } from '@/lib/routes'

describe('application routes', () => {
  it('builds canonical trip and paginated list paths', () => {
    // Arrange
    const tripId = '11111111-1111-4111-8111-111111111111'

    // Act
    const paths = [
      appRoutes.home,
      appRoutes.signIn,
      appRoutes.trips,
      appRoutes.newTrip,
      appRoutes.trip(tripId),
      appRoutes.tripsPage(2),
    ]

    // Assert
    expect(paths).toEqual([
      '/',
      '/sign-in',
      '/trips',
      '/trips/new',
      `/trips/${tripId}`,
      '/trips?page=2',
    ])
  })
})
