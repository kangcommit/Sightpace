/** Return the current calendar date in the requested timezone. */
export function todayDate(
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  now = new Date(),
) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))

  return `${values.year}-${values.month}-${values.day}`
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return true
  } catch {
    return false
  }
}

export function isDateTodayOrLater(
  date: string,
  today?: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  now = new Date(),
) {
  today ??= todayDate(timeZone, now)

  return date >= today
}
