import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { PrismaPg } from '@prisma/adapter-pg'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { testUtils } from 'better-auth/plugins'
import { afterAll, beforeAll, expect, inject, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { authOptions } from '@/lib/auth-options'

const databaseUrl = inject('databaseUrl')
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }), log: [] })
const testSecret = 'synthetic-trip-journey-secret-0123456789abcdef'
const email = `trip-journey-${randomUUID()}@example.test`
type PlaywrightBrowser = Awaited<ReturnType<typeof chromium.launch>>
let app: ChildProcess | undefined
let serverOutput = ''
let userId: string | undefined
let browser: PlaywrightBrowser | undefined
let origin: string
let port: number
let sessionCookies: {
  name: string
  value: string
  domain: string
  path: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Lax' | 'Strict' | 'None'
  expires?: number
}[]

function rememberOutput(chunk: Buffer) {
  serverOutput = `${serverOutput}${chunk.toString()}`.slice(-6000)
}

async function availablePort() {
  const server = createServer()

  const selected = await new Promise<number>((resolvePort, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        reject(new Error('Could not reserve a local browser-test port.'))
        return
      }

      resolvePort(address.port)
    })
  })

  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()))
  })

  return selected
}

function authFixture() {
  const environment = {
    NODE_ENV: 'test' as const,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: testSecret,
    GOOGLE_CLIENT_ID: 'synthetic-browser-client',
    GOOGLE_CLIENT_SECRET: 'synthetic-browser-secret',
  }

  return betterAuth({
    ...authOptions(environment),
    database: prismaAdapter(db, { provider: 'postgresql' }),
    plugins: [nextCookies(), testUtils()],
  })
}

async function waitForApp() {
  const deadline = Date.now() + 90_000

  while (Date.now() < deadline) {
    if (app?.exitCode !== null && app?.exitCode !== undefined) {
      throw new Error(`Trip browser-test server exited early. ${safeOutput()}`)
    }

    try {
      const response = await fetch(`${origin}/api/health`)

      if (response.ok) return
    } catch {
      // The dev server is still starting.
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 500))
  }

  throw new Error(`Trip browser-test server did not become ready. ${safeOutput()}`)
}

async function waitForTripRevision(userId: string, title: string, revision: number) {
  await expect
    .poll(
      async () =>
        (
          await db.trip.findFirst({
            where: { userId, title },
            select: { revision: true },
          })
        )?.revision,
      { timeout: 20_000 },
    )
    .toBe(revision)
}

async function readTripRevision(userId: string, title: string) {
  return (
    await db.trip.findFirst({
      where: { userId, title },
      select: { revision: true },
    })
  )?.revision
}

async function waitForTripRevisionAfter(userId: string, title: string, revision: number) {
  await expect
    .poll(() => readTripRevision(userId, title), { timeout: 20_000 })
    .toBeGreaterThan(revision)
  const savedRevision = await readTripRevision(userId, title)

  if (savedRevision === undefined) throw new Error('The saved trip revision could not be read.')

  return savedRevision
}

function safeOutput() {
  return serverOutput
    .replaceAll(databaseUrl, '[disposable database URL]')
    .replaceAll(testSecret, '[test secret]')
    .replace(/postgres(?:ql)?:\/\/\S+/g, '[database URL]')
}

beforeAll(async () => {
  port = await availablePort()
  origin = `http://127.0.0.1:${port}`

  const fixture = authFixture()
  const context = await fixture.$context
  const user = await context.test.saveUser(
    context.test.createUser({ email, name: 'Synthetic Trip Traveler', emailVerified: true }),
  )
  userId = user.id
  sessionCookies = (await context.test.login({ userId: user.id })).cookies

  app = spawn(
    process.execPath,
    [
      resolve('node_modules/next/dist/bin/next'),
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        TRAILPLAN_INTEGRATION: '1',
        NEXT_TELEMETRY_DISABLED: '1',
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_URL: origin,
        BETTER_AUTH_SECRET: testSecret,
        GOOGLE_CLIENT_ID: 'synthetic-browser-client',
        GOOGLE_CLIENT_SECRET: 'synthetic-browser-secret',
      },
    },
  )
  app.stdout?.on('data', rememberOutput)
  app.stderr?.on('data', rememberOutput)

  await waitForApp()
}, 120_000)

