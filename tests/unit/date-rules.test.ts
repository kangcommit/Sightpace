import { describe, expect, it } from 'vitest'
import { isDateTodayOrLater, todayDate } from '@/features/trips/shared/date-rules'

describe('local calendar date rules', () => {
  it('calculates today in the visitor timezone rather than the server timezone', () => {
    // Arrange
    const instant = new Date('2026-11-03T02:00:00.000Z')

    // Act
    const jakartaDate = todayDate('Asia/Jakarta', instant)
    const ohioDate = todayDate('America/Chicago', instant)

    // Assert
    expect(jakartaDate).toBe('2026-11-03')
    expect(ohioDate).toBe('2026-11-02')
  })

  it('compares a submitted day against today in the submitted timezone', () => {
    // Arrange
    const date = '2026-11-02'
    const instant = new Date('2026-11-03T02:00:00.000Z')
    // Act
    const validInJakarta = isDateTodayOrLater(date, undefined, 'Asia/Jakarta', instant)
    const validInOhio = isDateTodayOrLater(date, undefined, 'America/Chicago', instant)

    // Assert
    expect(validInJakarta).toBe(false)
    expect(validInOhio).toBe(true)
  })
})
