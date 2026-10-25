import { expect, test } from '@playwright/test'

for (const width of [360, 1280]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`sign-in retry works by keyboard at ${width}px in ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.emulateMedia({ colorScheme })
      await page.goto(
        '/sign-in?returnTo=https%3A%2F%2Fevil.example&error=untrusted-provider-message',
      )
      await expect(
        page.getByRole('heading', { name: 'Save your trips across devices' }),
      ).toBeVisible()
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(
        'Sign-in wasn’t completed. You can try again.',
      )
      await expect(page.getByText('untrusted-provider-message')).toHaveCount(0)
      await page.route('**/api/auth/sign-in/social', async (route) => {
        expect(route.request().postDataJSON().callbackURL).toBe('/trips')
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'TEMPORARILY_UNAVAILABLE', message: 'synthetic failure' }),
        })
      })
      await page.keyboard.press('Tab')
      await expect(page.getByRole('link', { name: 'TrailPlan', exact: true })).toBeFocused()
      await page.keyboard.press('Tab')
      const button = page.getByRole('button', { name: 'Continue with Google' })
      await expect(button).toBeFocused()
      const response = page.waitForResponse('**/api/auth/sign-in/social')
      await page.keyboard.press('Enter')
      await response
      await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
      await expect(button).toBeEnabled()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
      await page.screenshot({
        path: test.info().outputPath(`sign-in-${width}-${colorScheme}.png`),
        fullPage: true,
      })
    })
  }
}

test('private direct entry and forged cookies require sign-in', async ({ page, context }) => {
  await context.addCookies([
    { name: 'better-auth.session_token', value: 'forged-cookie', domain: '127.0.0.1', path: '/' },
  ])
  await page.goto('/trips')
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Ftrips/)
  await expect(page.getByRole('heading', { name: 'My trips' })).toHaveCount(0)
})

test('auth session endpoint is private/no-store and cross-origin mutations are refused', async ({
  request,
}) => {
  const session = await request.get('/api/auth/get-session')
  expect(session.status()).toBe(200)
  expect(await session.json()).toBeNull()
  expect(session.headers()['cache-control']).toContain('no-store')
  const signIn = await request.post('/api/auth/sign-in/social', {
    headers: { origin: 'https://evil.example' },
    data: { provider: 'google', callbackURL: '/trips' },
  })
  expect(signIn.status()).toBe(403)
})

test('a stale sign-in tab explains that the current account must sign out first', async ({
  page,
}) => {
  await page.goto('/sign-in')
  await page.route('**/api/auth/sign-in/social', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'SIGN_OUT_REQUIRED', message: 'Sign out first.' }),
    })
  })
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  const notice = page.getByRole('main').getByRole('alert')
  await expect(notice).toContainText('Sign out before choosing another Google account')
  await expect(notice).toBeFocused()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Go to my trips' })).toHaveAttribute('href', '/trips')
})
