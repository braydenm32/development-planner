// Back on About, Privacy, Terms and How accurate is this? must stay in the app: the router marks
// each history entry so "back within the app" can be told from "back to the site this tab was on".

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasAppHistory, navigate, startRouter, useRouter } from '../router'
import { defaultRoute, pageRoute, PROJECTS } from '../route'

/** A pretend tab: history entries that each keep their own state, as a browser's do. */
function fakeTab(href: string, before: string[] = []) {
  const entries: { href: string; state: unknown }[] = [...before.map(h => ({ href: h, state: null })), { href, state: null }]
  let at = entries.length - 1
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
    pushState: (s: unknown, _t: string, to?: string | URL | null) => {
      entries.splice(at + 1, Infinity, { href: resolve(to), state: s })
      at++
    },
    replaceState: (s: unknown, _t: string, to?: string | URL | null) => {
      entries[at] = { href: resolve(to), state: s }
    },
    back: () => move(-1),
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
    back: () => move(-1),
    /** A plain link (the footer's <a href="#/privacy">): the browser adds an entry with no state. */
    follow: (hash: string) => {
      entries.splice(at + 1, Infinity, { href: resolve(hash), state: null })
      at++
      events.dispatchEvent(new Event('hashchange'))
    },
    href: () => entries[at].href,
  }
}

describe('whether Back would stay in the app', () => {
  let stop: (() => void) | null = null
  beforeEach(() => useRouter.setState({ route: defaultRoute(), focus: null }))
  afterEach(() => {
    stop?.()
    stop = null
    vi.unstubAllGlobals()
  })

  it('is no for a page opened straight from a link, even with another site behind it in the tab', () => {
    // history.length is 2 here, which the Back button used to take as "there is somewhere to go back to".
    fakeTab('https://example.test/app/#/terms', ['https://elsewhere.test/'])
    stop = startRouter()
    expect(useRouter.getState().route).toEqual(pageRoute('terms'))
    expect(hasAppHistory()).toBe(false)
  })

  it('is yes once the app has gone somewhere, and no again back on the entry it opened at', () => {
    const tab = fakeTab('https://example.test/app/#/projects')
    stop = startRouter()
    expect(hasAppHistory()).toBe(false)
    navigate(pageRoute('about'))
    expect(hasAppHistory()).toBe(true)
    // Between the pages replaces the entry: still one of the app's behind it.
    navigate(pageRoute('privacy'), { replace: true })
    expect(hasAppHistory()).toBe(true)
    tab.back()
    expect(tab.href()).toContain('#/projects')
    expect(hasAppHistory()).toBe(false)
  })

  it('counts a plain link followed inside the app, such as the footer links', () => {
    const tab = fakeTab('https://example.test/app/#/accuracy')
    stop = startRouter()
    tab.follow('#/privacy')
    expect(useRouter.getState().route).toEqual(pageRoute('privacy'))
    expect(hasAppHistory()).toBe(true)
    tab.back()
    expect(hasAppHistory()).toBe(false)
  })

  it('keeps the answer through a reload', () => {
    fakeTab('https://example.test/app/#/projects')
    stop = startRouter()
    navigate(pageRoute('terms'))
    stop()
    // The page loads again on the same entry, which still carries its mark.
    stop = startRouter()
    expect(hasAppHistory()).toBe(true)
    navigate(PROJECTS)
    expect(hasAppHistory()).toBe(true)
  })
})
