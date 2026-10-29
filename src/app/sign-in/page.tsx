import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { GoogleSignIn } from '@/components/auth/google-sign-in'
import { BrandLink } from '@/components/brand-link'
import { safeReturnPath } from '@/lib/auth-redirect'
import { appRoutes } from '@/lib/routes'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Sign in' }
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
      <BrandLink href={returnTo === appRoutes.demo ? appRoutes.demo : appRoutes.home} />
      <div className="flex flex-col gap-3 pt-4">
        <p className="text-primary text-sm font-semibold">Your plans, wherever you go</p>
        <h1 className="text-3xl font-semibold tracking-tight">Save your trips across devices</h1>
        <p className="text-muted-foreground leading-relaxed">
          Sign in to keep your travel plans private and return to them later.
        </p>
      </div>
      <GoogleSignIn returnTo={returnTo} failed={Boolean(params.error)} />
    </main>
  )
}
