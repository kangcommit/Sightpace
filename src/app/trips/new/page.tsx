import { randomUUID } from 'node:crypto'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PrivateSession } from '@/components/auth/private-session'
import { CreateTripForm } from '@/features/trips/forms/create-trip-form'
import { todayDate } from '@/features/trips/shared/date-rules'
import { signInPath } from '@/lib/auth-redirect'
import { appRoutes } from '@/lib/routes'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Create a trip | TrailPlan' }
export const dynamic = 'force-dynamic'

export default async function NewTripPage() {
  const user = await requireUser()

  if (!user.ok) redirect(signInPath(appRoutes.newTrip))

  const date = todayDate()

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
      <Link href={appRoutes.trips} className="flex min-h-11 items-center font-semibold">
        TrailPlan
      </Link>
      <PrivateSession userId={user.data.id}>
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold">Create a trip</h1>
            <p className="text-muted-foreground">
              Add a name, destination, first day and its planning hours.
            </p>
          </div>
          <CreateTripForm
            minimumDate={date}
            initialState={{
              values: {
                mutationId: randomUUID(),
                title: '',
                destination: '',
                date,
                startTime: '',
                finishTime: '',
              },
              errors: {},
              message: null,
            }}
          />
        </section>
      </PrivateSession>
    </main>
  )
}