afterAll(async () => {
  await browser?.close()

  if (userId) await db.user.deleteMany({ where: { id: userId } })

  if (app?.pid) {
    try {
      process.kill(-app.pid, 'SIGTERM')
    } catch {
      // The test server may already have stopped after a failed startup.
    }

    await new Promise((resolveStop) => {
      const timeout = setTimeout(resolveStop, 5_000)
      app?.once('exit', () => {
        clearTimeout(timeout)
        resolveStop(undefined)
      })
    })

    if (app.exitCode === null) {
      try {
        process.kill(-app.pid, 'SIGKILL')
      } catch {
        // The process group already exited.
      }
    }
  }

  await db.$disconnect()
}, 30_000)

it('creates, reloads, lists in a second browser context, and deletes an authenticated trip', async () => {
  // Arrange
  browser = await chromium.launch({ headless: true })
  if (!userId) throw new Error('Synthetic browser-test identity was not initialized.')

  const storageState = {
    cookies: sessionCookies.map((cookie) => ({
      ...cookie,
      httpOnly: cookie.httpOnly ?? true,
      secure: cookie.secure ?? false,
      sameSite: cookie.sameSite ?? 'Lax',
      expires: cookie.expires ?? -1,
    })),
    origins: [
      {
        origin,
        localStorage: [{ name: 'trailplan:private:owner', value: userId }],
      },
    ],
  }
  const firstContext = await browser.newContext({ baseURL: origin, storageState })
  const firstPage = await firstContext.newPage()
  const tripTitle = 'Synthetic Lisbon weekend'
  const updatedTitle = `${tripTitle} and Porto`
  const destination = 'Lisbon, Portugal'
  const date = new Date().toISOString().slice(0, 10)

  // Act
  const sessionResponse = await firstContext.request.get(`${origin}/api/auth/get-session`)
  const sessionData = (await sessionResponse.json()) as { user?: { id?: string } } | null
  const sessionConfirmed = Boolean(sessionData?.user?.id)

  await firstPage.goto('/trips', { waitUntil: 'domcontentloaded' })
  const initialHeading = firstPage.getByRole('heading', { name: 'Plan your first trip' })
  const initialEmptyState = await initialHeading.textContent({ timeout: 10_000 }).catch(() => null)
  const initialPath = new URL(firstPage.url()).pathname
  const pageText =
    (await firstPage
      .locator('body')
      .textContent()
      .catch(() => null)) ?? ''

  if (initialPath !== '/trips' || !initialEmptyState) {
    throw new Error(
      `Authenticated empty list did not render (session endpoint ${sessionResponse.status()}, authenticated ${sessionConfirmed}, route ${initialPath}, body ${pageText.slice(0, 400)}).`,
    )
  }

  await firstPage.goto('/trips/new')
  await firstPage.getByLabel('Trip name').fill(tripTitle)
  await firstPage.getByLabel('Destination label').fill(destination)
  await firstPage.getByLabel('First day date').fill(date)
  await firstPage.getByLabel('Day starts at').fill('09:00')
  await firstPage.getByLabel('Day finishes at').fill('18:00')
  await firstPage.getByRole('button', { name: 'Create trip' }).click()
  await firstPage.waitForURL(/\/trips\/[0-9a-f-]+$/)
  const createdUrl = firstPage.url()
  const createdHeading = await firstPage.getByRole('heading', { name: tripTitle }).textContent()
  const createdDestination = await firstPage.getByText(destination).textContent()
  const createdDayStart = await firstPage.getByLabel('Day starts at').inputValue()
  const createdDayFinish = await firstPage.getByLabel('Day finishes at').inputValue()

  await firstPage.getByRole('button', { name: 'Add activity' }).click()
  await firstPage.getByRole('dialog').getByLabel('Name').fill('Museum')
  await firstPage.getByRole('dialog').getByLabel('Duration (minutes)').fill('60')
  await firstPage.getByRole('dialog').getByRole('button', { name: 'Add activity' }).click()
  await firstPage.getByRole('button', { name: 'Add activity' }).click()
  await firstPage.getByRole('dialog').getByLabel('Name').fill('Lunch')
  await firstPage.getByRole('dialog').getByLabel('Duration (minutes)').fill('45')
  await firstPage
    .getByRole('dialog')
    .getByRole('checkbox', { name: 'Set a fixed start time' })
    .check()
  await firstPage.getByRole('dialog').getByLabel('Start time', { exact: true }).fill('12:00')
  await firstPage.getByRole('dialog').getByRole('button', { name: 'Add activity' }).click()
  const moveLunchUp = firstPage.getByRole('button', { name: 'Move Lunch up' })
  await moveLunchUp.focus()
  await moveLunchUp.press('Enter')
  const orderedActivities = await firstPage.locator('ol > li').allTextContents()
  await firstPage.getByLabel('Travel minutes: Lunch to Museum').fill('0')
  await firstPage.getByRole('button', { name: 'Set estimate' }).click()
  let savedRevision = await waitForTripRevisionAfter(userId, tripTitle, 1)
  await firstPage.getByRole('status').filter({ hasText: 'All changes saved' }).waitFor()
  savedRevision = (await readTripRevision(userId, tripTitle)) ?? savedRevision
  const tripName = firstPage.getByLabel('Trip name')
  await tripName.fill(updatedTitle)
  savedRevision = await waitForTripRevisionAfter(userId, updatedTitle, savedRevision)
  await firstPage.getByRole('status').filter({ hasText: 'All changes saved' }).waitFor()
  savedRevision = (await readTripRevision(userId, updatedTitle)) ?? savedRevision
  const tripNameRemainedFocused = await tripName.evaluate(
    (input) => input === document.activeElement,
  )
  await firstPage.reload()
  await firstPage.getByRole('listitem').first().waitFor({ state: 'visible' })
  const museum = firstPage.getByRole('button', { name: 'Edit Museum', exact: true })
  await museum.click()
  const editDialog = firstPage.getByRole('dialog')
  await editDialog.getByLabel('Name').fill('Updated museum')
  await editDialog.getByRole('button', { name: 'Save activity' }).click()
  savedRevision = await waitForTripRevisionAfter(userId, updatedTitle, savedRevision)
  await firstPage.getByRole('status').filter({ hasText: 'All changes saved' }).waitFor()
  savedRevision = (await readTripRevision(userId, updatedTitle)) ?? savedRevision
  const secondDayDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  await firstPage.getByRole('button', { name: 'Add another day' }).click()
  await firstPage.getByLabel('New day date').fill(secondDayDate)
  await firstPage.getByLabel('Starts at', { exact: true }).fill('09:00')
  await firstPage.getByLabel('Finishes at', { exact: true }).fill('18:00')
  await firstPage.getByRole('button', { name: 'Add day', exact: true }).click()
  savedRevision = await waitForTripRevisionAfter(userId, updatedTitle, savedRevision)
  await firstPage.getByRole('status').filter({ hasText: 'All changes saved' }).waitFor()
  savedRevision = (await readTripRevision(userId, updatedTitle)) ?? savedRevision
  const dayTwo = firstPage
    .getByRole('navigation', { name: 'Trip days' })
    .getByRole('button', { name: /Day 2 ·/ })
  const selectedAfterCreatingDay = await dayTwo.getAttribute('aria-pressed')
  expect(selectedAfterCreatingDay).toBe('true')

  await firstPage.getByRole('button', { name: 'Add activity' }).click()
  await firstPage.getByRole('dialog').getByLabel('Name').fill('Second-day stop')
  await firstPage.getByRole('dialog').getByLabel('Duration (minutes)').fill('45')
  await firstPage.getByRole('dialog').getByRole('button', { name: 'Add activity' }).click()
  try {
    savedRevision = await waitForTripRevisionAfter(userId, updatedTitle, savedRevision)
  } catch {
    throw new Error(
      `Second-day activity was not persisted: ${JSON.stringify({
        status: await firstPage.getByRole('status').allTextContents(),
        alerts: await firstPage.getByRole('alert').allTextContents(),
        selectedDay: await dayTwo.getAttribute('aria-pressed'),
        content: await firstPage.locator('main').textContent(),
      })}`,
    )
  }
  await firstPage.getByRole('status').filter({ hasText: 'All changes saved' }).waitFor()
  savedRevision = (await readTripRevision(userId, updatedTitle)) ?? savedRevision
  const selectedAfterCreatingActivity = await dayTwo.getAttribute('aria-pressed')

  await firstPage.getByRole('button', { name: 'Edit Second-day stop', exact: true }).click()
  await firstPage.getByRole('dialog').getByLabel('Name').fill('Edited second-day stop')
  await firstPage.getByRole('dialog').getByRole('button', { name: 'Save activity' }).click()
  savedRevision = await waitForTripRevisionAfter(userId, updatedTitle, savedRevision)
  await firstPage.getByRole('status').filter({ hasText: 'All changes saved' }).waitFor()
  savedRevision = (await readTripRevision(userId, updatedTitle)) ?? savedRevision
  const selectedAfterUpdatingActivity = await dayTwo.getAttribute('aria-pressed')

  await firstPage
    .getByRole('button', { name: 'Delete Edited second-day stop', exact: true })
    .click()
  await firstPage
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete', exact: true })
    .click()
  savedRevision = await waitForTripRevisionAfter(userId, updatedTitle, savedRevision)
  await firstPage.getByRole('status').filter({ hasText: 'All changes saved' }).waitFor()
  const selectedAfterDeletingActivity = await dayTwo.getAttribute('aria-pressed')
  const dayDate = firstPage.getByLabel('Day date', { exact: true })
  await dayDate.fill('')
  await firstPage.getByText('Enter a valid day date.').waitFor()
  const dayDateBox = await dayDate.boundingBox()
  const deleteDayBox = await firstPage.getByRole('button', { name: 'Delete day' }).boundingBox()
  if (!dayDateBox || !deleteDayBox) throw new Error('Day date or delete button is not visible.')
  const deleteDayVerticalOffset = Math.abs(deleteDayBox.y - dayDateBox.y)
  const invalidDayDateMessage = firstPage.getByText('Enter a valid day date.')
  await dayDate.fill(secondDayDate)
  await invalidDayDateMessage.waitFor({ state: 'hidden' })
  await firstPage.getByRole('status').filter({ hasText: 'All changes saved' }).waitFor()

  await firstPage.reload()
  await firstPage.getByRole('listitem').first().waitFor({ state: 'visible' })
  const persistedActivities = await firstPage.locator('ol > li').allTextContents()
  await firstPage.setViewportSize({ width: 360, height: 800 })
  const mobileWidth = await firstPage.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))

  await firstPage.reload()
  const reloadedHeading = await firstPage.getByRole('heading', { name: updatedTitle }).textContent()

  const secondContext = await browser.newContext({ baseURL: origin, storageState })
  const secondPage = await secondContext.newPage()
  await secondPage.goto('/trips')
  const listedHeading = await secondPage.getByRole('heading', { name: updatedTitle }).textContent()
  const listedTripDescription = await secondPage.getByText(destination).textContent()
  await secondPage.goto(new URL(createdUrl).pathname)
  await secondPage.reload()
  const secondContextUrl = secondPage.url()
  const secondContextHeading = await secondPage
    .getByRole('heading', { name: updatedTitle })
    .textContent()

  await secondPage.goto('/trips')
  const deleteButton = secondPage.getByRole('button', { name: `Delete ${updatedTitle}` })
  await deleteButton.focus()
  await deleteButton.press('Enter')
  const confirmationVisible = await secondPage.getByRole('alertdialog').isVisible()
  await secondPage.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).press('Enter')
  await secondPage.waitForURL(`${origin}/trips`)
  const deletedEmptyState = await secondPage
    .getByRole('heading', { name: 'Plan your first trip' })
    .textContent()

  // Assert
  expect(initialEmptyState).toBe('Plan your first trip')
  expect(createdUrl).toMatch(/\/trips\/[0-9a-f-]+$/)
  expect(createdHeading).toBe(tripTitle)
  expect(createdDestination).toBe(destination)
  expect(createdDayStart).toBe('09:00')
  expect(createdDayFinish).toBe('18:00')
  expect(tripNameRemainedFocused).toBe(true)
  expect(selectedAfterCreatingActivity).toBe('true')
  expect(selectedAfterUpdatingActivity).toBe('true')
  expect(selectedAfterDeletingActivity).toBe('true')
  expect(deleteDayVerticalOffset).toBeLessThanOrEqual(4)
  expect(orderedActivities[0]).toContain('Lunch')
  expect(orderedActivities[1]).toContain('Museum')
  expect(persistedActivities[0]).toContain('Lunch')
  expect(persistedActivities[1]).toContain('Updated museum')
  expect(mobileWidth.content).toBeLessThanOrEqual(mobileWidth.viewport)
  expect(reloadedHeading).toBe(updatedTitle)
  expect(listedHeading).toBe(updatedTitle)
  expect(listedTripDescription).toContain(destination)
  expect(secondContextUrl).toBe(createdUrl)
  expect(secondContextHeading).toBe(updatedTitle)
  expect(confirmationVisible).toBe(true)
  expect(deletedEmptyState).toBe('Plan your first trip')

  await firstContext.close()
  await secondContext.close()
}, 120_000)

