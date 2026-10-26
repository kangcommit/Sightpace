'use client'

import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { appRoutes } from '@/lib/routes'

export default function TripsError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">We couldn’t open your trips</h1>
      <Alert variant="destructive">
        <AlertDescription>
          Please try again, or sign in again if the problem continues.
        </AlertDescription>
      </Alert>
      <Button className="min-h-11 self-start" onClick={reset}>
        Try again
      </Button>
      <Link href={appRoutes.signIn} className="flex min-h-11 items-center">
        Back to sign in
      </Link>
    </main>
  )
}
