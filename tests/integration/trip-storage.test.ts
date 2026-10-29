import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, expect, inject, it, vi } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { createSampleCopy, createTrip, deleteTrip, saveTrip } from '@/lib/trip-transactions'

const url = inject('databaseUrl')
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: [] })
const sql = new Pool({ connectionString: url })
type TripQueries = typeof import('@/features/trips/server/queries')
let getTrip: TripQueries['getTrip']
let listTrips: TripQueries['listTrips']
const ownerA = 'storage-owner-a'
const ownerB = 'storage-owner-b'
let tripId: string
let dayId: string
let firstId: string
let secondId: string

beforeAll(async () => {
  // The app's default Prisma client validates DATABASE_URL during module initialization.
  // Set it to the disposable fixture before importing the query module; CI has no .env.
  vi.stubEnv('DATABASE_URL', url)
  ;({ getTrip, listTrips } = await import('@/features/trips/server/queries'))

  await db.user.createMany({
    data: [
      { id: ownerA, name: 'Synthetic A', email: 'storage-a@example.test' },
      { id: ownerB, name: 'Synthetic B', email: 'storage-b@example.test' },
    ],
  })
})

beforeEach(async () => {
  await db.mutationReceipt.deleteMany()
  await db.trip.deleteMany()
  tripId = randomUUID()
  dayId = randomUUID()
  firstId = randomUUID()
  secondId = randomUUID()

  await db.trip.create({
    data: {
      id: tripId,
      userId: ownerA,
      title: 'Synthetic trip',
      destination: 'Example city',
      days: {
        create: {
          id: dayId,
          date: new Date('2026-10-25T00:00:00.000Z'),
          startMinute: 540,
          finishMinute: 1080,
          activities: {
            create: [
              { id: firstId, title: 'Museum', durationMinutes: 60, position: 0 },
              {
                id: secondId,
                title: 'Lunch',
                durationMinutes: 45,
                fixedStartMinute: 720,
                position: 1,
              },
            ],
          },
        },
      },
    },
  })
})

afterAll(async () => {
  await db.$disconnect()
  await sql.end()
  vi.unstubAllEnvs()
})

function receipt(mutationId = randomUUID()) {
  return {
    userId: ownerA,
    mutationId,
    operation: 'SAVE_TRIP' as const,
    targetTripId: tripId,
    payloadHash: 'a'.repeat(64),
    resultKind: 'SAVED' as const,
    resultRevision: 2,
  }
}

function captureError<T>(operation: Promise<T>) {
  return operation.then(
    () => undefined,
    (error: unknown) => error,
  )
}

it('lists and reads only the verified owner’s trip snapshot', async () => {
  // Arrange
  const foreignTrip = randomUUID()
  await db.trip.create({
    data: { id: foreignTrip, userId: ownerB, title: 'Private B', destination: 'Other city' },
  })

  // Act
  const ownerList = await listTrips(ownerA, undefined, db)
  const foreignList = await listTrips(ownerB, undefined, db)
  const ownedRead = await getTrip(ownerA, tripId, db)
  const foreignRead = await getTrip(ownerA, foreignTrip, db)
  const missingRead = await getTrip(ownerA, randomUUID(), db)

  // Assert
  expect(ownerList).toMatchObject({
    ok: true,
    data: { items: [{ id: tripId }], page: 1, pageSize: 20, totalPages: 1 },
  })
  expect(foreignList).toMatchObject({
    ok: true,
    data: {
      items: [{ id: foreignTrip, startDate: null, endDate: null }],
      page: 1,
      pageSize: 20,
      totalPages: 1,
    },
  })
  expect(ownedRead).toMatchObject({
    ok: true,
    data: {
      id: tripId,
      revision: 1,
      days: [
        {
          date: '2026-10-25',
          startMinute: 540,
          finishMinute: 1080,
          activities: [{ id: firstId }, { id: secondId }],
        },
      ],
    },
  })
  expect(foreignRead).toEqual({ ok: true, data: null })
  expect(missingRead).toEqual({ ok: true, data: null })
})

