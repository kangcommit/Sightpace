import { expect, test } from '@playwright/test'

for (const width of [360, 1280]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`sign-in retry works by keyboard at ${width}px in ${colorScheme}`, async ({ page }) => {
      // Arrange
      await page.setViewportSize({ width, height: 800 })
      await page.emulateMedia({ colorScheme })
      let callbackURL = ''
      await page.route('**/api/auth/sign-in/social', async (route) => {
        callbackURL = route.request().postDataJSON().callbackURL
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'TEMPORARILY_UNAVAILABLE', message: 'synthetic failure' }),
        })
      })

      // Act
      await page.goto(
        '/sign-in?returnTo=https%3A%2F%2Fevil.example&error=untrusted-provider-message',
      )
      const initialHeadingVisible = await page
        .getByRole('heading', { name: 'Save your trips across devices' })
        .isVisible()
      const initialAlertText = await page.getByRole('main').getByRole('alert').textContent()
      const providerMessageCount = await page.getByText('untrusted-provider-message').count()

      await page.keyboard.press('Tab')
      const logoFocused = await page
        .getByRole('link', { name: 'Sightpace', exact: true })
        .evaluate((element) => element === document.activeElement)

      await page.keyboard.press('Tab')
      const button = page.getByRole('button', { name: 'Continue with Google' })
      const buttonFocused = await button.evaluate((element) => element === document.activeElement)

      const response = page.waitForResponse('**/api/auth/sign-in/social')
      await page.keyboard.press('Enter')
      await response
      const retryButtonEnabled = await button.isEnabled()
      const noHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      )
      const buttonHeight = (await button.boundingBox())?.height ?? 0
      await page.screenshot({
        path: test.info().outputPath(`sign-in-${width}-${colorScheme}.png`),
        fullPage: true,
      })

      // Assert
      expect(callbackURL).toBe('/trips')
      expect(initialHeadingVisible).toBe(true)
      expect(initialAlertText).toBe('Sign-in wasn’t completed. You can try again.')
      expect(providerMessageCount).toBe(0)
      expect(logoFocused).toBe(true)
      expect(buttonFocused).toBe(true)
      await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
      expect(retryButtonEnabled).toBe(true)
      expect(noHorizontalOverflow).toBe(true)
      expect(buttonHeight).toBeGreaterThanOrEqual(44)
    })
  }
}

test('private direct entry and forged cookies require sign-in', async ({ page, context }) => {
  // Arrange
  await context.addCookies([
    { name: 'better-auth.session_token', value: 'forged-cookie', domain: '127.0.0.1', path: '/' },
  ])

  // Act
  await page.goto('/trips')

  // Assert
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Ftrips/)
  await expect(page.getByRole('heading', { name: 'My trips' })).toHaveCount(0)
})

test('trip creation and detail direct links require sign-in before showing private UI', async ({
  page,
}) => {
  // Arrange
  const tripId = '20000000-0000-4000-8000-000000000001'
  const privatePaths = ['/trips/new', `/trips/${tripId}`]

  // Act
  const destinations: { href: string; returnTo: string | null }[] = []
  for (const path of privatePaths) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/sign-in/)
    const url = new URL(page.url())
    destinations.push({ href: url.href, returnTo: url.searchParams.get('returnTo') })
  }
  const privateContentCount = await page.getByRole('heading', { name: 'Create a trip' }).count()

  // Assert
  expect(destinations).toMatchObject(privatePaths.map((returnTo) => ({ returnTo })))
  expect(privateContentCount).toBe(0)
  await expect(page.getByRole('heading', { name: 'Save your trips across devices' })).toBeVisible()
})

test('auth session endpoint is private/no-store and cross-origin mutations are refused', async ({
  request,
}) => {
  // Arrange
  const sessionEndpoint = '/api/auth/get-session'

  // Act
  const session = await request.get(sessionEndpoint)
  const signIn = await request.post('/api/auth/sign-in/social', {
    headers: { origin: 'https://evil.example' },
    data: { provider: 'google', callbackURL: '/trips' },
  })

  // Assert
  expect(session.status()).toBe(200)
  expect(await session.json()).toBeNull()
  expect(session.headers()['cache-control']).toContain('no-store')
  expect(signIn.status()).toBe(403)
})

test('a stale sign-in tab explains that the current account must sign out first', async ({
  page,
}) => {
  // Arrange
  await page.route('**/api/auth/sign-in/social', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'SIGN_OUT_REQUIRED', message: 'Sign out first.' }),
    })
  })

  // Act
  await page.goto('/sign-in')
  await page.getByRole('button', { name: 'Continue with Google' }).click()

  // Assert
  const notice = page.getByRole('main').getByRole('alert')
  await expect(notice).toContainText('Sign out before choosing another Google account')
  await expect(notice).toBeFocused()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Go to my trips' })).toHaveAttribute('href', '/trips')
})
