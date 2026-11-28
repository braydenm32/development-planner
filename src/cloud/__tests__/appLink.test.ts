// The desktop app signing in through the browser, both ends against the real Worker code: the
// app asks for a link and shows its code, the website (signed in) lets it in, and the app then
// has its own token, the cloud's projects, and saves back. Its requests never carry a cookie.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { softPasskey } from '../../../worker/test/authenticator'
import { ORIGIN, testServer } from '../../../worker/test/fakes'

const h = vi.hoisted(() => ({
  desktop: false,
  opened: [] as string[],
  key: null as null | { create: (o: never) => Promise<unknown>; get: (o: never) => Promise<unknown> },
}))
vi.mock('../../desktop/bridge', () => ({
  isDesktop: () => h.desktop,
  openUrl: async (url: string) => void h.opened.push(url),
}))
vi.mock('../passkeys', () => ({
  passkeysWork: () => !h.desktop,
  makePasskey: (o: unknown) => h.key!.create(o as never),
  getPasskey: (o: unknown) => h.key!.get(o as never),
  passkeyTrouble: (e: unknown) => (e as Error)?.message ?? 'trouble',
}))

const survey = (fileName: string) => ({ survey: { fileName, dxfText: '', roles: {} } })
const APP = 'tauri://localhost'

/** A device: its own storage, and its own modules of the app. `href` is the page's address, on the web. */
async function device(fetch: typeof globalThis.fetch, opts: { desktop: boolean; href?: string }) {
  h.desktop = opts.desktop
  const kept = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => kept.get(k) ?? null,
    setItem: (k: string, v: string) => void kept.set(k, String(v)),
    removeItem: (k: string) => void kept.delete(k),
  })
  vi.stubGlobal('indexedDB', new IDBFactory())
  const page = { href: opts.href ?? `${ORIGIN}/`, origin: ORIGIN }
  vi.stubGlobal('location', page)
  vi.stubGlobal('history', { state: null, replaceState: (_s: unknown, _t: string, u: URL | string) => void (page.href = String(u)) })
  vi.resetModules()
  const state = await import('../state')
  const session = await import('../../projects/session')
  state.setCloudApi((await import('../api')).createCloudApi({ fetch }))
  state.linkTiming.every = 5
  return { ...state, ...session, kept, page }
}

/** The desktop app's requests as its webview sends them: from its own origin, and no cookies kept. */
function appFetch(server: ReturnType<typeof testServer>, seen: Request[] = []): typeof fetch {
  return (input, init = {}) => {
    const headers = new Headers(init.headers)
    headers.set('origin', APP)
    seen.push(new Request(new URL(String(input), ORIGIN), { ...init, headers, body: undefined }))
    // A new browser each time: nothing set as a cookie ever comes back.
    return server.browser()(input, { ...init, headers })
  }
}

beforeEach(() => {
  h.opened.length = 0
  h.key = softPasskey(ORIGIN)
})

afterEach(() => {
  vi.unstubAllGlobals()
  h.desktop = false
})