it('generates activity IDs from the Prisma schema default', async () => {
  // Arrange
  const expectedId = expect.stringMatching(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  )

  // Act
  const activity = await db.activity.create({
    data: { dayId, title: 'New stop', durationMinutes: 30, position: 2 },
    select: { id: true },
  })

  // Assert
  expect(activity.id).toEqual(expectedId)
})

it('creates trips when an owner already has more than fifty', async () => {
  // Arrange
  await db.trip.createMany({
    data: Array.from({ length: 50 }, (_, index) => ({
      id: randomUUID(),
      userId: ownerA,
      title: `Existing trip ${index}`,
      destination: 'Example city',
    })),
  })
  const input = {
    mutationId: randomUUID(),
    title: 'Additional trip',
    destination: 'Example city',
    days: [{ date: '2026-10-26', startMinute: 540, finishMinute: 1080 }],
  }

  // Act
  const created = await createTrip(db, ownerA, input)
  const tripCount = await db.trip.count({ where: { userId: ownerA } })

  // Assert
  expect(created).toMatchObject({ ok: true, data: { revision: 1 } })
  expect(tripCount).toBe(52)
})

it('paginates the owner’s list with validated page numbers', async () => {
  // Arrange
  await db.trip.createMany({
    data: Array.from({ length: 20 }, (_, index) => ({
      id: randomUUID(),
      userId: ownerA,
      title: `Extra trip ${index}`,
      destination: 'Example city',
    })),
  })

  // Act
  const first = await listTrips(ownerA, undefined, db)
  const second = await listTrips(ownerA, '2', db)
  const malformed = await listTrips(ownerA, 'not-a-page', db)
  const outOfRange = await listTrips(ownerA, '99', db)

  // Assert
  expect(first).toMatchObject({
    ok: true,
    data: { items: expect.any(Array), page: 1, pageSize: 20, totalPages: 2 },
  })
  expect(first.ok && first.data.items).toHaveLength(20)
  expect(second).toMatchObject({ ok: true, data: { items: expect.any(Array), page: 2 } })
  expect(second.ok && second.data.items).toHaveLength(1)
  expect(malformed).toEqual({ ok: false, error: 'VALIDATION_ERROR' })
  expect(outOfRange).toMatchObject({ ok: true, data: { page: 2, totalPages: 2 } })
  if (first.ok && second.ok)
    expect(new Set([...first.data.items, ...second.data.items].map((trip) => trip.id)).size).toBe(
      21,
    )
})

it('round-trips date-only input, defaults, nullable booking/place and UTC audit instants', async () => {
  // Arrange
  const expectedDate = '2026-10-25'

  // Act
  const trip = await db.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: { days: { include: { activities: { orderBy: { position: 'asc' } } } } },
  })
  const connection = await sql.connect()
  let storedDate = ''

  try {
    await connection.query("SET TIME ZONE 'Pacific/Honolulu'")
    const result = await connection.query('SELECT date::text AS date FROM day WHERE id = $1', [
      dayId,
    ])
    storedDate = result.rows[0].date
  } finally {
    connection.release()
  }

  // Assert
  expect(trip.revision).toBe(1)
  expect(trip.createdAt).toBeInstanceOf(Date)
  expect(trip.days[0].date.toISOString()).toBe(`${expectedDate}T00:00:00.000Z`)
  expect(trip.days[0].activities[0]).toMatchObject({ placeLabel: null, fixedStartMinute: null })
  expect(storedDate).toBe(expectedDate)
})

