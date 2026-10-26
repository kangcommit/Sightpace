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
    // Arrange
    mocks.social.mockResolvedValueOnce({ error: { code: 'SIGN_OUT_REQUIRED' } })

    render(<GoogleSignIn returnTo="/trips" failed={false} />)

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign out before choosing another Google account',
    )
    expect(screen.getByRole('link', { name: 'Go to my trips' })).toHaveAttribute('href', '/trips')
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
  })

  it('announces cancellation and allows retry without exposing provider messages', async () => {
    // Arrange
    mocks.social.mockResolvedValueOnce({ error: { message: 'raw-private-provider-detail' } })

    // Act
    render(<GoogleSignIn returnTo="/trips" failed />)
    const initialAlert = screen.getByRole('alert').textContent
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => {
      if (screen.getByRole('button').hasAttribute('disabled')) throw new Error('Still pending')
    })
    const retryAlert = screen.getByRole('alert').textContent
    const providerOptions = mocks.social.mock.calls[0]?.[0]

    // Assert
    expect(initialAlert).toContain('Sign-in wasn’t completed')
    expect(retryAlert).not.toContain('raw-private-provider-detail')
    expect(providerOptions).toEqual(
      expect.objectContaining({ provider: 'google', callbackURL: '/trips' }),
    )
  })

  it('prevents duplicate redirects while pending and recovers from network failure', async () => {
    // Arrange
    let rejectRequest: (error: Error) => void = () => {}
    mocks.social.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectRequest = reject
        }),
    )

    render(<GoogleSignIn returnTo="https://evil.example" failed={false} />)

    // Act
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button'))
    const pendingCallCount = mocks.social.mock.calls.length
    const pendingButtonDisabled = screen.getByRole('button').hasAttribute('disabled')
    const pendingButtonName = screen.getByRole('button').textContent
    rejectRequest(new Error('network failure'))
    await waitFor(() => {
      if (screen.getByRole('button').hasAttribute('disabled')) throw new Error('Still pending')
    })
    const recoveredAlert = screen.getByRole('alert').textContent
    const callOptions = mocks.social.mock.calls[0]?.[0]

    // Assert
    expect(pendingCallCount).toBe(1)
    expect(pendingButtonDisabled).toBe(true)
    expect(pendingButtonName).toContain('Connecting to Google')
    expect(recoveredAlert).toContain('try again')
    expect(callOptions).toEqual(expect.objectContaining({ callbackURL: '/trips' }))
  })
})