describe('signing the desktop app in through the browser', () => {
  it('opens the website with a code, is let in there, and then has the cloud’s projects and saves back', async () => {
    const server = testServer()
    const browser = server.browser()

    // On the website: an account with one project in the cloud.
    let web = await device(browser, { desktop: false })
    await web.ensureProjects()
    const house = await web.projectActions.create(survey('house.dxf'))
    await web.startCloud()
    await web.cloudActions.createAccount('Ana')
    web.cloudActions.close()
    await web.cloudActions.upload([house.id])
    await vi.waitFor(() => expect(web.useCloud.getState().inCloud).toEqual([house.id]), { timeout: 5000 })

    // The desktop app: signed out, and it talks to the website's API.
    const seen: Request[] = []
    const app = await device(appFetch(server, seen), { desktop: true })
    await app.ensureProjects()
    await app.startCloud()
    expect(app.useCloud.getState()).toMatchObject({ phase: 'signed-out', sheet: null })
    expect(app.projectsNow().list).toEqual([])
    const { apiBase } = await import('../endpoint')
    expect(apiBase()).toBe('https://contourandgable.com/api/')

    // Sign in: the browser is opened at the link, and the app shows the code while it waits.
    const signing = app.cloudActions.signInFromBrowser()
    await vi.waitFor(() => expect(app.useCloud.getState().sheet).toBe('app-link'))
    const link = app.useCloud.getState().appLink!
    expect(link.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(h.opened).toEqual([link.url])
    expect(link.url).toBe(`https://contourandgable.com/?app-link=${link.code}`)

    // The website, opened at that link in the browser where Ana is signed in: let the app in?
    h.desktop = false
    web = await device(browser, { desktop: false, href: `${ORIGIN}/?app-link=${link.code}` })
    await web.ensureProjects()
    await web.startCloud()
    expect(web.useCloud.getState()).toMatchObject({ phase: 'signed-in', sheet: 'app-approve', approve: link.code })
    // The code is taken out of the address.
    expect(web.page.href).toBe(`${ORIGIN}/`)
    await web.cloudActions.approveApp()
    expect(web.useCloud.getState()).toMatchObject({ approve: null, problem: null })

    // The app is signed in, with its own token, and the project from the website.
    h.desktop = true
    vi.stubGlobal('localStorage', { getItem: (k: string) => app.kept.get(k) ?? null, setItem: (k: string, v: string) => void app.kept.set(k, v), removeItem: (k: string) => void app.kept.delete(k) })
    await signing
    expect(app.useCloud.getState()).toMatchObject({ phase: 'signed-in', user: { name: 'Ana' }, appLink: null })
    const token = app.kept.get('cloud-app-token-v1')
    expect(token).toBeTruthy()
    await vi.waitFor(() => expect(app.useCloud.getState().inCloud).toEqual([house.id]), { timeout: 5000 })
    // Signed-in requests carry the token and never a cookie.
    const signedIn = seen.filter(r => r.headers.get('authorization'))
    expect(signedIn.length).toBeGreaterThan(0)
    expect(signedIn.every(r => r.headers.get('authorization') === `Bearer ${token}` && !r.headers.get('cookie'))).toBe(true)

    // Signing out of the app forgets its token; the website stays signed in.
    await app.cloudActions.signOut()
    expect(app.useCloud.getState().phase).toBe('signed-out')
    expect(app.kept.has('cloud-app-token-v1')).toBe(false)
    expect((await (await browser('/api/session')).json()).user.name).toBe('Ana')
    expect((await (await server.browser()('/api/session', { headers: { authorization: `Bearer ${token}` } })).json()).user).toBeNull()
  })

  it('asks the website to sign in first when it isn’t, then offers to let the app in', async () => {
    const server = testServer()
    const browser = server.browser()
    let web = await device(browser, { desktop: false })
    await web.ensureProjects()
    await web.startCloud()
    await web.cloudActions.createAccount('Ana')
    web.cloudActions.close()
    await web.cloudActions.signOut()

    const app = await device(appFetch(server), { desktop: true })
    await app.ensureProjects()
    await app.startCloud()
    void app.cloudActions.signInFromBrowser()
    await vi.waitFor(() => expect(app.useCloud.getState().sheet).toBe('app-link'))
    const link = app.useCloud.getState().appLink!
    // Closing the sheet stops the app waiting.
    app.cloudActions.close()
    expect(app.useCloud.getState()).toMatchObject({ sheet: null, appLink: null })

    h.desktop = false
    web = await device(browser, { desktop: false, href: `${ORIGIN}/?app-link=${link.code}` })
    await web.ensureProjects()
    await web.startCloud()
    expect(web.useCloud.getState()).toMatchObject({ phase: 'signed-out', sheet: 'sign-in', reason: 'app', approve: link.code })
    await web.cloudActions.signIn()
    expect(web.useCloud.getState()).toMatchObject({ phase: 'signed-in', sheet: 'app-approve' })
    // Don't: nothing is approved.
    web.cloudActions.close()
    expect(web.useCloud.getState()).toMatchObject({ sheet: null, approve: null })
    expect((await (await browser(`/api/app/link/${link.code}`)).json()).approved).toBe(false)
  })

  it('says so when the link has run out', async () => {
    const server = testServer()
    const app = await device(appFetch(server), { desktop: true })
    await app.ensureProjects()
    await app.startCloud()
    const signing = app.cloudActions.signInFromBrowser()
    await vi.waitFor(() => expect(app.useCloud.getState().sheet).toBe('app-link'))
    server.clock.now += 11 * 60_000
    await signing
    const s = app.useCloud.getState()
    expect(s).toMatchObject({ phase: 'signed-out', sheet: 'app-link', appLink: null })
    expect(s.problem).toMatch(/run out|already used/)
  })
})