it.each([
  ['trip', 'title', '', 'trip_title_check'],
  ['trip', 'title', 'x'.repeat(121), 'trip_title_check'],
  ['trip', 'title', ' padded', 'trip_title_check'],
  ['trip', 'destination', '\t', 'trip_destination_check'],
  ['trip', 'destination', 'x'.repeat(121), 'trip_destination_check'],
  ['trip', 'revision', 0, 'trip_revision_check'],
  ['day', 'startMinute', -1, 'day_minutes_check'],
  ['day', 'startMinute', 1080, 'day_minutes_check'],
  ['day', 'finishMinute', 1440, 'day_minutes_check'],
  ['day', 'finishMinute', 540, 'day_minutes_check'],
  ['day', 'date', 'infinity', 'day_date_check'],
  ['activity', 'title', '', 'activity_title_check'],
  ['activity', 'placeLabel', '', 'activity_place_check'],
  ['activity', 'placeLabel', 'x'.repeat(201), 'activity_place_check'],
  ['activity', 'durationMinutes', 0, 'activity_duration_check'],
  ['activity', 'durationMinutes', 1440, 'activity_duration_check'],
  ['activity', 'fixedStartMinute', -1, 'activity_booking_check'],
  ['activity', 'fixedStartMinute', 1440, 'activity_booking_check'],
  ['activity', 'position', -1, 'activity_position_check'],
])(
  'rejects invalid %s.%s at the database boundary (%s)',
  async (table, field, value, constraint) => {
    // Arrange
    // Identifiers come only from the static cases above; values are parameterized.
    const id = table === 'trip' ? tripId : table === 'day' ? dayId : firstId

    // Act
    let error: unknown
    try {
      await sql.query(`UPDATE "${table}" SET "${field}" = $1 WHERE id = $2`, [value, id])
    } catch (caught) {
      error = caught
    }

    // Assert
    expect(error).toMatchObject({ code: '23514', constraint })
  },
)

it('rejects malformed dates, fractional integer input and invalid UUIDs', async () => {
  // Arrange
  const invalidQueries = [
    () => sql.query('UPDATE day SET date = $1 WHERE id = $2', ['2026-02-30', dayId]),
    () => sql.query('UPDATE activity SET "durationMinutes" = $1 WHERE id = $2', ['1.5', firstId]),
    () => sql.query('UPDATE trip SET id = $1 WHERE id = $2', ['not-a-uuid', tripId]),
  ]

  // Act
  const errors = await Promise.all(
    invalidQueries.map((query) =>
      query().then(
        () => undefined,
        (error: unknown) => error,
      ),
    ),
  )

  // Assert
  expect(errors[0]).toMatchObject({ code: '22008' })
  expect(errors[1]).toMatchObject({ code: '22P02' })
  expect(errors[2]).toMatchObject({ code: '22P02' })
})

it('accepts inclusive minute bounds, long labels and overloaded days without derived columns', async () => {
  // Arrange
  const expectedActivityCount = 2

  // Act
  await db.day.update({ where: { id: dayId }, data: { startMinute: 0, finishMinute: 1439 } })
  await db.activity.update({
    where: { id: firstId },
    data: {
      title: 'x'.repeat(120),
      placeLabel: 'x'.repeat(200),
      durationMinutes: 1439,
      fixedStartMinute: 0,
    },
  })
  await db.activity.update({
    where: { id: secondId },
    data: { durationMinutes: 1, fixedStartMinute: 1439 },
  })
  await db.travelEstimate.create({
    data: { dayId, fromActivityId: firstId, toActivityId: secondId, minutes: 1439 },
  })

  // Assert
  expect(await db.activity.count({ where: { dayId } })).toBe(expectedActivityCount)
})

it('enforces unique dates and positions, and preserves travel through a transactional reorder', async () => {
  // Arrange
  await db.travelEstimate.create({
    data: { dayId, fromActivityId: firstId, toActivityId: secondId, minutes: 0 },
  })

  // Act
  const duplicateDateError = await db.day
    .create({
      data: {
        id: randomUUID(),
        tripId,
        date: new Date('2026-10-25'),
        startMinute: 0,
        finishMinute: 1,
      },
    })
    .then(
      () => undefined,
      (error: unknown) => error,
    )
  const duplicatePositionError = await db.activity
    .update({ where: { id: firstId }, data: { position: 1 } })
    .then(
      () => undefined,
      (error: unknown) => error,
    )

  await db.$transaction(async (tx) => {
    await tx.activity.update({ where: { id: firstId }, data: { position: 2 } })
    await tx.activity.update({ where: { id: secondId }, data: { position: 0 } })
    await tx.activity.update({ where: { id: firstId }, data: { position: 1 } })
  })

  const ordered = await db.activity.findMany({ where: { dayId }, orderBy: { position: 'asc' } })
  const travelCount = await db.travelEstimate.count()

  // Assert
  expect(duplicateDateError).toMatchObject({ code: 'P2002' })
  expect(duplicatePositionError).toMatchObject({ code: 'P2002' })
  expect(ordered.map((item) => item.id)).toEqual([secondId, firstId])
  expect(travelCount).toBe(1)
})

