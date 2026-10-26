import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { GoogleSignIn } from '@/components/auth/google-sign-in'
import { safeReturnPath } from '@/lib/auth-redirect'
import { appRoutes } from '@/lib/routes'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Sign in | TrailPlan' }
export const dynamic = 'force-dynamic'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[]; error?: string | string[] }>
}) {
  const params = await searchParams
  const returnTo = safeReturnPath(params.returnTo)

  // Keep provider failures recoverable even when runtime configuration/DB is unavailable.
  const user = await requireUser().catch(() => null)

  if (user?.ok) redirect(returnTo)

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <Link
        href={returnTo === appRoutes.demo ? appRoutes.demo : appRoutes.home}
        className="flex min-h-11 items-center font-semibold"
      >
        TrailPlan
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Save your trips across devices</h1>
      <p>Sign in to keep your travel plans private and return to them later.</p>
      <GoogleSignIn returnTo={returnTo} failed={Boolean(params.error)} />
    </main>
  )
}