it('restores a same-revision draft after reload and keeps a stale draft from overwriting newer data', async () => {
  // Arrange
  if (!browser) browser = await chromium.launch({ headless: true })
  if (!userId) throw new Error('Synthetic browser-test identity was not initialized.')
  const storageState = {
    cookies: sessionCookies.map((cookie) => ({
      ...cookie,
      httpOnly: cookie.httpOnly ?? true,
      secure: cookie.secure ?? false,
      sameSite: cookie.sameSite ?? 'Lax',
      expires: cookie.expires ?? -1,
    })),
    origins: [
      {
        origin,
        localStorage: [{ name: 'trailplan:private:owner', value: userId }],
      },
    ],
  }
  const context = await browser.newContext({ baseURL: origin, storageState })
  const page = await context.newPage()
  const initialTitle = `Synthetic recovery ${randomUUID()}`
  const restoredTitle = `${initialTitle} restored`
  const staleTitle = `${initialTitle} local stale`
  const serverTitle = `${initialTitle} latest server version`
  const date = new Date().toISOString().slice(0, 10)
  const recoveryKey = `trailplan:private:${userId}:`

  // Act
  await page.goto('/trips/new')
  await page.getByLabel('Trip name').fill(initialTitle)
  await page.getByLabel('Destination label').fill('Synthetic recovery destination')
  await page.getByLabel('First day date').fill(date)
  await page.getByLabel('Day starts at').fill('09:00')
  await page.getByLabel('Day finishes at').fill('18:00')
  await page.getByRole('button', { name: 'Create trip' }).click()
  await page.waitForURL(/\/trips\/[0-9a-f-]+$/)
  const tripId = new URL(page.url()).pathname.split('/').at(-1)
  if (!tripId) throw new Error('The recovery journey did not create a trip ID.')
  const tripRecoveryKey = `${recoveryKey}${tripId}:draft`

  await page.getByLabel('Trip name').fill(restoredTitle)
  await page.waitForFunction(
    ({ key, title }) => {
      const serialized = localStorage.getItem(key)
      return serialized ? JSON.parse(serialized).draft.title === title : false
    },
    { key: tripRecoveryKey, title: restoredTitle },
  )
  await page.reload()
  await page.getByRole('button', { name: 'Restore draft' }).click()
  await waitForTripRevision(userId, restoredTitle, 2)
  await page.getByRole('status').filter({ hasText: 'All changes saved' }).waitFor()

  await page.getByLabel('Trip name').fill(staleTitle)
  await page.getByLabel('Destination label').fill('')
  await page.waitForFunction(
    ({ key, title }) => {
      const serialized = localStorage.getItem(key)
      if (!serialized) return false

      const record = JSON.parse(serialized)
      return record.draft.title === title && record.baseRevision === 2
    },
    { key: tripRecoveryKey, title: staleTitle },
  )
  await db.trip.updateMany({
    where: { id: tripId, userId },
    data: { title: serverTitle, revision: { increment: 1 } },
  })
  await page.reload()
  await page.getByRole('button', { name: 'Keep editing locally' }).click()
  const keptLocalTitle = await page.getByLabel('Trip name').inputValue()
  await page.waitForTimeout(750)
  const tripBeforeDiscard = await db.trip.findFirstOrThrow({
    where: { id: tripId, userId },
    select: { title: true, revision: true },
  })
  await page.getByRole('button', { name: 'Discard local changes' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Discard and reload latest' })
    .click()
  const latestHeading = await page.getByRole('heading', { name: serverTitle }).textContent()
  const tripAfterDiscard = await db.trip.findFirstOrThrow({
    where: { id: tripId, userId },
    select: { title: true, revision: true },
  })
  const recoveryAfterDiscard = await page.evaluate(
    (key) => localStorage.getItem(key),
    tripRecoveryKey,
  )
  await db.trip.deleteMany({ where: { id: tripId, userId } })
  await context.close()

  // Assert
  expect(keptLocalTitle).toBe(staleTitle)
  expect(tripBeforeDiscard).toEqual({ title: serverTitle, revision: 3 })
  expect(latestHeading).toBe(serverTitle)
  expect(tripAfterDiscard).toEqual(tripBeforeDiscard)
  expect(recoveryAfterDiscard).toBeNull()
}, 120_000)

it('edits the public sample, confirms reset, preserves sign-in return data, and saves one owned copy', async () => {
  // Arrange
  if (!browser) browser = await chromium.launch({ headless: true })
  if (!userId) throw new Error('Synthetic browser-test identity was not initialized.')
  const context = await browser.newContext({ baseURL: origin })
  const page = await context.newPage()
  const title = `Sample copy ${randomUUID()}`

  // Act
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Reset sample' }).waitFor()
  await page.setViewportSize({ width: 1280, height: 800 })
  const desktopViewsVisible = {
    list: await page.getByRole('tabpanel', { name: 'List' }).isVisible(),
    timeline: await page.getByRole('tabpanel', { name: 'Timeline' }).isVisible(),
  }
  await page.setViewportSize({ width: 768, height: 800 })
  const compactViewsVisible = {
    list: await page.getByRole('tabpanel', { name: 'List' }).isVisible(),
    timeline: await page.getByRole('tabpanel', { name: 'Timeline' }).isVisible(),
  }
  await page.setViewportSize({ width: 360, height: 800 })
  const sampleMobileWidth = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  const listTab = page.getByRole('tab', { name: 'List' })
  const timelineTab = page.getByRole('tab', { name: 'Timeline' })
  await listTab.focus()
  await page.keyboard.press('ArrowRight')
  const keyboardSelectedTimeline = await timelineTab.getAttribute('aria-selected')
  const mobileTimelineVisible = await page.getByRole('tabpanel', { name: 'Timeline' }).isVisible()
  const mobileListHidden = !(await page.getByRole('tabpanel', { name: 'List' }).isVisible())
  await page
    .getByRole('tabpanel', { name: 'Timeline' })
    .getByRole('button', { name: /Edit Lunch.*booked 12:00/ })
    .click()
  const timelineEditValue = await page.getByRole('dialog').getByLabel('Name').inputValue()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await listTab.click()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page
    .getByText('Booked 12:00 · projected arrival 12:05 · 5 min late', { exact: true })
    .waitFor()
  await page.getByLabel('Trip name').fill('Temporary sample change')
  await page.getByRole('button', { name: 'Reset sample' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reset sample' }).click()
  await page.waitForFunction(
    () => (document.querySelector('#trip-title') as HTMLInputElement)?.value === 'A day in Porto',
  )
  const resetTitle = await page.getByLabel('Trip name').inputValue()
  await page.getByLabel('Trip name').fill(title)
  const sampleTripCountBeforeCopy = await db.trip.count({ where: { userId } })
  await page.getByRole('button', { name: 'Save a copy' }).click()
  await page.waitForURL(/\/sign-in\?returnTo=%2Fdemo/)
  const signInBackHref = await page.getByRole('link', { name: 'TrailPlan' }).getAttribute('href')
  await context.addCookies(
    sessionCookies.map((cookie) => ({
      ...cookie,
      httpOnly: cookie.httpOnly ?? true,
      secure: cookie.secure ?? false,
      sameSite: cookie.sameSite ?? 'Lax',
      expires: cookie.expires ?? -1,
    })),
  )
  await page.getByRole('link', { name: 'TrailPlan' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('heading', { name: 'Save a copy to your trips?' })
    .waitFor()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save copy' }).click()
  await page.waitForURL(/\/trips\/[0-9a-f-]+$/)
  const tripId = new URL(page.url()).pathname.split('/').at(-1)
  const stored = await db.trip.findFirstOrThrow({
    where: { id: tripId, userId },
    select: {
      title: true,
      destination: true,
      days: {
        select: {
          activities: { select: { title: true, fixedStartMinute: true } },
          travelEstimates: { select: { minutes: true } },
        },
      },
    },
  })

  // Assert
  expect(resetTitle).toBe('A day in Porto')
  expect(signInBackHref).toBe('/demo')
  expect(stored.title).toBe(title)
  expect(sampleTripCountBeforeCopy).toBe(0)
  expect(desktopViewsVisible).toEqual({ list: true, timeline: true })
  expect(compactViewsVisible).toEqual({ list: true, timeline: true })
  expect(sampleMobileWidth.content).toBeLessThanOrEqual(sampleMobileWidth.viewport)
  expect(keyboardSelectedTimeline).toBe('true')
  expect(mobileTimelineVisible).toBe(true)
  expect(mobileListHidden).toBe(true)
  expect(timelineEditValue).toBe('Lunch')
  expect(stored.destination).toBe('Porto, Portugal')
  expect(stored.days[0]?.activities).toHaveLength(6)
  expect(
    stored.days[0]?.activities.find((activity) => activity.title === 'Lunch')?.fixedStartMinute,
  ).toBe(720)
  expect(stored.days[0]?.travelEstimates).toHaveLength(4)
  await context.close()
}, 120_000)