it('keeps directional zero travel distinct from unknown and rejects duplicate/self/foreign-day pairs', async () => {
  // Arrange
  const foreignDay = randomUUID()
  const foreignActivity = randomUUID()
  await db.trip.create({
    data: {
      id: randomUUID(),
      userId: ownerB,
      title: 'Other trip',
      destination: 'Other city',
      days: {
        create: {
          id: foreignDay,
          date: new Date('2026-10-25'),
          startMinute: 0,
          finishMinute: 1,
          activities: {
            create: { id: foreignActivity, title: 'Other stop', durationMinutes: 1, position: 0 },
          },
        },
      },
    },
  })

  const pair = { dayId, fromActivityId: firstId, toActivityId: secondId, minutes: 0 }

  // Act
  await db.travelEstimate.create({ data: pair })
  const initialPairs = await db.travelEstimate.findMany()
  const duplicateError = await captureError(db.travelEstimate.create({ data: pair }))
  const foreignDestinationError = await captureError(
    db.travelEstimate.create({ data: { ...pair, toActivityId: foreignActivity } }),
  )
  const foreignOriginError = await captureError(
    db.travelEstimate.create({ data: { ...pair, fromActivityId: foreignActivity } }),
  )
  const selfTravelError = await captureError(
    sql.query('INSERT INTO travel_estimate VALUES ($1,$2,$2,0)', [dayId, firstId]),
  )
  const negativeTravelError = await captureError(
    sql.query('UPDATE travel_estimate SET minutes = -1'),
  )
  const excessiveTravelError = await captureError(
    sql.query('UPDATE travel_estimate SET minutes = 1440'),
  )
  await db.travelEstimate.create({
    data: { ...pair, fromActivityId: secondId, toActivityId: firstId, minutes: 20 },
  })
  const pairCount = await db.travelEstimate.count()
  await db.activity.delete({ where: { id: firstId } })
  const remainingTravelCount = await db.travelEstimate.count()

  // Assert
  expect(initialPairs).toEqual([pair])
  expect(duplicateError).toMatchObject({ code: 'P2002' })
  expect(foreignDestinationError).toMatchObject({ code: 'P2003' })
  expect(foreignOriginError).toMatchObject({ code: 'P2003' })
  expect(selfTravelError).toMatchObject({ code: '23514', constraint: 'travel_distinct_check' })
  expect(negativeTravelError).toMatchObject({ code: '23514' })
  expect(excessiveTravelError).toMatchObject({ code: '23514' })
  expect(pairCount).toBe(2)
  expect(remainingTravelCount).toBe(0)
})

it('rolls back metadata, revision and receipt when a nested write violates a constraint', async () => {
  // Arrange
  const expectedOriginalTitle = 'Synthetic trip'
  const expectedRevision = 1

  // Act
  const transactionError = await captureError(
    db.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id: tripId },
        data: { title: 'Should roll back', revision: { increment: 1 } },
      })
      await tx.mutationReceipt.create({ data: receipt() })
      await tx.activity.update({ where: { id: firstId }, data: { position: 1 } })
    }),
  )
  const trip = await db.trip.findUnique({ where: { id: tripId } })
  const receiptCount = await db.mutationReceipt.count()

  // Assert
  expect(transactionError).toMatchObject({ code: 'P2002' })
  expect(trip).toMatchObject({
    title: expectedOriginalTitle,
    revision: expectedRevision,
  })
  expect(receiptCount).toBe(0)
})

