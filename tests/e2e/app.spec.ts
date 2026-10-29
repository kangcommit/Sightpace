import { expect, test } from '@playwright/test'

test('renders the Sightpace introduction and primary actions', async ({ page }) => {
  // Arrange
  const route = '/'

  // Act
  await page.goto(route)

  // Assert
  await expect(page).toHaveTitle(/Sightpace/i)
  await expect(
    page.getByRole('heading', { name: 'See what fits into your travel day' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Try sample' })).toHaveAttribute('href', '/demo')
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
  await expect(page.getByRole('heading', { name: 'A day in Bandung' })).toBeVisible()
})

test('keeps the landing page usable without horizontal scrolling at 320px', async ({ page }) => {
  // Arrange
  const viewport = { width: 320, height: 800 }

  // Act
  await page.setViewportSize(viewport)
  await page.goto('/')
  const documentWidth = await page.locator('html').evaluate((root) => root.scrollWidth)

  // Assert
  expect(documentWidth).toBeLessThanOrEqual(viewport.width)
  await expect(page.getByRole('link', { name: 'Try sample' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
})

test('shows not-found for removed routes', async ({ page }) => {
  // Arrange
  const removedRoute = '/about'

  // Act
  await page.goto(removedRoute)

  // Assert
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('serves the health endpoint', async ({ request }) => {
  // Arrange
  const endpoint = '/api/health'

  // Act
  const response = await request.get(endpoint)

  // Assert
  await expect(response).toBeOK()
  expect(await response.json()).toEqual({ status: 'ok' })
})
