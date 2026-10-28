import { randomUUID } from 'node:crypto'
import { MapPinned } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PrivatePageHeader } from '@/components/auth/private-page-header'
import { PrivateSession } from '@/components/auth/private-session'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
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
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MapPinned aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle role="heading" aria-level={2}>
                Plan your first trip
              </EmptyTitle>
              <EmptyDescription>Your saved trips are private to this account.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                render={<Link href={appRoutes.newTrip} />}
                nativeButton={false}
                className="min-h-11"
              >
                Create trip
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <ItemGroup aria-label="Saved trips" className="gap-5">
              {result.data.items.map((trip) => (
                <li key={trip.id} className="m-0 p-0">
                  <Item className="items-start justify-between gap-4">
                    <ItemContent className="min-w-0">
                      <Link
                        className="focus-visible:ring-ring flex min-h-11 min-w-0 flex-col gap-0.5 rounded-sm hover:opacity-80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                        href={appRoutes.trip(trip.id)}
                      >
                        <ItemTitle
                          role="heading"
                          aria-level={2}
                          className="line-clamp-none w-full text-lg whitespace-normal"
                        >
                          {trip.title}
                        </ItemTitle>
                        <ItemDescription className="line-clamp-none">
                          {trip.destination} ·{' '}
                          {trip.startDate && trip.endDate
                            ? trip.startDate === trip.endDate
                              ? displayDate(trip.startDate)
                              : `${displayDate(trip.startDate)} – ${displayDate(trip.endDate)}`
                            : 'No dates planned yet'}
                        </ItemDescription>
                      </Link>
                    </ItemContent>
                    <ItemActions className="shrink-0 self-start">
                      <DeleteTripButton
                        tripId={trip.id}
                        title={trip.title}
                        revision={trip.revision}
                        mutationId={randomUUID()}
                      />
                    </ItemActions>
                  </Item>
                </li>
              ))}
            </ItemGroup>
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
