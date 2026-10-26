'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { safeReturnPath, signInPath } from '@/lib/auth-redirect'
import { appRoutes } from '@/lib/routes'

export function GoogleSignIn({ returnTo, failed }: { returnTo: string; failed: boolean }) {
  const [pending, setPending] = useState(false)
  const [signOutRequired, setSignOutRequired] = useState(false)
  const [error, setError] = useState(failed)
  const signOutNotice = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (signOutRequired) signOutNotice.current?.focus()
  }, [signOutRequired])

  async function signIn() {
    if (pending) return

    setPending(true)
    setError(false)
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: safeReturnPath(returnTo),
        errorCallbackURL: signInPath(returnTo, true),
      })

      if (result.error?.code === 'SIGN_OUT_REQUIRED') {
        setSignOutRequired(true)
        setPending(false)
        return
      }

      if (result.error) throw new Error('Sign-in failed')
    } catch {
      setError(true)
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {signOutRequired && (
        <Alert ref={signOutNotice} tabIndex={-1}>
          <AlertDescription>
            You’re already signed in. Sign out before choosing another Google account.
            <Link href={appRoutes.trips} className="flex min-h-11 items-center">
              Go to my trips
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert>
          <AlertDescription>Sign-in wasn’t completed. You can try again.</AlertDescription>
        </Alert>
      )}
      {!signOutRequired && (
        <Button
          className="min-h-11 w-full motion-reduce:transition-none"
          onClick={signIn}
          disabled={pending}
        >
          {pending ? 'Connecting to Google…' : 'Continue with Google'}
        </Button>
      )}
    </div>
  )
}
