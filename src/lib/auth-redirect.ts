const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const tripPath = new RegExp(`^/trips/${uuid}$`)
const dayId = new RegExp(`^${uuid}$`)

/** Only application destinations, never URLs, auth endpoints or encoded paths. */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 256 || /[%\\\s#]/.test(value)) return '/trips'

  const [path, query] = value.split('?')

  if (
    !path ||
    !(path === '/trips' || path === '/trips/new' || path === '/demo' || tripPath.test(path))
  )
    return '/trips'

  if (!query) return path

  if (value.split('?').length !== 2 || !tripPath.test(path)) return path

  const entries = [...new URLSearchParams(query).entries()]

  if (entries.length !== 1 || entries[0]?.[0] !== 'day' || !dayId.test(entries[0][1])) return path

  return `${path}?day=${entries[0][1]}`
}

export function signInPath(returnTo: unknown, failed = false): string {
  const query = new URLSearchParams({ returnTo: safeReturnPath(returnTo) })
  if (failed) query.set('error', 'oauth')

  return `/sign-in?${query}`
}