it('supports owner-scoped reads/writes and exactly one winner for competing revision updates', async () => {
  // Arrange
  const baseRevision = 1

  // Act
  const foreignTrip = await db.trip.findFirst({ where: { id: tripId, userId: ownerB } })
  const foreignUpdate = await db.trip.updateMany({
    where: { id: tripId, userId: ownerB, revision: baseRevision },
    data: { revision: { increment: 1 } },
  })
  const foreignDelete = await db.trip.deleteMany({ where: { id: tripId, userId: ownerB } })

  const results = await Promise.all(
    [1, 2].map(() =>
      db.$transaction(async (tx) => {
        const updated = await tx.trip.updateMany({
          where: { id: tripId, userId: ownerA, revision: baseRevision },
          data: { revision: { increment: 1 } },
        })

        if (updated.count === 1) await tx.mutationReceipt.create({ data: receipt() })

        return updated.count
      }),
    ),
  )
  const staleDelete = await db.trip.deleteMany({
    where: { id: tripId, userId: ownerA, revision: baseRevision },
  })
  const receiptCount = await db.mutationReceipt.count()

  // Assert
  expect(foreignTrip).toBeNull()
  expect(foreignUpdate.count).toBe(0)
  expect(foreignDelete.count).toBe(0)
  expect(results.sort()).toEqual([0, 1])
  expect(receiptCount).toBe(1)
  expect(staleDelete.count).toBe(0)
})

it('scopes mutation IDs by owner, rejects racing duplicates and retains compact results after trip deletion', async () => {
  // Arrange
  const data = receipt()
  // Act
  const results = await Promise.allSettled([
    db.mutationReceipt.create({ data }),
    db.mutationReceipt.create({ data }),
  ])
  const failure = results.find((result) => result.status === 'rejected')
  const ownerBReceipt = await db.mutationReceipt.create({ data: { ...data, userId: ownerB } })
  const alteredPayloadError = await captureError(
    db.mutationReceipt.create({ data: { ...data, payloadHash: 'b'.repeat(64) } }),
  )

  await db.$transaction(async (tx) => {
    await tx.mutationReceipt.create({
      data: { ...receipt(), operation: 'DELETE_TRIP', resultKind: 'DELETED', resultRevision: null },
    })
    await tx.trip.delete({ where: { id: tripId } })
  })
  const remainingDayCount = await db.day.count()
  const remainingActivityCount = await db.activity.count()
  const remainingReceiptCount = await db.mutationReceipt.count()
  const retainedReceipt = await db.mutationReceipt.findUnique({
    where: { userId_mutationId: { userId: ownerA, mutationId: data.mutationId } },
  })

  // Assert
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(failure).toMatchObject({ status: 'rejected', reason: { code: 'P2002' } })
  expect(ownerBReceipt.userId).toBe(ownerB)
  expect(alteredPayloadError).toMatchObject({ code: 'P2002' })
  expect(remainingDayCount).toBe(0)
  expect(remainingActivityCount).toBe(0)
  expect(remainingReceiptCount).toBe(3)
  expect(retainedReceipt).toMatchObject({ resultRevision: 2, targetTripId: tripId })
})

it('validates receipt result shapes and digest without storing payloads', async () => {
  // Arrange
  const row = await db.mutationReceipt.create({ data: receipt() })
  const invalidReceiptUpdates = [
    ['payloadHash', 'invalid', 'receipt_hash_check'],
    ['resultRevision', null, 'receipt_result_check'],
    ['resultRevision', 1, 'receipt_result_check'],
    ['resultKind', 'CREATED', 'receipt_result_check'],
    ['operation', 'DELETE_TRIP', 'receipt_result_check'],
  ] as const

  // Act
  const errors = await Promise.all(
    invalidReceiptUpdates.map(([field, value]) =>
      sql
        .query(`UPDATE mutation_receipt SET "${field}" = $1 WHERE "mutationId" = $2`, [
          value,
          row.mutationId,
        ])
        .then(
          () => undefined,
          (error: unknown) => error,
        ),
    ),
  )
  await db.mutationReceipt.create({
    data: { ...receipt(), operation: 'CREATE_TRIP', resultKind: 'CREATED', resultRevision: 1 },
  })
  const fields = Object.keys(row)

  // Assert
  for (const [index, [, , constraint]] of invalidReceiptUpdates.entries()) {
    expect(errors[index]).toMatchObject({ code: '23514', constraint })
  }
  expect(fields).not.toContain('snapshot')
  expect(fields).not.toContain('title')
})

