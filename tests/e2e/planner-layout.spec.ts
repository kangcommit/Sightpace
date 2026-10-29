import { expect, test } from '@playwright/test'

for (const width of [320, 768, 1280]) {
  test(`sample planner fits at ${width}px`, async ({ page }) => {
    // Arrange
    await page.setViewportSize({ width, height: 800 })

    // Act
    await page.goto('/demo')
    await page.getByRole('button', { name: 'Add activity' }).waitFor()
    if (width < 768) await page.getByRole('tab', { name: 'Timeline' }).click()
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }))
    await page.screenshot({
      path: test.info().outputPath(`planner-${width}.png`),
      animations: 'disabled',
    })

    // Assert
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
    await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Edit Lunch; projected/ })).toBeVisible()
  })
}

test('uses the light palette when the system prefers dark', async ({ page }) => {
  // Arrange
  await page.emulateMedia({ colorScheme: 'dark' })

  // Act
  await page.goto('/demo')
  const theme = await page.locator('html').evaluate((element) => ({
    colorScheme: getComputedStyle(element).colorScheme,
    darkClass: element.classList.contains('dark'),
  }))

  // Assert
  expect(theme).toEqual({ colorScheme: 'light', darkClass: false })
})