describe('private browser data and sign-out', () => {
  it('does not append a sign-out button to private page content', async () => {
    // Arrange
    render(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )

    // Act
    await screen.findByText('Private itinerary')

    // Assert
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('shows signing-out progress without a retry action before a failure', async () => {
    // Arrange
    mocks.signOut.mockImplementationOnce(() => new Promise(() => {}))
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )

    await screen.findByRole('heading', { name: 'We couldn’t open your trips' })

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'Sign out on this device' }))

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('Signing out…')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText('Private itinerary')).not.toBeInTheDocument()
  })

  it('acknowledges server sign-out even when saved-edit cleanup fails', async () => {
    // Arrange
    preparePrivateStorage('a')
    localStorage.setItem('trailplan:private:a:trip', 'synthetic draft')
    mocks.signOut.mockResolvedValueOnce({ error: null })
    mocks.useSession.mockReturnValue({ data: null, isPending: false, error: null })
    render(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )

    expect(screen.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible()

    const blocked = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'Sign out on this device' }))

    // Assert
    expect(await screen.findByRole('heading', { name: 'You’re signed out' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Clear saved edits' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Retry sign out' })).not.toBeInTheDocument()
    expect(screen.queryByText(/still be signed in/)).not.toBeInTheDocument()
    expect(screen.queryByText('Private itinerary')).not.toBeInTheDocument()

    blocked.mockRestore()
  })

  it('offers retry for an account-check error without treating it as sign-out or removing drafts', async () => {
    // Arrange
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

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1))

    // Assert
    expect(localStorage.getItem('trailplan:private:a:trip')).toBe('synthetic draft')
    expect(screen.queryByText('Private itinerary')).not.toBeInTheDocument()
  })

  it('keeps private content hidden behind one loading state until session and storage are ready', async () => {
    // Arrange
    mocks.useSession.mockReturnValue({ data: null, isPending: true, error: null })

    // Act
    const view = render(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )

    const loadingText = screen.getByRole('status').textContent
    const privateContentInitiallyHidden = screen.queryByText('Private itinerary') === null
    const signOutInitiallyHidden = screen.queryByRole('button', { name: 'Sign out' }) === null
    mocks.useSession.mockReturnValue({ data: { user: { id: 'a' } }, isPending: false, error: null })

    view.rerender(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )

    const privateContentVisible = await screen
      .findByText('Private itinerary')
      .then((node) => node.isConnected)
    const loadingStatusCleared = screen.queryByRole('status') === null

    // Assert
    expect(loadingText).toContain('Loading your trips…')
    expect(privateContentInitiallyHidden).toBe(true)
    expect(signOutInitiallyHidden).toBe(true)
    expect(privateContentVisible).toBe(true)
    expect(loadingStatusCleared).toBe(true)
  })

  it('does not render private children on the server before browser storage preparation', () => {
    // Arrange
    const children = (
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>
    )

    // Act
    const html = renderToString(children)

    // Assert
    expect(html).not.toContain('Private itinerary')
    expect(html).toContain('Loading your trips…')
  })

  it('purges only namespaced private data from both storage areas', () => {
    // Arrange
    for (const storage of [localStorage, sessionStorage]) {
      storage.setItem('trailplan:private:a:trip', 'synthetic draft')
      storage.setItem('trailplan:demo', 'public sample')
      storage.setItem('unrelated', 'keep')
    }

    // Act
    expect(clearPrivateStorage()).toBe(true)

    // Assert
    for (const storage of [localStorage, sessionStorage]) {
      expect(storage.getItem('trailplan:private:a:trip')).toBeNull()
      expect(storage.getItem('trailplan:demo')).toBe('public sample')
      expect(storage.getItem('unrelated')).toBe('keep')
    }
  })

  it('preserves same-account recovery in a new tab', () => {
    // Arrange
    preparePrivateStorage('a')
    localStorage.setItem('trailplan:private:a:trip', 'synthetic draft')
    sessionStorage.clear()

    // Act
    expect(preparePrivateStorage('a')).toBe(true)

    // Assert
    expect(localStorage.getItem('trailplan:private:a:trip')).toBe('synthetic draft')
  })

  it('clears old-account data before preparing a new private view', () => {
    // Arrange
    expect(preparePrivateStorage('a')).toBe(true)
    localStorage.setItem('trailplan:private:a:trip', 'synthetic draft')

    // Act
    expect(preparePrivateStorage('b')).toBe(true)

    // Assert
    expect(localStorage.getItem('trailplan:private:a:trip')).toBeNull()
  })

  it('closes private UI immediately, clears drafts, and reports failed server revocation honestly', async () => {
    // Arrange
    preparePrivateStorage('a')
    localStorage.setItem('trailplan:private:a:trip', 'synthetic draft')
    mocks.signOut.mockRejectedValueOnce(new Error('offline'))
    mocks.useSession.mockReturnValue({ data: null, isPending: false, error: null })

    render(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )

    expect(screen.queryByText('Private itinerary')).not.toBeInTheDocument()

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'Sign out on this device' }))

    // Assert
    expect(screen.queryByText('Private itinerary')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('still be signed in'))
    expect(screen.getByRole('heading', { name: 'We couldn’t sign you out' })).toHaveFocus()
    expect(localStorage.getItem('trailplan:private:a:trip')).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry sign out' })).toBeEnabled()
  })

  it('hides an expired session while preserving the same user’s recovery draft', () => {
    // Arrange
    preparePrivateStorage('a')
    localStorage.setItem('trailplan:private:a:trip', 'synthetic draft')
    mocks.useSession.mockReturnValue({ data: null, isPending: false, error: null })

    // Act
    render(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )

    // Assert
    expect(screen.queryByText('Private itinerary')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in again' })).toBeVisible()
    expect(localStorage.getItem('trailplan:private:a:trip')).toBe('synthetic draft')
  })

  it('fails closed and warns when browser storage is unavailable', async () => {
    // Arrange
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    // Act
    render(
      <PrivateSession userId="a">
        <p>Private itinerary</p>
      </PrivateSession>,
    )

    const blockedAlertText = await screen.findByRole('alert').then((node) => node.textContent)
    const privateContentInitiallyHidden = screen.queryByText('Private itinerary') === null
    blocked.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const privateContentVisible = await screen
      .findByText('Private itinerary')
      .then((node) => node.isConnected)
    const signOutNotCalled = mocks.signOut.mock.calls.length === 0

    // Assert
    expect(blockedAlertText).toContain('saved edits on this device')
    expect(privateContentInitiallyHidden).toBe(true)
    expect(privateContentVisible).toBe(true)
    expect(signOutNotCalled).toBe(true)
  })
})
