import { expect, test, type Page } from '@playwright/test'

async function openDemo(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Loading Modes Demo' })).toBeVisible()
}

test('holds the previous page while a Suspense destination loads', async ({ page }) => {
  await openDemo(page)

  const target = page.getByRole('link', { name: /Wait for ready/ })
  await target.click()

  await expect(page).toHaveURL('/mode-b')
  await expect(target).toHaveAttribute('data-pending', '')
  await expect(page.getByRole('heading', { name: 'Loading Modes Demo' })).toBeVisible()
  await expect(page.locator('.progress-bar')).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Mode (b) — Wait for Ready' })).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText(/1,284 followers/)).toBeVisible()
  await expect(page.locator('.progress-bar')).toBeHidden()
})

test('can traverse back while a destination is still suspended', async ({ page }) => {
  await openDemo(page)

  await page.getByRole('link', { name: /Wait for ready/ }).click()
  await expect(page).toHaveURL('/mode-b')
  await page.goBack()

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Loading Modes Demo' })).toBeVisible()
  await expect(page.locator('.progress-bar')).toBeHidden()

  // The superseded destination must not appear after its original data and
  // chunk promises settle.
  await page.waitForTimeout(3_200)
  await expect(page.getByRole('heading', { name: 'Mode (b) — Wait for Ready' })).toBeHidden()
})

test('reveals delayed fallbacks after the configured threshold', async ({ page }) => {
  await openDemo(page)

  await page.getByRole('link', { name: /Timed fallback/ }).click()
  await expect(page.getByRole('heading', { name: 'Loading Modes Demo' })).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Mode (c) — Timed Fallback' })).toBeVisible({ timeout: 2_000 })
  await expect(page.locator('.is-skeleton')).toBeVisible()
  await expect(page.getByText(/You might also like/)).toBeVisible({ timeout: 5_000 })
})

test('navigation blocking demo can stay or discard and leave', async ({ page }) => {
  await openDemo(page)
  await page.getByRole('link', { name: /Navigation blocking/ }).click()
  await expect(page.getByRole('heading', { name: 'Navigation Blocking' })).toBeVisible()

  await page.getByLabel('Project note').fill('An edited note')
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Go to overview' }).click()

  const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' })
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL('/blocking')

  await dialog.getByRole('button', { name: 'Stay here' }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL('/blocking')

  await page.getByRole('link', { name: 'Go to overview' }).click()
  await dialog.getByRole('button', { name: 'Discard and leave' }).click()
  await expect(page.getByRole('heading', { name: 'Loading Modes Demo' })).toBeVisible()
  await expect(page).toHaveURL('/')
})
