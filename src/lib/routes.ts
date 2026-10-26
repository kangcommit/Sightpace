const tripsPath = '/trips'

export const appRoutes = {
  home: '/',
  signIn: '/sign-in',
  trips: tripsPath,
  newTrip: `${tripsPath}/new`,
  demo: '/demo',
  trip: (tripId: string) => `${tripsPath}/${tripId}`,
  tripsPage: (page: number) => `${tripsPath}?page=${page}`,
}
