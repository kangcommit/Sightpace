import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Prisma, PrismaClient } from '@/generated/prisma/client'

const uuid = z.uuid()

const label = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim() === value && value.length > 0)

const minute = (minimum: number, maximum: number) => z.int().min(minimum).max(maximum)

const date = z.iso.date().refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`)

  return (
    value.slice(0, 4) !== '0000' &&
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  )
})

const activity = z.strictObject({
  id: uuid,
  title: label(120),
  placeLabel: label(200).nullable(),
  durationMinutes: minute(1, 1439),
  fixedStartMinute: minute(0, 1439).nullable(),
})

const travel = z.strictObject({
  fromActivityId: uuid,
  toActivityId: uuid,
  minutes: minute(0, 1439),
})

const day = z.strictObject({
  id: uuid,
  date,
  startMinute: minute(0, 1438),
  finishMinute: minute(1, 1439),
  activities: z.array(activity).max(100),
  travelEstimates: z.array(travel).max(1000),
})

const snapshot = z
  .strictObject({
    title: label(120),
    destination: label(120),
    days: z.array(day).max(30),
  })
  .superRefine((value, context) => {
    const dayIds = new Set<string>()
    const dates = new Set<string>()
    const activityIds = new Set<string>()

    for (const [dayIndex, current] of value.days.entries()) {
      if (
        dayIds.has(current.id) ||
        dates.has(current.date) ||
        current.startMinute >= current.finishMinute
      ) {
        context.addIssue({ code: 'custom', path: ['days', dayIndex], message: 'Invalid day.' })
      }

      dayIds.add(current.id)
      dates.add(current.date)

      const local = new Set<string>()
      const pairs = new Set<string>()

      for (const item of current.activities) {
        if (activityIds.has(item.id)) {
          context.addIssue({
            code: 'custom',
            path: ['days', dayIndex],
            message: 'Duplicate activity.',
          })
        }

        activityIds.add(item.id)
        local.add(item.id)
      }

      for (const estimate of current.travelEstimates) {
        const key = `${estimate.fromActivityId}:${estimate.toActivityId}`
        if (
          estimate.fromActivityId === estimate.toActivityId ||
          !local.has(estimate.fromActivityId) ||
          !local.has(estimate.toActivityId) ||
          pairs.has(key)
        ) {
          context.addIssue({
            code: 'custom',
            path: ['days', dayIndex],
            message: 'Invalid travel pair.',
          })
        }

        pairs.add(key)
      }
    }
  })

const createInput = z
  .strictObject({
    mutationId: uuid,
    title: label(120),
    destination: label(120),
    days: z
      .array(
        z
          .strictObject({
            date,
            startMinute: minute(0, 1438),
            finishMinute: minute(1, 1439),
          })
          .refine((value) => value.startMinute < value.finishMinute),
      )
      .min(1)
      .max(30),
  })
  .superRefine((value, context) => {
    const dates = new Set<string>()

    for (const [dayIndex, current] of value.days.entries()) {
      if (dates.has(current.date))
        context.addIssue({ code: 'custom', path: ['days', dayIndex], message: 'Invalid day.' })

      dates.add(current.date)
    }
  })

const saveInput = z.strictObject({
  mutationId: uuid,
  tripId: uuid,
  expectedRevision: z.int().positive(),
  snapshot,
})

const deleteInput = z.strictObject({
  mutationId: uuid,
  tripId: uuid,
  expectedRevision: z.int().positive(),
})

type Snapshot = z.infer<typeof snapshot>

type Code =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'TEMPORARILY_UNAVAILABLE'

type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false
      error: { code: Code; message: string; latestRevision?: number; requestId?: string }
    }

class StorageFailure extends Error {
  constructor(
    readonly code: Code,
    readonly latestRevision?: number,
  ) {
    super(code)
  }
}

function invalid(): never {
  throw new StorageFailure('VALIDATION_ERROR')
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  let size: number
  try {
    size = Buffer.byteLength(JSON.stringify(input))
  } catch {
    return invalid()
  }

  if (size > 1024 * 1024) return invalid()

  const result = schema.safeParse(input)

  if (!result.success) return invalid()

  return result.data
}

function digest(operation: string, input: unknown) {
  return createHash('sha256').update(JSON.stringify({ operation, input })).digest('hex')
}

async function run<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await work() }
  } catch (error) {
    if (error instanceof StorageFailure) {
      const messages: Record<Code, string> = {
        VALIDATION_ERROR: 'Check the trip details and try again.',
        UNAUTHENTICATED: 'Sign in to continue.',
        NOT_FOUND: 'Trip not found.',
        CONFLICT: 'This trip changed. Reload it before saving.',
        IDEMPOTENCY_CONFLICT: 'This request was already used for another change.',
        TEMPORARILY_UNAVAILABLE: 'Saving is unavailable. Please try again.',
      }

      return {
        ok: false,
        error: {
          code: error.code,
          message: messages[error.code],
          ...(error.latestRevision ? { latestRevision: error.latestRevision } : {}),
        },
      }
    }

    const requestId = randomUUID()
    console.error('Trip storage unavailable', { requestId })
    return {
      ok: false,
      error: {
        code: 'TEMPORARILY_UNAVAILABLE',
        message: 'Saving is unavailable. Please try again.',
        requestId,
      },
    }
  }
}

async function lockOwner(tx: Prisma.TransactionClient, ownerId: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "user" WHERE id = ${ownerId} FOR UPDATE`

  if (rows.length !== 1) throw new StorageFailure('UNAUTHENTICATED')
}

