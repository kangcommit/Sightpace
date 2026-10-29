import { Skeleton } from '@/components/ui/skeleton'

export default function TripsLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div role="status">
        <span className="sr-only">Loading your trips…</span>
        <div aria-hidden="true" className="flex flex-col gap-6">
          <Skeleton className="h-6 w-28 motion-reduce:animate-none" />
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-8 w-32 motion-reduce:animate-none" />
            <Skeleton className="h-11 w-28 motion-reduce:animate-none" />
          </div>
          <div className="flex flex-col gap-5">
            <Skeleton className="h-6 w-2/3 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-1/3 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-1/2 motion-reduce:animate-none" />
          </div>
          <div className="flex flex-col gap-5">
            <Skeleton className="h-6 w-1/2 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-1/3 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
          </div>
        </div>
      </div>
    </main>
  )
}
