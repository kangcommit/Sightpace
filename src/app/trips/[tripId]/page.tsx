import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PrivateSession } from '@/components/auth/private-session'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { getTrip } from '@/features/trips/queries'
import { signInPath } from '@/lib/auth-redirect'
import { appRoutes } from '@/lib/routes'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Trip | TrailPlan' }
export const dynamic = 'force-dynamic'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'full', timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00.000Z`),
  )
}

function formatMinute(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  const user = await requireUser()

  if (!user.ok) redirect(signInPath(appRoutes.trip(tripId)))

  const result = await getTrip(user.data.id, tripId)

  if (result.ok && !result.data) notFound()

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link href={appRoutes.trips} className="flex min-h-11 items-center font-semibold">
        TrailPlan
      </Link>
      <PrivateSession userId={user.data.id}>
        {!result.ok ? (
          <section className="flex flex-col items-start gap-4">
            <h1 className="text-2xl font-semibold">We couldn’t open this trip</h1>
            <Alert variant="destructive">
              <AlertDescription>
                Refresh this page to try again. Your saved trip has not been changed.
              </AlertDescription>
            </Alert>
            <Button render={<Link href={appRoutes.trip(tripId)} />} className="min-h-11">
              Try again
            </Button>
          </section>
        ) : (
          <article className="flex flex-col gap-8">
            <header className="border-border flex flex-col gap-2 border-b pb-6">
              <h1 className="text-2xl font-semibold">{result.data.title}</h1>
              <p className="text-muted-foreground">{result.data.destination}</p>
            </header>
            <section aria-labelledby="trip-days-heading" className="flex flex-col gap-4">
              <h2 id="trip-days-heading" className="text-lg font-medium">
                Your days
              </h2>
              {result.data.days.map((day, index) => (
                <section
                  key={day.id}
                  aria-labelledby={`day-${day.id}`}
                  className="flex flex-col gap-3"
                >
                  <h3 id={`day-${day.id}`} className="font-medium">
                    Day {index + 1} · {formatDate(day.date)}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {formatMinute(day.startMinute)}–{formatMinute(day.finishMinute)}
                  </p>
                  {day.activities.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No activities yet.</p>
                  ) : (
                    <ol className="list-decimal space-y-2 pl-5">
                      {day.activities.map((activity) => (
                        <li key={activity.id}>
                          <span className="font-medium">{activity.title}</span>
                          {activity.placeLabel ? (
                            <span className="text-muted-foreground"> · {activity.placeLabel}</span>
                          ) : null}
                          <span className="text-muted-foreground">
                            {' '}
                            · {activity.durationMinutes} min
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              ))}
            </section>
          </article>
        )}
      </PrivateSession>
    </main>
  )
}