it('cascades day children, permits an empty trip, and cascades user receipts and owned trips', async () => {
  // Arrange
  await db.travelEstimate.create({
    data: { dayId, fromActivityId: firstId, toActivityId: secondId, minutes: 5 },
  })
  const disposableUser = 'cascade-owner'
  await db.user.create({
    data: {
      id: disposableUser,
      name: 'Synthetic cascade',
      email: 'cascade@example.test',
      trips: { create: { id: randomUUID(), title: 'Cascade', destination: 'Example' } },
    },
  })
  await db.mutationReceipt.create({ data: { ...receipt(), userId: disposableUser } })

  // Act
  await db.day.delete({ where: { id: dayId } })
  await db.user.delete({ where: { id: disposableUser } })
  const remainingActivities = await db.activity.count()
  const remainingTravel = await db.travelEstimate.count()
  const remainingTrips = await db.trip.count()
  const disposableTrips = await db.trip.count({ where: { userId: disposableUser } })
  const disposableReceipts = await db.mutationReceipt.count({ where: { userId: disposableUser } })
  const ownerTrips = await db.trip.count({ where: { userId: ownerA } })

  // Assert
  expect(remainingActivities).toBe(0)
  expect(remainingTravel).toBe(0)
  expect(remainingTrips).toBe(1)
  expect(disposableTrips).toBe(0)
  expect(disposableReceipts).toBe(0)
  expect(ownerTrips).toBe(1)
})

function snapshot() {
  return {
    title: 'Synthetic trip',
    destination: 'Example city',
    days: [
      {
        id: dayId,
        date: '2026-10-25',
        startMinute: 540,
        finishMinute: 1080,
        activities: [
          {
            id: firstId,
            title: 'Museum',
            placeLabel: null,
            durationMinutes: 60,
            fixedStartMinute: null,
          },
          {
            id: secondId,
            title: 'Lunch',
            placeLabel: null,
            durationMinutes: 45,
            fixedStartMinute: 720,
          },
        ],
        travelEstimates: [{ fromActivityId: firstId, toActivityId: secondId, minutes: 0 }],
      },
    ],
  }
}

it('creates once and replays the original acknowledgement without duplicate rows', async () => {
  // Arrange
  const input = {
    mutationId: randomUUID(),
    title: 'New synthetic trip',
    destination: 'Example city',
    days: [{ date: '2026-10-26', startMinute: 540, finishMinute: 1080 }],
  }

  // Act
  const first = await createTrip(db, ownerA, input)
  const replay = await createTrip(db, ownerA, input)
  const createdTripId = first.ok ? first.data.tripId : ''
  const createdDayIds = await db.day.findMany({
    where: { tripId: createdTripId },
    select: { id: true },
  })
  const tripCount = await db.trip.count({ where: { id: createdTripId } })
  const receiptCount = await db.mutationReceipt.count({ where: { targetTripId: createdTripId } })
  const changedReplay = await createTrip(db, ownerA, { ...input, destination: 'Changed' })
  const forgedTripId = randomUUID()
  const forgedResult = await createTrip(db, ownerA, { ...input, tripId: forgedTripId })
  const forgedTrip = await db.trip.findUnique({ where: { id: forgedTripId }, select: { id: true } })
  const forgedDayId = randomUUID()
  const forgedDayResult = await createTrip(db, ownerA, {
    ...input,
    mutationId: randomUUID(),
    days: input.days.map((current) => ({ ...current, id: forgedDayId })),
  })
  const forgedDay = await db.day.findUnique({ where: { id: forgedDayId }, select: { id: true } })

  // Assert
  expect(first).toMatchObject({
    ok: true,
    data: { tripId: expect.stringMatching(/^[0-9a-f-]{36}$/i), revision: 1 },
  })
  expect(replay).toEqual(first)
  expect(createdDayIds).toHaveLength(1)
  expect(createdDayIds[0].id).toMatch(/^[0-9a-f-]{36}$/i)
  expect(tripCount).toBe(1)
  expect(receiptCount).toBe(1)
  expect(changedReplay).toMatchObject({ ok: false, error: { code: 'IDEMPOTENCY_CONFLICT' } })
  expect(forgedResult).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  expect(forgedTrip).toBeNull()
  expect(forgedDayResult).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  expect(forgedDay).toBeNull()
})

