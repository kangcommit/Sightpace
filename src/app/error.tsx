'use client'

import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

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
      <p className="font-medium text-muted-foreground text-sm">Something went wrong</p>
      <h1 className="font-semibold text-3xl tracking-tight">We could not load this page.</h1>
      <p className="text-muted-foreground">
        Try again. If the problem continues, check the server logs using the request identifier.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  )
}
