import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PrivateSession } from '@/components/auth/private-session'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: 'My trips | TrailPlan' }
export const dynamic = 'force-dynamic'

export default async function TripsPage() {
  const user = await requireUser()

  if (!user.ok) redirect('/sign-in?returnTo=%2Ftrips')

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link href="/" className="flex min-h-11 items-center font-semibold">
        TrailPlan
      </Link>
      <PrivateSession userId={user.data.id}>
        <h1 className="text-2xl font-semibold">My trips</h1>
        <p>You’re signed in. Trip planning isn’t available yet.</p>
      </PrivateSession>
    </main>
  )
}
