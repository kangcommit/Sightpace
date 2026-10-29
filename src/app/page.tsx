import { cn } from 'cn'
import { ArrowRight, MapPin } from 'lucide-react'
import Link from 'next/link'
import { BrandLink } from '@/components/brand-link'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { APP_NAME } from '@/lib/brand'
import { appRoutes } from '@/lib/routes'
import { requireUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const user = await requireUser().catch(() => null)

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-14 px-4 py-8 sm:px-6 sm:py-10 lg:gap-24">
      <header className="flex min-h-11 items-center justify-between gap-4">
        <BrandLink href={appRoutes.home} />
        <span className="text-muted-foreground hidden text-sm sm:block">
          Make room for the moments that matter.
        </span>
      </header>
      <section className="grid items-center gap-12 pb-12 md:grid-cols-[1fr_0.9fr] md:gap-16">
        <div className="flex flex-col items-start gap-6">
          <p className="text-primary text-sm font-semibold tracking-wide">
            A little more room to explore
          </p>
          <h1 className="max-w-xl text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            See what fits into your travel day
          </h1>
          <p className="text-muted-foreground max-w-md text-lg leading-relaxed">
            Plan stops in order, add your own travel estimates, and see how fixed bookings fit.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={appRoutes.demo} className={cn(buttonVariants({ size: 'lg' }), 'min-h-11')}>
              Try sample <ArrowRight aria-hidden="true" />
            </Link>
            <Link
              href={user?.ok ? appRoutes.trips : appRoutes.signIn}
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'min-h-11')}
            >
              {user?.ok ? 'My trips' : 'Sign in'}
            </Link>
          </div>
        </div>
        <Card className="rounded-2xl">
          <CardHeader className="grid-cols-[1fr_auto] items-center gap-3">
            <div className="text-primary flex items-center gap-2 text-sm font-medium">
              <MapPin aria-hidden="true" className="size-4" /> Indonesia
            </div>
            <CardAction className="row-span-2 self-center">
              <span className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-xs font-medium">
                Sample day
              </span>
            </CardAction>
            <CardTitle role="heading" aria-level={2}>
              A day in Bandung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col divide-y border-y">
              <li className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm">
                <span>Breakfast</span>
                <time>09:00–09:45</time>
              </li>
              <li className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm">
                <span>Geological Museum</span>
                <time>10:05–11:35</time>
              </li>
              <li className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm">
                <span>Lunch · booked 12:00</span>
                <time>Arrive 12:05</time>
              </li>
            </ol>
            <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
              A five-minute late arrival is shown before you build your own day.
            </p>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="planning-heading" className="grid gap-10 md:grid-cols-2 md:gap-20">
        <div className="flex flex-col items-start gap-5">
          <p className="text-primary text-sm font-semibold">Plan with the whole day in mind</p>
          <h2
            id="planning-heading"
            className="max-w-md text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            A good itinerary leaves room for the journey.
          </h2>
          <p className="text-muted-foreground max-w-md leading-relaxed">
            A list of places is a start. {APP_NAME} brings your stops, travel estimates and bookings
            together so you can see where the day needs more breathing room.
          </p>
        </div>
        <ol className="grid gap-7">
          <li className="grid grid-cols-[3rem_1fr] gap-4">
            <span aria-hidden="true" className="text-primary text-xl font-semibold tabular-nums">
              01
            </span>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Put your stops in order</h3>
              <p className="text-muted-foreground leading-relaxed">
                Choose how long to spend at each place and set a fixed time when you have a booking.
              </p>
            </div>
          </li>
          <li className="grid grid-cols-[3rem_1fr] gap-4">
            <span aria-hidden="true" className="text-primary text-xl font-semibold tabular-nums">
              02
            </span>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Add time between places</h3>
              <p className="text-muted-foreground leading-relaxed">
                Enter your own travel estimates. Missing estimates stay visible, so you know which
                times are provisional.
              </p>
            </div>
          </li>
          <li className="grid grid-cols-[3rem_1fr] gap-4">
            <span aria-hidden="true" className="text-primary text-xl font-semibold tabular-nums">
              03
            </span>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">See what fits</h3>
              <p className="text-muted-foreground leading-relaxed">
                Spot late arrivals and days that run long, then adjust your plan as you go.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section
        aria-labelledby="sample-heading"
        className="bg-secondary text-secondary-foreground grid gap-8 rounded-2xl p-6 sm:p-10 md:grid-cols-[1fr_auto] md:items-end"
      >
        <div className="flex max-w-xl flex-col gap-4">
          <p className="text-primary text-sm font-semibold">Start with a sample</p>
          <h2 id="sample-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Make the day your own.
          </h2>
          <p className="leading-relaxed">
            Explore an editable day in Bandung. Try moving a stop or changing a travel estimate to
            see how the rest of the day responds.
          </p>
          <p className="text-muted-foreground text-sm">
            No account needed to explore. Sign in when you want to save a copy.
          </p>
        </div>
        <Link
          href={appRoutes.demo}
          className={cn(buttonVariants({ size: 'lg' }), 'min-h-11 w-fit')}
        >
          Explore the sample <ArrowRight aria-hidden="true" />
        </Link>
      </section>
      <footer className="text-muted-foreground flex flex-wrap items-center gap-3 pb-4 text-sm">
        <BrandLink href={appRoutes.home} />
      </footer>
    </main>
  )
}
