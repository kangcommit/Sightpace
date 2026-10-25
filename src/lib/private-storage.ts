const privatePrefix = 'trailplan:private:'

/** Never clear unrelated browser storage or the public sample draft. */
export function clearPrivateStorage(): boolean {
  let cleared = true
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[name]
      for (let index = storage.length - 1; index >= 0; index--) {
        const key = storage.key(index)
        if (key?.startsWith(privatePrefix)) storage.removeItem(key)
      }
    } catch {
      cleared = false
    }
  }

  return cleared
}

/** Block rendering until recovery data belongs to the verified identity. */
export function preparePrivateStorage(userId: string): boolean {
  try {
    const ownerKey = `${privatePrefix}owner`
    const owners = [window.localStorage.getItem(ownerKey), window.sessionStorage.getItem(ownerKey)]
    if (
      owners.some((owner) => owner !== null && owner !== userId) ||
      owners.every((owner) => owner === null)
    ) {
      if (!clearPrivateStorage()) return false
    }

    window.localStorage.setItem(ownerKey, userId)
    window.sessionStorage.setItem(ownerKey, userId)
    return true
  } catch {
    return false
  }
}
