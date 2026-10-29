import { Route } from 'lucide-react'
import Link from 'next/link'
import { APP_NAME } from '@/lib/brand'

export function BrandLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 w-fit items-center gap-2.5 font-semibold tracking-tight"
    >
      <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-xl">
        <Route aria-hidden="true" className="size-5" />
      </span>
      {APP_NAME}
    </Link>
  )
}
