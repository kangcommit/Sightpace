import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { appRoutes } from '@/lib/routes'
import { requireUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const user = await requireUser().catch(() => null)

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-12 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex min-h-11 items-center">
        <Link href={appRoutes.home} className="font-semibold">
          TrailPlan
        </Link>
      </header>
      <section className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
        <div className="flex flex-col items-start gap-5">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            See what fits into your travel day
          </h1>
          <p className="text-muted-foreground max-w-prose leading-relaxed">
            Plan stops in order, add your own travel estimates, and see how fixed bookings fit.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={appRoutes.demo} className={buttonVariants({ size: 'lg' })}>
              Try sample
            </Link>
            <Link
              href={user?.ok ? appRoutes.trips : appRoutes.signIn}
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              {user?.ok ? 'My trips' : 'Sign in'}
            </Link>
          </div>
        </div>
        <div className="rounded-xl border p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold">A day in Porto</h2>
            <span className="text-muted-foreground text-sm">Sample</span>
          </div>
          <ol className="flex flex-col divide-y">
            <li className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm">
              <span>Breakfast</span>
              <time>09:00–09:45</time>
            </li>
            <li className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm">
              <span>National Museum</span>
              <time>10:05–11:35</time>
            </li>
            <li className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm">
              <span>Lunch · booked 12:00</span>
              <time>Arrive 12:05</time>
            </li>
          </ol>
          <p className="text-muted-foreground mt-3 text-sm">
            A five-minute late arrival is shown before you build your own day.
          </p>
        </div>
      </section>
    </main>
  )
}