it('allows one revision winner and recovers a lost response with the same receipt', async () => {
  // Arrange
  const base = { tripId, expectedRevision: 1, snapshot: snapshot() }
  const a = { ...base, mutationId: randomUUID(), snapshot: { ...base.snapshot, title: 'A wins' } }
  const b = { ...base, mutationId: randomUUID(), snapshot: { ...base.snapshot, title: 'B wins' } }

  // Act
  const results = await Promise.all([saveTrip(db, ownerA, a), saveTrip(db, ownerA, b)])
  const winner = results[0].ok ? a : b
  const replay = await saveTrip(db, ownerA, winner)
  const savedTrip = await db.trip.findUnique({ where: { id: tripId } })
  const receiptCount = await db.mutationReceipt.count({ where: { targetTripId: tripId } })
  const forgedReplay = await saveTrip(db, ownerA, {
    ...winner,
    snapshot: { ...winner.snapshot, title: 'Forged replay' },
  })

  // Assert
  expect(results.filter((result) => result.ok)).toHaveLength(1)
  expect(results.filter((result) => !result.ok)).toMatchObject([
    { ok: false, error: { code: 'CONFLICT', latestRevision: 2 } },
  ])
  expect(replay).toMatchObject({ ok: true, data: { revision: 2 } })
  expect(savedTrip).toMatchObject({
    title: winner.snapshot.title,
    revision: 2,
  })
  expect(receiptCount).toBe(1)
  expect(forgedReplay).toMatchObject({ ok: false, error: { code: 'IDEMPOTENCY_CONFLICT' } })
})

it('rejects foreign ownership, forged child IDs and invalid travel without changing data', async () => {
  // Arrange
  const original = await db.trip.findUniqueOrThrow({ where: { id: tripId } })
  const input = { tripId, mutationId: randomUUID(), expectedRevision: 1, snapshot: snapshot() }
  const foreignDay = await db.day.create({
    data: {
      id: randomUUID(),
      trip: {
        create: { id: randomUUID(), userId: ownerB, title: 'Foreign', destination: 'Elsewhere' },
      },
      date: new Date('2026-10-26'),
      startMinute: 0,
      finishMinute: 1,
    },
  })
  const forged = {
    ...input,
    snapshot: { ...input.snapshot, days: [{ ...input.snapshot.days[0], id: foreignDay.id }] },
  }
  const foreignActivity = await db.activity.create({
    data: {
      id: randomUUID(),
      dayId: foreignDay.id,
      title: 'Foreign stop',
      durationMinutes: 1,
      position: 0,
    },
  })

  const forgedActivity = {
    ...input,
    snapshot: {
      ...input.snapshot,
      days: [
        {
          ...input.snapshot.days[0],
          activities: [
            { ...input.snapshot.days[0].activities[0], id: foreignActivity.id },
            input.snapshot.days[0].activities[1],
          ],
          travelEstimates: [],
        },
      ],
    },
  }
  const invalid = {
    ...input,
    snapshot: {
      ...input.snapshot,
      days: [
        {
          ...input.snapshot.days[0],
          travelEstimates: [{ fromActivityId: firstId, toActivityId: randomUUID(), minutes: 3 }],
        },
      ],
    },
  }

  // Act
  const foreignSave = await saveTrip(db, ownerB, input)
  const foreignDelete = await deleteTrip(db, ownerB, {
    tripId,
    mutationId: randomUUID(),
    expectedRevision: 1,
  })
  const forgedDaySave = await saveTrip(db, ownerA, forged)
  const forgedActivitySave = await saveTrip(db, ownerA, forgedActivity)
  const invalidTravelSave = await saveTrip(db, ownerA, invalid)
  const unchangedTrip = await db.trip.findUniqueOrThrow({ where: { id: tripId } })
  const receiptCount = await db.mutationReceipt.count({ where: { targetTripId: tripId } })

  // Assert
  expect(foreignSave).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  expect(foreignDelete).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  expect(forgedDaySave).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  expect(forgedActivitySave).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  expect(invalidTravelSave).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  expect(unchangedTrip).toEqual(original)
  expect(receiptCount).toBe(0)
})

