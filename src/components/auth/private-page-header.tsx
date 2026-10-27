import Link from 'next/link'
import { PrivateSignOutButton } from '@/components/auth/private-session'

export function PrivatePageHeader({ href }: { href: string }) {
  return (
    <header className="flex min-h-11 items-center justify-between gap-4">
      <Link href={href} className="flex min-h-11 items-center font-semibold">
        TrailPlan
      </Link>
      <PrivateSignOutButton />
    </header>
  )
}