async function replay(
  tx: Prisma.TransactionClient,
  ownerId: string,
  mutationId: string,
  operation: 'CREATE_TRIP' | 'SAVE_TRIP' | 'DELETE_TRIP',
  tripId: string,
  payloadHash: string,
) {
  const receipt = await tx.mutationReceipt.findUnique({
    where: { userId_mutationId: { userId: ownerId, mutationId } },
  })

  if (!receipt) return null

  if (
    receipt.operation !== operation ||
    receipt.targetTripId !== tripId ||
    receipt.payloadHash !== payloadHash
  ) {
    throw new StorageFailure('IDEMPOTENCY_CONFLICT')
  }

  return receipt
}

async function replayCreation(
  tx: Prisma.TransactionClient,
  ownerId: string,
  mutationId: string,
  payloadHash: string,
) {
  const receipt = await tx.mutationReceipt.findUnique({
    where: { userId_mutationId: { userId: ownerId, mutationId } },
  })

  if (!receipt) return null

  if (receipt.operation !== 'CREATE_TRIP' || receipt.payloadHash !== payloadHash)
    throw new StorageFailure('IDEMPOTENCY_CONFLICT')

  return receipt
}

async function writeDays(tx: Prisma.TransactionClient, tripId: string, value: Snapshot) {
  for (const current of value.days) {
    await tx.day.create({
      data: {
        id: current.id,
        tripId,
        date: new Date(`${current.date}T00:00:00.000Z`),
        startMinute: current.startMinute,
        finishMinute: current.finishMinute,
      },
    })

    if (current.activities.length) {
      await tx.activity.createMany({
        data: current.activities.map((item, position) => ({
          ...item,
          dayId: current.id,
          position,
        })),
      })
    }

    if (current.travelEstimates.length) {
      await tx.travelEstimate.createMany({
        data: current.travelEstimates.map((estimate) => ({ ...estimate, dayId: current.id })),
      })
    }
  }
}

async function assertOwnedIds(tx: Prisma.TransactionClient, tripId: string, value: Snapshot) {
  const dayIds = value.days.map((item) => item.id)
  const activityDay = new Map(
    value.days.flatMap((item) =>
      item.activities.map((activity) => [activity.id, item.id] as const),
    ),
  )

  const existingDays = await tx.day.findMany({
    where: { id: { in: dayIds } },
    select: { id: true, tripId: true },
  })
  const existingActivities = await tx.activity.findMany({
    where: { id: { in: [...activityDay.keys()] } },
    select: { id: true, dayId: true, day: { select: { tripId: true } } },
  })

  if (existingDays.some((item) => item.tripId !== tripId)) return invalid()

  if (
    existingActivities.some(
      (item) => item.day.tripId !== tripId || activityDay.get(item.id) !== item.dayId,
    )
  )
    return invalid()
}

