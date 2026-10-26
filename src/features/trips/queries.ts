import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { PrismaClient } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

const pageSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger)
const pageSize = 20

type TripSummary = {
  id: string
  title: string
  destination: string
  startDate: string | null
  endDate: string | null
  updatedAt: Date
  revision: number
}

export type TripListResult =
  | {
      ok: true
      data: { items: TripSummary[]; page: number; pageSize: number; totalPages: number }
    }
  | { ok: false; error: 'VALIDATION_ERROR' | 'TEMPORARILY_UNAVAILABLE'; requestId?: string }

/** Private trip list. Call only after verifying a session; the owner ID comes from that session. */
export async function listTrips(
  ownerId: string,
  pageValue?: string,
  db: PrismaClient = prisma,
): Promise<TripListResult> {
  const parsedPage =
    pageValue === undefined ? { success: true as const, data: 1 } : pageSchema.safeParse(pageValue)

  if (!parsedPage.success) return { ok: false, error: 'VALIDATION_ERROR' }

  try {
    const where = { userId: ownerId }
    const totalItems = await db.trip.count({ where })
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
    const page = Math.min(parsedPage.data, totalPages)
    const rows = await db.trip.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        destination: true,
        updatedAt: true,
        revision: true,
        days: { orderBy: { date: 'asc' }, select: { date: true } },
      },
    })
    const items = rows.map(({ days, ...trip }) => ({
      ...trip,
      startDate: days[0]?.date.toISOString().slice(0, 10) ?? null,
      endDate: days.at(-1)?.date.toISOString().slice(0, 10) ?? null,
    }))

    return {
      ok: true,
      data: { items, page, pageSize, totalPages },
    }
  } catch {
    const requestId = randomUUID()
    console.error('Trip list unavailable', { requestId })

    return { ok: false, error: 'TEMPORARILY_UNAVAILABLE', requestId }
  }
}

/** Owner-filtered snapshot read; missing and foreign IDs intentionally return the same result. */
export async function getTrip(ownerId: string, tripId: string, db: PrismaClient = prisma) {
  if (!z.uuid().safeParse(tripId).success) return { ok: true as const, data: null }

  try {
    const trip = await db.$transaction(
      (tx) =>
        tx.trip.findFirst({
          where: { id: tripId, userId: ownerId },
          select: {
            id: true,
            title: true,
            destination: true,
            createdAt: true,
            revision: true,
            updatedAt: true,
            days: {
              orderBy: { date: 'asc' },
              select: {
                id: true,
                date: true,
                startMinute: true,
                finishMinute: true,
                activities: {
                  orderBy: { position: 'asc' },
                  select: {
                    id: true,
                    title: true,
                    placeLabel: true,
                    durationMinutes: true,
                    fixedStartMinute: true,
                  },
                },
                travelEstimates: {
                  select: { fromActivityId: true, toActivityId: true, minutes: true },
                },
              },
            },
          },
        }),
      { isolationLevel: 'RepeatableRead' },
    )

    if (!trip) return { ok: true as const, data: null }

    return {
      ok: true as const,
      data: {
        ...trip,
        days: trip.days.map((day) => ({
          ...day,
          date: day.date.toISOString().slice(0, 10),
          travelEstimates: day.travelEstimates.map((estimate) => ({ ...estimate, dayId: day.id })),
        })),
      },
    }
  } catch {
    const requestId = randomUUID()
    console.error('Trip read unavailable', { requestId })

    return { ok: false as const, error: 'TEMPORARILY_UNAVAILABLE' as const, requestId }
  }
}
