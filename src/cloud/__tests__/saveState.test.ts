import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { ensureProjects, projectActions } from '../../projects/session'
import { localSaveLook, savedTime, saveNow, type LocalSaveFacts } from '../saveState'

const NOW = new Date(2026, 10, 9, 15, 30).getTime()
const AT = new Date(2026, 10, 9, 14, 14).getTime()
const time = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const facts = (f: Partial<LocalSaveFacts> = {}): LocalSaveFacts => ({ phase: 'signed-out', saved: AT, saveError: null, memoryOnly: false, persisted: false, ...f })

describe('where the work is saved, while not signed in', () => {
  it('says it’s in this browser, when, and only on this device, with the way to keep a copy', () => {
    const look = localSaveLook(facts(), NOW)!
    expect(look).toMatchObject({ label: 'Saved in this browser', at: time(AT), tone: 'quiet', signIn: true })
    expect(look.detail).toMatch(/only on this device/)
    expect(look.detail).toMatch(/can clear what sites keep/)
    expect(look.detail).toMatch(/Sign in to save it to the cloud too, or download a backup project file/)
    // Kept by the browser: no word about clearing.
    expect(localSaveLook(facts({ persisted: true }), NOW)!.detail).not.toMatch(/clear/)
    // No cloud to sign in to: only the backup.
    const none = localSaveLook(facts({ phase: 'unavailable' }), NOW)!
    expect(none.signIn).toBe(false)
    expect(none.detail).toMatch(/Download a backup project file/)
  })

  it('leaves it to the sync chip when signed in, and says nothing with no project open', () => {
    expect(localSaveLook(facts({ phase: 'signed-in' }), NOW)).toBeNull()
    expect(localSaveLook(facts({ phase: 'checking' }), NOW)).toBeNull()
    expect(localSaveLook(facts({ saved: null }), NOW)).toBeNull()
  })

  it('warns when the last change didn’t save, or nothing can be', () => {
    expect(localSaveLook(facts({ saveError: 'Quota exceeded.' }), NOW)).toMatchObject({ label: 'Not saved yet', tone: 'warn', at: null })
    expect(localSaveLook(facts({ saveError: 'Quota exceeded.' }), NOW)!.detail).toMatch(/didn’t save \(Quota exceeded\)/)
    expect(localSaveLook(facts({ memoryOnly: true, saved: null }), NOW)).toMatchObject({ label: 'Not saving', tone: 'warn' })
  })

  it('writes the time today, and the day before that', () => {
    expect(savedTime(AT, NOW)).toBe(time(AT))
    const yesterday = new Date(2026, 10, 8, 18, 0).getTime()
    expect(savedTime(yesterday, NOW)).toBe(new Date(yesterday).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))
    const lastYear = new Date(2025, 10, 8).getTime()
    expect(savedTime(lastYear, NOW)).toMatch(/2025/)
  })
})

describe('⌘S / Ctrl+S', () => {
  beforeAll(() => ensureProjects())

  it('saves what’s waiting and says where it went', async () => {
    await projectActions.create({ survey: { fileName: 'a.dxf', dxfText: '', roles: {} } })
    expect(await saveNow()).toBe('Saved in this browser.')
  })
})
