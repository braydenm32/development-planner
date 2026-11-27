// Android's Back closes a sheet, the Overview or a dialog on a touch screen instead of leaving the
// place (PH-20), and Back, Forward and reload still go between places exactly as before.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openSheet, sheetMark } from '../backCloses'
import { navigate, startRouter, useRouter } from '../router'
import { areaRoute, defaultRoute, formatHash, type AppRoute } from '../route'

/**
 * A pretend tab whose entries keep their own state, as a browser's do. Its history.back() lands
 * later, as a browser's does, when `land()` is called (or at once with `later` false).
 */
function fakeTab(href: string, later = false) {
  const entries: { href: string; state: unknown }[] = [{ href, state: null }]
  let at = 0
  let queued = 0
  const events = new EventTarget()
  const resolve = (to?: string | URL | null) => (to != null && to !== '' ? new URL(String(to), entries[at].href).href : entries[at].href)
  const move = (by: number) => {
    at += by
    events.dispatchEvent(new Event('popstate'))
  }
  vi.stubGlobal('history', {
    get state() {
      return entries[at].state
    },
    get length() {
      return entries.length
    },
    pushState: (s: unknown, _t: string, to?: string | URL | null) => {
      entries.splice(at + 1, Infinity, { href: resolve(to), state: s })
      at++
    },
    replaceState: (s: unknown, _t: string, to?: string | URL | null) => {
      entries[at] = { href: resolve(to), state: s }
    },
    back: () => (later ? queued++ : move(-1)),
  })
  vi.stubGlobal('location', {
    get href() {
      return entries[at].href
    },
    get hash() {
      return new URL(entries[at].href).hash
    },
    get search() {
      return new URL(entries[at].href).search
    },
  })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  vi.stubGlobal('window', { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) })
  return {
    /** The person presses Back or Forward. */
    back: () => move(-1),
    forward: () => move(1),
    /** A history.back() asked for earlier arrives. */
    land: () => {
      while (queued) {
        queued--
        move(-1)
      }
    },
    hash: () => new URL(entries[at].href).hash,
    hashes: () => entries.map(e => new URL(e.href).hash),
    at: () => at,
  }
}

const place = (tab: string, more: Partial<AppRoute> = {}): AppRoute => ({ ...areaRoute('site', tab), ...more })

describe('Back closes what is open over the screen (PH-20)', () => {
  let stop: (() => void) | null = null
  const opened: (() => void)[] = []
  /** Something opened that Back closes; returns whether it is still open, and closes it from the page. */
  const sheet = () => {
    const s = { open: true, closeFromPage: () => {} }
    s.closeFromPage = openSheet(() => (s.open = false))
    opened.push(s.closeFromPage)
    return s
  }
  beforeEach(() => useRouter.setState({ route: defaultRoute(), focus: null }))
  afterEach(() => {
    opened.splice(0).forEach(c => c())
    stop?.()
    stop = null
    vi.unstubAllGlobals()
  })

  it('closes the sheet and stays at the place', () => {
    const tab = fakeTab(`https://example.test/app/${formatHash(place('block'))}`)
    stop = startRouter()
    navigate(place('sun'))
    const s = sheet()
    expect(sheetMark()).toBeDefined()
    tab.back()
    expect(s.open).toBe(false)
    expect(tab.hash()).toBe(formatHash(place('sun')))
    expect(useRouter.getState().route).toEqual(place('sun'))
    // The next Back goes between places, as it always did.
    tab.back()
    expect(useRouter.getState().route).toEqual(place('block'))
  })

  it('takes its entry off again when it is closed on the page, so Back still leaves at the first press', () => {
    const tab = fakeTab(`https://example.test/app/${formatHash(place('block'))}`)
    stop = startRouter()
    navigate(place('sun'))
    const s = sheet()
    s.closeFromPage()
    expect(tab.hashes()).toHaveLength(3)
    expect(tab.at()).toBe(1)
    expect(sheetMark()).toBeUndefined()
    tab.back()
    expect(useRouter.getState().route).toEqual(place('block'))
  })

  it('closes one at a time, the newest first', () => {
    const tab = fakeTab(`https://example.test/app/${formatHash(place('block'))}`)
    stop = startRouter()
    const a = sheet()
    const b = sheet()
    tab.back()
    expect([a.open, b.open]).toEqual([true, false])
    tab.back()
    expect([a.open, b.open]).toEqual([false, false])
    expect(useRouter.getState().route).toEqual(place('block'))
  })

  it('never carries a mark to a new place: going somewhere replaces it, and Back goes to where it was opened', () => {
    const tab = fakeTab(`https://example.test/app/${formatHash(place('block'))}`)
    stop = startRouter()
    navigate(place('sun'))
    const s = sheet()
    // Search's choice, or a link in the Overview: a new place.
    navigate(place('features'))
    expect(sheetMark()).toBeUndefined()
    expect(tab.hashes()).toEqual([formatHash(place('block')), formatHash(place('sun')), formatHash(place('features'))])
    // What stays open has no entry left to take off.
    s.closeFromPage()
    expect(tab.hash()).toBe(formatHash(place('features')))
    tab.back()
    expect(useRouter.getState().route).toEqual(place('sun'))
    tab.forward()
    expect(useRouter.getState().route).toEqual(place('features'))
  })

  it('keeps a selection or level written while it was open when Back closes it', () => {
    const tab = fakeTab(`https://example.test/app/${formatHash(place('block'))}`)
    stop = startRouter()
    const s = sheet()
    const picked = place('block', { sel: 'w1', level: 'l1' })
    navigate(picked, { replace: true })
    tab.back()
    expect(s.open).toBe(false)
    expect(tab.hash()).toBe(formatHash(picked))
    expect(useRouter.getState().route).toEqual(picked)
  })

  it('makes the router wait for its own Back to land before writing the address', () => {
    const tab = fakeTab(`https://example.test/app/${formatHash(place('block'))}`, true)
    stop = startRouter()
    const s = sheet()
    s.closeFromPage()
    // Straight on somewhere new, before the browser has gone back: the route follows at once ...
    navigate(place('sun'))
    expect(useRouter.getState().route).toEqual(place('sun'))
    expect(tab.hashes()).toHaveLength(2)
    // ... and the address once the Back has landed, as a new entry after the place it was opened at.
    tab.land()
    expect(tab.hashes()).toEqual([formatHash(place('block')), formatHash(place('sun'))])
    expect(useRouter.getState().route).toEqual(place('sun'))
    tab.back()
    expect(useRouter.getState().route).toEqual(place('block'))
  })

  it('opens a second one only after the first one’s Back has landed', () => {
    const tab = fakeTab(`https://example.test/app/${formatHash(place('block'))}`, true)
    stop = startRouter()
    // The Overview's "Check everything": the Overview closes and the steps open.
    sheet().closeFromPage()
    const b = sheet()
    tab.land()
    expect(tab.at()).toBe(1)
    expect(sheetMark()).toBeDefined()
    tab.back()
    expect(b.open).toBe(false)
    expect(tab.at()).toBe(0)
  })

  it('drops a mark left on the entry by a reload, when nothing is open any more', () => {
    const tab = fakeTab(`https://example.test/app/${formatHash(place('block'))}`)
    stop = startRouter()
    sheet()
    stop()
    stop = startRouter()
    expect(sheetMark()).toBeUndefined()
    expect(useRouter.getState().route).toEqual(place('block'))
    navigate(place('sun'))
    tab.back()
    expect(useRouter.getState().route).toEqual(place('block'))
  })
})
