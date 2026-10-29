'use client'

import { CircleAlert } from 'lucide-react'

import { BrandLink } from '@/components/brand-link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { appRoutes } from '@/lib/routes'

export default function TripsError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60svh] max-w-xl flex-col items-center justify-center gap-8 px-6 py-12">
      <BrandLink href={appRoutes.home} />
      <Card className="w-full max-w-md gap-6 px-6 py-8 text-center sm:px-10 sm:py-10">
        <CardContent className="flex flex-col items-center gap-6 p-0">
          <CircleAlert aria-hidden="true" className="text-destructive size-8" />
          <h1 className="text-2xl font-semibold tracking-tight">We couldn’t open your trips</h1>
          <Button className="min-h-11 w-full sm:w-auto" onClick={reset}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
