import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <main aria-busy="true" className="mx-auto max-w-6xl px-6 py-20">
      <div className="flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-6 w-full max-w-xl" />
      </div>
    </main>
  )
}
