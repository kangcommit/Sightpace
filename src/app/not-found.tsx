import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60svh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-medium text-muted-foreground text-sm">404</p>
      <h1 className="font-semibold text-3xl tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">The page you requested does not exist.</p>
      <Link href="/" className={buttonVariants({ variant: 'outline' })}>
        Return home
      </Link>
    </main>
  )
}
