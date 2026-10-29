import { expect, test } from '@playwright/test'

for (const width of [320, 768, 1280]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`sample planner fits at ${width}px in ${colorScheme}`, async ({ page }) => {
      // Arrange
      await page.setViewportSize({ width, height: 800 })
      await page.emulateMedia({ colorScheme })

      // Act
      await page.goto('/demo')
      await page.getByRole('button', { name: 'Add activity' }).waitFor()
      if (width < 768) await page.getByRole('tab', { name: 'Timeline' }).click()
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }))
      await page.screenshot({
        path: test.info().outputPath(`planner-${width}-${colorScheme}.png`),
        animations: 'disabled',
      })

      // Assert
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
      await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: /Edit Lunch; projected/ })).toBeVisible()
    })
  }
}
