'use client'

import { LoaderCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { authClient } from '@/lib/auth-client'
import { clearPrivateStorage, preparePrivateStorage } from '@/lib/private-storage'

function PrivateSessionLoading() {
  return (
    <div role="status">
      <span className="sr-only">Loading your trips…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <Skeleton className="h-8 w-32 motion-reduce:animate-none" />
        <Skeleton className="h-6 w-full max-w-sm motion-reduce:animate-none" />
        <Skeleton className="h-11 w-24 motion-reduce:animate-none" />
      </div>
    </div>
  )
}

export function PrivateSession({
  userId,
  children,
}: {
  userId: string
  children: React.ReactNode
}) {
  const { data, isPending, error, refetch } = authClient.useSession()
  const [logout, setLogout] = useState<'idle' | 'pending' | 'failed' | 'complete'>('idle')
  const [storageFailed, setStorageFailed] = useState(false)
  const [externalChange, setExternalChange] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [ready, setReady] = useState(false)
  const statusHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (
        (event.key === null || event.key === 'trailplan:private:owner') &&
        event.newValue !== userId
      ) {
        setExternalChange(true)
        window.location.replace('/trips')
      }
    }

    window.addEventListener('storage', onStorage)

    return () => window.removeEventListener('storage', onStorage)
  }, [userId])

  useEffect(() => {
    if (!data || data.user.id !== userId || logout !== 'idle' || externalChange) return

    const prepared = preparePrivateStorage(userId)

    setStorageFailed(!prepared)
    setReady(prepared)
  }, [data, userId, logout, externalChange])

  useEffect(() => {
    if (logout !== 'idle' || storageFailed || error || (!isPending && !data))
      statusHeading.current?.focus()
  }, [logout, storageFailed, error, isPending, data])

  async function signOut() {
    if (logout === 'pending') return

    setLogout('pending')

    const cleared = clearPrivateStorage()

    setStorageFailed(!cleared)

    try {
      const result = await authClient.signOut()
      if (result.error) throw new Error('Sign-out failed')

      setLogout('complete')
      if (!cleared) return

      window.location.replace('/sign-in')
    } catch {
      setLogout('failed')
    }
  }

  function retryStorage() {
    const leaving = logout === 'complete' || externalChange
    const cleared = leaving ? clearPrivateStorage() : preparePrivateStorage(userId)

    setStorageFailed(!cleared)

    if (!cleared) return

    if (leaving) window.location.replace(logout === 'complete' ? '/sign-in' : '/trips')
    else setReady(true)
  }

  async function retrySession() {
    setRetrying(true)
    try {
      await refetch()
    } catch {
      /* The account error stays visible until a successful check. */
    } finally {
      setRetrying(false)
    }
  }

  if (logout === 'pending' || (logout === 'complete' && !storageFailed))
    return (
      <section role="status" className="flex items-center gap-3">
        <LoaderCircle
          aria-hidden="true"
          className="size-5 animate-spin motion-reduce:animate-none"
        />
        <h1 ref={statusHeading} tabIndex={-1} className="text-2xl font-semibold">
          Signing out…
        </h1>
      </section>
    )

  if (logout === 'failed' || storageFailed)
    return (
      <section className="flex flex-col gap-4" aria-label="Account access">
        <h1 ref={statusHeading} tabIndex={-1} className="text-2xl font-semibold">
          {logout === 'failed'
            ? 'We couldn’t sign you out'
            : logout === 'complete'
              ? 'You’re signed out'
              : 'We couldn’t open your trips'}
        </h1>
        {storageFailed && (
          <Alert variant="destructive">
            <AlertDescription>
              We couldn’t access saved edits on this device. Check your browser’s site data settings
              and try again. Before sharing this device, clear this site’s data.
            </AlertDescription>
          </Alert>
        )}
        {logout === 'failed' && (
          <Alert variant="destructive">
            <AlertDescription>
              You may still be signed in. Try again before leaving a shared device.
            </AlertDescription>
          </Alert>
        )}
        {logout === 'failed' ? (
          <Button className="min-h-11 motion-reduce:transition-none" onClick={signOut}>
            Retry sign out
          </Button>
        ) : (
          <Button className="min-h-11 motion-reduce:transition-none" onClick={retryStorage}>
            {logout === 'complete' ? 'Clear saved edits' : 'Try again'}
          </Button>
        )}
        {logout === 'idle' && (
          <Button className="min-h-11" variant="outline" onClick={signOut}>
            Sign out on this device
          </Button>
        )}
      </section>
    )

  if (externalChange || isPending) return <PrivateSessionLoading />

  if (error)
    return (
      <section className="flex flex-col gap-4" aria-label="Account access">
        <h1 ref={statusHeading} tabIndex={-1} className="text-2xl font-semibold">
          We couldn’t open your trips
        </h1>
        <Alert>
          <AlertDescription>
            Please try again, or sign in again if the problem continues.
          </AlertDescription>
        </Alert>
        <Button className="min-h-11" onClick={retrySession} disabled={retrying}>
          {retrying ? 'Trying again…' : 'Try again'}
        </Button>
        <Link href="/sign-in?returnTo=%2Ftrips" className="flex min-h-11 items-center">
          Sign in again
        </Link>
      </section>
    )

  if (!data)
    return (
      <section className="flex flex-col gap-4" aria-label="Account access">
        <h1 ref={statusHeading} tabIndex={-1} className="text-2xl font-semibold">
          Sign in to continue
        </h1>
        <p>Use the same Google account to return to your trips.</p>
        <Link href="/sign-in?returnTo=%2Ftrips" className="flex min-h-11 items-center">
          Sign in again
        </Link>
        <Button className="min-h-11" variant="outline" onClick={signOut}>
          Sign out on this device
        </Button>
      </section>
    )

  if (!ready) return <PrivateSessionLoading />

  return (
    <div className="flex flex-col gap-6">
      {children}
      <Button
        className="min-h-11 self-start motion-reduce:transition-none"
        variant="outline"
        onClick={signOut}
      >
        Sign out
      </Button>
    </div>
  )
}
