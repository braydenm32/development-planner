// Keeping saved work: a browser may clear what a site keeps when it runs short of space, unless the
// site has asked it to keep it (navigator.storage.persist()). Some browsers put that to the person
// as a question, so it's asked once something has been saved, and not again within a week if it
// was turned down. Where it isn't offered, saving carries on as before.

/** The parts of navigator.storage this uses (missing in older browsers and some private windows). */
export interface KeepStorage {
  persist?: () => Promise<boolean>
  persisted?: () => Promise<boolean>
}

/** Where the time it was last asked is noted (localStorage in the app). */
export interface KeepFlags {
  get(key: string): string | null
  set(key: string, value: string): void
}

export const ASKED_KEY = 'storage-persist-asked-v1'
const WEEK = 7 * 86_400_000

/**
 * Ask the browser to keep this site's storage. True: it will; false: it may clear it when space
 * runs short; null: it doesn't say (not offered here, or it failed).
 */
export async function askToKeep(storage: KeepStorage | undefined, flags: KeepFlags, now = Date.now()): Promise<boolean | null> {
  if (!storage?.persist) return null
  try {
    if (await storage.persisted?.()) return true
    const last = Number(flags.get(ASKED_KEY)) || 0
    if (now - last < WEEK) return false
    flags.set(ASKED_KEY, String(now))
    return await storage.persist()
  } catch {
    return null
  }
}

/** Whether the browser already keeps it, without asking (null: it doesn't say). */
export async function isKept(storage: KeepStorage | undefined): Promise<boolean | null> {
  if (!storage?.persisted) return null
  try {
    return await storage.persisted()
  } catch {
    return null
  }
}

/** localStorage, quietly doing nothing where it can't. */
export const localFlags: KeepFlags = {
  get(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // only a reminder not to ask again too soon
    }
  },
}
