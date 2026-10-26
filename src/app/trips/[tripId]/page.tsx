import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PrivateSession } from '@/components/auth/private-session'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { TripEditor } from '@/features/trips/editor/trip-editor'
import { getTrip } from '@/features/trips/server/queries'
import { todayDate } from '@/features/trips/shared/date-rules'
import { signInPath } from '@/lib/auth-redirect'
import { appRoutes } from '@/lib/routes'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Trip | TrailPlan' }
export const dynamic = 'force-dynamic'

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
            <TripEditor
              key={result.data.revision}
              trip={{
                id: result.data.id,
                title: result.data.title,
                destination: result.data.destination,
                revision: result.data.revision,
                days: result.data.days,
              }}
              minimumDate={todayDate()}
            />
          </article>
        )}
      </PrivateSession>
    </main>
  )
}
