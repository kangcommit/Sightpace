import { randomUUID } from 'node:crypto'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PrivatePageHeader } from '@/components/auth/private-page-header'
import { PrivateSession } from '@/components/auth/private-session'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { DeleteTripButton } from '@/features/trips/forms/delete-trip-control'
import { listTrips } from '@/features/trips/server/queries'
import { signInPath } from '@/lib/auth-redirect'
import { appRoutes } from '@/lib/routes'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: 'My trips' }
export const dynamic = 'force-dynamic'

function displayDate(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00.000Z`),
  )
}

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const user = await requireUser()

  if (!user.ok) redirect(signInPath(appRoutes.trips))

  const params = await searchParams
  const result = await listTrips(user.data.id, params.page)

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PrivateSession userId={user.data.id}>
        <PrivatePageHeader href={appRoutes.home} />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">My trips</h1>
          <Button
            render={<Link href={appRoutes.newTrip} />}
            nativeButton={false}
            className="min-h-11"
          >
            New trip
          </Button>
        </header>
        {!result.ok ? (
          <section className="flex flex-col items-start gap-3">
            <Alert variant="destructive">
              <AlertDescription>
                We couldn’t load your trips. Please try again.
                {result.requestId ? (
                  <span className="sr-only"> Reference: {result.requestId}</span>
                ) : null}
              </AlertDescription>
            </Alert>
            <Button
              render={<Link href={appRoutes.trips} />}
              nativeButton={false}
              variant="outline"
              className="min-h-11"
            >
              Retry
            </Button>
          </section>
        ) : result.data.items.length === 0 ? (
          <section className="flex flex-col items-start gap-3">
            <h2 className="text-lg font-medium">Plan your first trip</h2>
            <p className="text-muted-foreground">
              Your saved trips will be private to this account.
            </p>
            <Button
              render={<Link href={appRoutes.newTrip} />}
              nativeButton={false}
              className="min-h-11"
            >
              Create trip
            </Button>
          </section>
        ) : (
          <>
            <ul className="flex flex-col gap-5">
              {result.data.items.map((trip) => (
                <li
                  key={trip.id}
                  className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <Link
                    className="flex min-h-11 min-w-0 flex-1 flex-col gap-0.5"
                    href={appRoutes.trip(trip.id)}
                  >
                    <h2 className="text-lg font-medium">{trip.title}</h2>
                    <p className="text-muted-foreground text-sm">{trip.destination}</p>
                    <p className="text-muted-foreground text-sm">
                      {trip.startDate && trip.endDate
                        ? trip.startDate === trip.endDate
                          ? displayDate(trip.startDate)
                          : `${displayDate(trip.startDate)} – ${displayDate(trip.endDate)}`
                        : 'No dates planned yet'}
                    </p>
                  </Link>
                  <div className="flex flex-wrap items-center gap-3">
                    <DeleteTripButton
                      tripId={trip.id}
                      title={trip.title}
                      revision={trip.revision}
                      mutationId={randomUUID()}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {result.data.totalPages > 1 && (
              <Pagination aria-label="Trip pages">
                <PaginationContent>
                  {result.data.page > 1 && (
                    <PaginationItem>
                      <PaginationPrevious href={appRoutes.tripsPage(result.data.page - 1)} />
                    </PaginationItem>
                  )}
                  {Array.from({ length: result.data.totalPages }, (_, index) => index + 1).map(
                    (pageNumber) => (
                      <PaginationItem key={pageNumber}>
                        <PaginationLink
                          aria-label={`Page ${pageNumber}`}
                          href={appRoutes.tripsPage(pageNumber)}
                          isActive={pageNumber === result.data.page}
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  {result.data.page < result.data.totalPages && (
                    <PaginationItem>
                      <PaginationNext href={appRoutes.tripsPage(result.data.page + 1)} />
                    </PaginationItem>
                  )}
                </PaginationContent>
              </Pagination>
            )}
          </>
        )}
      </PrivateSession>
    </main>
  )
}
