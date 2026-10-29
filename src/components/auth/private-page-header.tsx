import { PrivateSignOutButton } from '@/components/auth/private-session'
import { BrandLink } from '@/components/brand-link'

export function PrivatePageHeader({ href }: { href: string }) {
  return (
    <header className="flex min-h-11 items-center justify-between gap-4">
      <BrandLink href={href} />
      <PrivateSignOutButton />
    </header>
  )
}
