/** TrailPlan compares date-only values against the current UTC calendar date. */
export function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

export function isFirstDayDateAllowed(date: string, today = todayDate()) {
  return date >= today
}
