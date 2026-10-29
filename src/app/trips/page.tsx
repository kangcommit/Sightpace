import { randomUUID } from 'node:crypto'
import { CalendarDays, MapPin, MapPinned, Plus } from 'lucide-react'
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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <PrivateSession userId={user.data.id}>
        <PrivatePageHeader href={appRoutes.home} />
        <header className="flex flex-wrap items-end justify-between gap-4 pt-4">
          <div className="flex flex-col gap-2">
            <p className="text-primary text-sm font-semibold">Your travel plans</p>
            <h1 className="text-3xl font-semibold tracking-tight">My trips</h1>
            <p className="text-muted-foreground max-w-md leading-relaxed">
              Pick up where you left off, or start planning somewhere new.
            </p>
          </div>
          <Button
            render={<Link href={appRoutes.newTrip} />}
            nativeButton={false}
            className="min-h-11"
          >
            <Plus aria-hidden="true" /> New trip
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
          <Empty className="bg-card rounded-2xl px-6 py-12 sm:py-16">
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
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">Saved trips</h2>
              <p className="text-muted-foreground text-sm">Open a trip to explore its days.</p>
            </div>
            <ItemGroup aria-label="Saved trips" className="grid gap-4 sm:grid-cols-2">
              {result.data.items.map((trip) => (
                <li key={trip.id} className="m-0 p-0">
                  <Item className="bg-card h-full flex-nowrap items-start justify-between gap-3 rounded-xl p-4 sm:p-5">
                    <ItemContent className="min-w-0">
                      <Link
                        className="focus-visible:ring-ring flex min-h-24 min-w-0 flex-col items-start gap-4 rounded-sm hover:opacity-80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                        href={appRoutes.trip(trip.id)}
                      >
                        <div className="flex w-full items-start justify-between gap-3">
                          <ItemTitle
                            role="heading"
                            aria-level={3}
                            className="line-clamp-none w-full text-xl whitespace-normal"
                          >
                            {trip.title}
                          </ItemTitle>
                        </div>
                        <ItemDescription className="line-clamp-none flex flex-col gap-2">
                          <span className="flex items-start gap-2">
                            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                            {trip.destination}
                          </span>
                          <span className="flex items-start gap-2">
                            <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                            {trip.startDate && trip.endDate
                              ? trip.startDate === trip.endDate
                                ? displayDate(trip.startDate)
                                : `${displayDate(trip.startDate)} – ${displayDate(trip.endDate)}`
                              : 'No dates planned yet'}
                          </span>
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
