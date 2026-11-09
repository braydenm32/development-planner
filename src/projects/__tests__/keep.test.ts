import { describe, expect, it } from 'vitest'
import { ASKED_KEY, askToKeep, isKept, type KeepFlags, type KeepStorage } from '../keep'

const DAY = 86_400_000

function flags(start: Record<string, string> = {}): KeepFlags & { values: Record<string, string> } {
  const values = { ...start }
  return { values, get: k => values[k] ?? null, set: (k, v) => void (values[k] = v) }
}

/** A browser's storage that answers `persist()` with `grant`, counting how often it's asked. */
function storage(grant: boolean, kept = false): KeepStorage & { asked: number } {
  const s = {
    asked: 0,
    persisted: async () => kept,
    persist: async () => {
      s.asked++
      kept = grant
      return grant
    },
  }
  return s
}

describe('asking the browser to keep saved work', () => {
  it('asks once, and says whether it will', async () => {
    const f = flags()
    const s = storage(true)
    expect(await askToKeep(s, f, 10 * DAY)).toBe(true)
    expect(s.asked).toBe(1)
    expect(f.values[ASKED_KEY]).toBe(String(10 * DAY))
    // Kept already: it isn't asked again.
    expect(await askToKeep(s, f, 11 * DAY)).toBe(true)
    expect(s.asked).toBe(1)
  })

  it('doesn’t ask again within a week of being turned down', async () => {
    const f = flags()
    const s = storage(false)
    expect(await askToKeep(s, f, 10 * DAY)).toBe(false)
    expect(await askToKeep(s, f, 16 * DAY)).toBe(false)
    expect(s.asked).toBe(1)
    expect(await askToKeep(s, f, 17 * DAY)).toBe(false)
    expect(s.asked).toBe(2)
  })

  it('carries on quietly where the browser doesn’t offer it', async () => {
    expect(await askToKeep(undefined, flags())).toBeNull()
    expect(await askToKeep({}, flags())).toBeNull()
    const failing: KeepStorage = { persisted: async () => false, persist: () => Promise.reject(new Error('blocked')) }
    expect(await askToKeep(failing, flags())).toBeNull()
    expect(await isKept(undefined)).toBeNull()
  })

  it('checks without asking', async () => {
    const s = storage(true, true)
    expect(await isKept(s)).toBe(true)
    expect(await isKept(storage(true, false))).toBe(false)
    expect(s.asked).toBe(0)
  })
})