it('rejects stale delete and replays acknowledged delete after cascading removal', async () => {
  // Arrange
  const save = { tripId, mutationId: randomUUID(), expectedRevision: 1, snapshot: snapshot() }
  const stale = { tripId, mutationId: randomUUID(), expectedRevision: 1 }
  const request = { tripId, mutationId: randomUUID(), expectedRevision: 2 }

  // Act
  const saved = await saveTrip(db, ownerA, save)
  const staleDelete = await deleteTrip(db, ownerA, stale)
  const afterStaleDelete = await db.trip.count({ where: { id: tripId } })
  const deleted = await deleteTrip(db, ownerA, request)
  const replayedDelete = await deleteTrip(db, ownerA, request)
  const remainingDays = await db.day.count({ where: { tripId } })
  const receiptCount = await db.mutationReceipt.count({ where: { targetTripId: tripId } })
  const foreignDelete = await deleteTrip(db, ownerB, request)

  // Assert
  expect(saved).toMatchObject({ ok: true, data: { revision: 2 } })
  expect(staleDelete).toMatchObject({ ok: false, error: { code: 'CONFLICT', latestRevision: 2 } })
  expect(afterStaleDelete).toBe(1)
  expect(deleted).toEqual({ ok: true, data: { tripId, deleted: true } })
  expect(replayedDelete).toEqual(deleted)
  expect(remainingDays).toBe(0)
  expect(receiptCount).toBe(2)
  expect(foreignDelete).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
})

it('creates an owner-scoped sample copy and replays the same creation receipt', async () => {
  // Arrange
  const mutationId = randomUUID()
  const sample = {
    mutationId,
    title: 'A day in Porto',
    destination: 'Porto, Portugal',
    days: [
      {
        key: 'sample-day',
        date: '2026-10-27',
        startMinute: 540,
        finishMinute: 1080,
        activities: [
          {
            key: 'breakfast',
            title: 'Breakfast',
            placeLabel: 'Café',
            durationMinutes: 45,
            fixedStartMinute: null,
          },
          {
            key: 'lunch',
            title: 'Lunch',
            placeLabel: 'Riverside',
            durationMinutes: 45,
            fixedStartMinute: 720,
          },
        ],
        travelEstimates: [{ fromKey: 'breakfast', toKey: 'lunch', minutes: 20 }],
      },
    ],
  }

  // Act
  const created = await createSampleCopy(db, ownerA, sample)
  const replayed = await createSampleCopy(db, ownerA, sample)
  const changedReplay = await createSampleCopy(db, ownerA, { ...sample, title: 'Changed payload' })
  const stored = created.ok ? await getTrip(ownerA, created.data.tripId, db) : null
  const foreign = created.ok ? await getTrip(ownerB, created.data.tripId, db) : null
  const receipts = created.ok
    ? await db.mutationReceipt.count({ where: { targetTripId: created.data.tripId } })
    : 0

  // Assert
  expect(created).toMatchObject({ ok: true, data: { revision: 1 } })
  expect(replayed).toEqual(created)
  expect(changedReplay).toMatchObject({ ok: false, error: { code: 'IDEMPOTENCY_CONFLICT' } })
  expect(stored).toMatchObject({
    ok: true,
    data: {
      title: 'A day in Porto',
      destination: 'Porto, Portugal',
      days: [
        {
          activities: [{ title: 'Breakfast' }, { title: 'Lunch', fixedStartMinute: 720 }],
          travelEstimates: [{ minutes: 20 }],
        },
      ],
    },
  })
  expect(foreign).toEqual({ ok: true, data: null })
  expect(receipts).toBe(1)
})
