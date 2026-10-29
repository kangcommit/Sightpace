'use client'

import { useEffect } from 'react'

import { BrandLink } from '@/components/brand-link'
import { Button } from '@/components/ui/button'
import { appRoutes } from '@/lib/routes'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-[60svh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <BrandLink href={appRoutes.home} />
      <p className="text-muted-foreground text-sm font-medium">Something went wrong</p>
      <h1 className="text-3xl font-semibold tracking-tight">We could not load this page.</h1>
      <p className="text-muted-foreground">
        Try again. If the problem continues, come back in a few minutes.
      </p>
      <Button className="min-h-11" onClick={reset}>
        Try again
      </Button>
    </main>
  )
}
