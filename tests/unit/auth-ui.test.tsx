import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleSignIn } from '@/components/auth/google-sign-in'
import { PrivateSession } from '@/components/auth/private-session'
import { clearPrivateStorage, preparePrivateStorage } from '@/lib/private-storage'

const mocks = vi.hoisted(() => ({
  social: vi.fn(),
  signOut: vi.fn(),
  useSession: vi.fn(),
  refetch: vi.fn(),
}))
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { social: mocks.social },
    signOut: mocks.signOut,
    useSession: mocks.useSession,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  mocks.useSession.mockReturnValue({ data: { user: { id: 'a' } }, isPending: false, error: null })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Google sign-in', () => {
  it('asks a stale sign-in tab to sign out first instead of offering account switching', async () => {
    mocks.social.mockResolvedValueOnce({ error: { code: 'SIGN_OUT_REQUIRED' } })
    render(<GoogleSignIn returnTo="/trips" failed={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign out before choosing another Google account',
    )
    expect(screen.getByRole('link', { name: 'Go to my trips' })).toHaveAttribute('href', '/trips')
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
  })

  it('announces cancellation and allows retry without exposing provider messages', async () => {
    mocks.social.mockResolvedValueOnce({ error: { message: 'raw-private-provider-detail' } })
    render(<GoogleSignIn returnTo="/trips" failed />)
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in wasn’t completed')
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())
    expect(screen.getByRole('alert')).not.toHaveTextContent('raw-private-provider-detail')
    expect(mocks.social).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', callbackURL: '/trips' }),
    )
  })
  it('prevents duplicate redirects while pending and recovers from network failure', async () => {
    let rejectRequest: (error: Error) => void = () => {}
    mocks.social.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectRequest = reject
        }),
    )
    render(<GoogleSignIn returnTo="https://evil.example" failed={false} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button'))
    expect(mocks.social).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Connecting to Google…' })).toBeDisabled()
    rejectRequest(new Error('network failure'))
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())
    expect(screen.getByRole('alert')).toHaveTextContent('try again')
    expect(mocks.social).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: '/trips' }))
  })
})

describe('private browser data and sign-out', () => {
  it('shows signing-out progress without a retry action before a failure', async () => {
    mocks.signOut.mockImplementationOnce(() => new Promise(() => {}))
    render(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )
    await screen.findByText('Private itinerary')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('status')).toHaveTextContent('Signing out…')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText('Private itinerary')).not.toBeInTheDocument()
  })
  it('acknowledges server sign-out even when saved-edit cleanup fails', async () => {
    mocks.signOut.mockResolvedValueOnce({ error: null })
    render(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )
    await screen.findByText('Private itinerary')
    const blocked = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'You’re signed out' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Clear saved edits' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Retry sign out' })).not.toBeInTheDocument()
    expect(screen.queryByText(/still be signed in/)).not.toBeInTheDocument()
    expect(screen.queryByText('Private itinerary')).not.toBeInTheDocument()
    blocked.mockRestore()
  })
  it('offers retry for an account-check error without treating it as sign-out or removing drafts', async () => {
    preparePrivateStorage('a')
    localStorage.setItem('trailplan:private:a:trip', 'synthetic draft')
    mocks.refetch.mockResolvedValueOnce(undefined)
    mocks.useSession.mockReturnValue({
      data: null,
      isPending: false,
      error: new Error('offline'),
      refetch: mocks.refetch,
    })
    render(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )
    expect(screen.getByRole('heading', { name: 'We couldn’t open your trips' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem('trailplan:private:a:trip')).toBe('synthetic draft')
    expect(screen.queryByText('Private itinerary')).not.toBeInTheDocument()
  })

  it('keeps private content hidden behind one loading state until session and storage are ready', async () => {
    mocks.useSession.mockReturnValue({ data: null, isPending: true, error: null })
    const view = render(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading your trips…')
    expect(screen.queryByText('Private itinerary')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
    mocks.useSession.mockReturnValue({ data: { user: { id: 'a' } }, isPending: false, error: null })
    view.rerender(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )
    expect(await screen.findByText('Private itinerary')).toBeVisible()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('does not render private children on the server before browser storage preparation', () => {
    const html = renderToString(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )
    expect(html).not.toContain('Private itinerary')
    expect(html).toContain('Loading your trips…')
  })

  it('purges only namespaced private data from both storage areas', () => {
    for (const storage of [localStorage, sessionStorage]) {
      storage.setItem('trailplan:private:a:trip', 'synthetic draft')
      storage.setItem('trailplan:demo', 'public sample')
      storage.setItem('unrelated', 'keep')
    }
    expect(clearPrivateStorage()).toBe(true)
    for (const storage of [localStorage, sessionStorage]) {
      expect(storage.getItem('trailplan:private:a:trip')).toBeNull()
      expect(storage.getItem('trailplan:demo')).toBe('public sample')
      expect(storage.getItem('unrelated')).toBe('keep')
    }
  })
  it('preserves same-account recovery in a new tab', () => {
    preparePrivateStorage('a')
    localStorage.setItem('trailplan:private:a:trip', 'synthetic draft')
    sessionStorage.clear()
    expect(preparePrivateStorage('a')).toBe(true)
    expect(localStorage.getItem('trailplan:private:a:trip')).toBe('synthetic draft')
  })
  it('clears old-account data before preparing a new private view', () => {
    expect(preparePrivateStorage('a')).toBe(true)
    localStorage.setItem('trailplan:private:a:trip', 'synthetic draft')
    expect(preparePrivateStorage('b')).toBe(true)
    expect(localStorage.getItem('trailplan:private:a:trip')).toBeNull()
  })
  it('closes private UI immediately, clears drafts, and reports failed server revocation honestly', async () => {
    preparePrivateStorage('a')
    localStorage.setItem('trailplan:private:a:trip', 'synthetic draft')
    mocks.signOut.mockRejectedValueOnce(new Error('offline'))
    render(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )
    expect(await screen.findByText('Private itinerary')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.queryByText('Private itinerary')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('still be signed in'))
    expect(screen.getByRole('heading', { name: 'We couldn’t sign you out' })).toHaveFocus()
    expect(localStorage.getItem('trailplan:private:a:trip')).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry sign out' })).toBeEnabled()
  })
  it('hides an expired session while preserving the same user’s recovery draft', () => {
    preparePrivateStorage('a')
    localStorage.setItem('trailplan:private:a:trip', 'synthetic draft')
    mocks.useSession.mockReturnValue({ data: null, isPending: false, error: null })
    render(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )
    expect(screen.queryByText('Private itinerary')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in again' })).toBeVisible()
    expect(localStorage.getItem('trailplan:private:a:trip')).toBe('synthetic draft')
  })
  it('fails closed and warns when browser storage is unavailable', async () => {
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('saved edits on this device')
    expect(screen.queryByText('Private itinerary')).not.toBeInTheDocument()
    blocked.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Private itinerary')).toBeVisible()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})
