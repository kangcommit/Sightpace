import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), createSampleCopy: vi.fn() }))
vi.mock('@/lib/session', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/trip-transactions', () => ({ createSampleCopy: mocks.createSampleCopy }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { createSampleCopyAction } from '@/features/trips/server/create-sample-copy-action'

beforeEach(() => vi.resetAllMocks())

it('rejects unauthenticated requests before reaching storage', async () => {
  // Arrange
  mocks.requireUser.mockResolvedValue({ ok: false })

  // Act
  const result = await createSampleCopyAction({})

  // Assert
  expect(result).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' })
  expect(mocks.createSampleCopy).not.toHaveBeenCalled()
})

it('rejects unexpected snapshot fields before reaching storage', async () => {
  // Arrange
  mocks.requireUser.mockResolvedValue({ ok: true, data: { id: 'verified-owner' } })

  // Act
  const result = await createSampleCopyAction({
    mutationId: crypto.randomUUID(),
    ownerId: 'attacker',
    snapshot: {},
  })

  // Assert
  expect(result).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' })
  expect(mocks.createSampleCopy).not.toHaveBeenCalled()
})
