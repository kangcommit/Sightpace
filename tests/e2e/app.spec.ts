import { expect, test } from '@playwright/test'

test('renders the landing page and framework documentation link', async ({ page }) => {
  // Arrange
  const route = '/'

  // Act
  await page.goto(route)

  // Assert
  await expect(page).toHaveTitle(/next\.js frontend template/i)
  await expect(
    page.getByRole('heading', { name: /solid foundation for your next product/i }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Your app starts here' })).toHaveAttribute(
    'href',
    'https://nextjs.org/docs',
  )
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
