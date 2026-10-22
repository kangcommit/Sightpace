import { expect, test } from '@playwright/test'

test('renders the landing page and framework documentation link', async ({ page }) => {
  await page.goto('/')

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
  await page.goto('/about')

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('serves the health endpoint', async ({ request }) => {
  const response = await request.get('/api/health')

  await expect(response).toBeOK()
  expect(await response.json()).toEqual({ status: 'ok' })
})