/** Internal storage boundary. Callers must supply a server-verified user ID; never expose this as a client action. */
export function createTrip(db: PrismaClient, ownerId: string, input: unknown) {
  return run(async () => {
    const value = parse(createInput, input)
    const payloadHash = digest('CREATE_TRIP', value)

    return db.$transaction(async (tx) => {
      await lockOwner(tx, ownerId)

      const prior = await replayCreation(tx, ownerId, value.mutationId, payloadHash)

      if (prior) return { tripId: prior.targetTripId, revision: prior.resultRevision as number }

      const trip = await tx.trip.create({
        data: {
          userId: ownerId,
          title: value.title,
          destination: value.destination,
          days: {
            create: value.days.map((current) => ({
              date: new Date(`${current.date}T00:00:00.000Z`),
              startMinute: current.startMinute,
              finishMinute: current.finishMinute,
            })),
          },
        },
        select: { id: true },
      })
      await tx.mutationReceipt.create({
        data: {
          userId: ownerId,
          mutationId: value.mutationId,
          operation: 'CREATE_TRIP',
          targetTripId: trip.id,
          payloadHash,
          resultKind: 'CREATED',
          resultRevision: 1,
        },
      })

      return { tripId: trip.id, revision: 1 }
    })
  })
}

export function saveTrip(db: PrismaClient, ownerId: string, input: unknown) {
  return run(async () => {
    const value = parse(saveInput, input)
    const payloadHash = digest('SAVE_TRIP', value)

    return db.$transaction(async (tx) => {
      await lockOwner(tx, ownerId)

      const prior = await replay(
        tx,
        ownerId,
        value.mutationId,
        'SAVE_TRIP',
        value.tripId,
        payloadHash,
      )

      if (prior) return { tripId: prior.targetTripId, revision: prior.resultRevision as number }

      const current = await tx.trip.findFirst({
        where: { id: value.tripId, userId: ownerId },
        select: { revision: true },
      })

      if (!current) throw new StorageFailure('NOT_FOUND')

      if (current.revision !== value.expectedRevision)
        throw new StorageFailure('CONFLICT', current.revision)

      await assertOwnedIds(tx, value.tripId, value.snapshot)

      const updated = await tx.trip.updateMany({
        where: { id: value.tripId, userId: ownerId, revision: value.expectedRevision },
        data: {
          title: value.snapshot.title,
          destination: value.snapshot.destination,
          revision: { increment: 1 },
        },
      })

      if (updated.count !== 1) throw new StorageFailure('CONFLICT')

      await tx.day.deleteMany({ where: { tripId: value.tripId } })
      await writeDays(tx, value.tripId, value.snapshot)

      const revision = value.expectedRevision + 1
      await tx.mutationReceipt.create({
        data: {
          userId: ownerId,
          mutationId: value.mutationId,
          operation: 'SAVE_TRIP',
          targetTripId: value.tripId,
          payloadHash,
          resultKind: 'SAVED',
          resultRevision: revision,
        },
      })

      return { tripId: value.tripId, revision }
    })
  })
}

export function deleteTrip(db: PrismaClient, ownerId: string, input: unknown) {
  return run(async () => {
    const value = parse(deleteInput, input)
    const payloadHash = digest('DELETE_TRIP', value)

    return db.$transaction(async (tx) => {
      await lockOwner(tx, ownerId)

      const prior = await replay(
        tx,
        ownerId,
        value.mutationId,
        'DELETE_TRIP',
        value.tripId,
        payloadHash,
      )

      if (prior) return { tripId: prior.targetTripId, deleted: true as const }

      const current = await tx.trip.findFirst({
        where: { id: value.tripId, userId: ownerId },
        select: { revision: true },
      })

      if (!current) throw new StorageFailure('NOT_FOUND')

      if (current.revision !== value.expectedRevision)
        throw new StorageFailure('CONFLICT', current.revision)

      const deleted = await tx.trip.deleteMany({
        where: { id: value.tripId, userId: ownerId, revision: value.expectedRevision },
      })

      if (deleted.count !== 1) throw new StorageFailure('CONFLICT')

      await tx.mutationReceipt.create({
        data: {
          userId: ownerId,
          mutationId: value.mutationId,
          operation: 'DELETE_TRIP',
          targetTripId: value.tripId,
          payloadHash,
          resultKind: 'DELETED',
          resultRevision: null,
        },
      })

      return { tripId: value.tripId, deleted: true as const }
    })
  })
}
