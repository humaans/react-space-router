import { expect, test, type Page } from '@playwright/test'

async function openHistoryFixture(page: Page) {
  await page.goto('/browser-test.html')
  await page.getByRole('link', { name: 'Open page A' }).click()
  await expect(page.getByRole('heading', { name: 'Page A' })).toBeVisible()
}

test('new navigation resets window scroll and Back restores it', async ({ page }) => {
  await openHistoryFixture(page)

  await page.evaluate(() => window.scrollTo(0, 1_200))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1_100)

  await page.getByRole('link', { name: 'Open page B', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Page B' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(10)

  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Page A' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1_100)
})

test('same-page hash links remain browser-owned', async ({ page }) => {
  await openHistoryFixture(page)

  await page.getByRole('link', { name: 'Jump to anchor' }).click()

  await expect(page).toHaveURL(/#anchor$/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1_500)
  await expect(page.locator('#anchor')).toBeInViewport()
})

test('cross-page hash navigation scrolls to the destination fragment', async ({ page }) => {
  await openHistoryFixture(page)

  await page.getByRole('link', { name: 'Open page B at anchor' }).click()

  await expect(page).toHaveURL(/\/browser-test\/b#anchor$/)
  await expect(page.getByRole('heading', { name: 'Page B' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1_500)
  await expect(page.locator('#anchor')).toBeInViewport()
})
