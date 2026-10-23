import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'

export default function Page() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col justify-center px-6 py-16">
      <div className="max-w-2xl space-y-6">
        <p className="text-muted-foreground text-sm font-medium">Next.js template</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          A solid foundation for your next product.
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          The App Router, Tailwind CSS, and source-owned UI components are ready to customize.
        </p>
        <Link
          href="https://nextjs.org/docs"
          className={buttonVariants({ size: 'lg' })}
          target="_blank"
          rel="noreferrer"
        >
          Your app starts here <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </Link>
      </div>
    </main>
  )
}
