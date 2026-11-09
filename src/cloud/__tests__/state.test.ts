import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { softPasskey } from '../../../worker/test/authenticator'
import { ORIGIN, testServer } from '../../../worker/test/fakes'
import { createCloudApi } from '../api'

// The browser's passkey prompt, answered by a software authenticator.
const h = vi.hoisted(() => ({ key: null as null | { create: (o: never) => Promise<unknown>; get: (o: never) => Promise<unknown> } }))
vi.mock('../passkeys', () => ({
  passkeysWork: () => true,
  makePasskey: (o: unknown) => h.key!.create(o as never),
  getPasskey: (o: unknown) => h.key!.get(o as never),
  passkeyTrouble: (e: unknown) => (e as Error)?.message ?? 'trouble',
}))

const survey = (fileName: string) => ({ survey: { fileName, dxfText: '', roles: {} } })

/** A fresh app (its own modules, so "starts once" starts again) talking to `fetch`. */
async function freshApp(fetch: typeof globalThis.fetch) {
  vi.resetModules()
  const state = await import('../state')
  const session = await import('../../projects/session')
  // The fresh modules' own API, so their errors are the ones the state knows.
  state.setCloudApi((await import('../api')).createCloudApi({ fetch }))
  return { ...state, ...session }
}

beforeEach(() => {
  const kept = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => kept.get(k) ?? null,
    setItem: (k: string, v: string) => void kept.set(k, String(v)),
    removeItem: (k: string) => void kept.delete(k),
  })
  h.key = softPasskey(ORIGIN)
})

describe('cloud saves in the app', () => {
  it('asks only whether there is a cloud, then signs up, reviews the first upload, and signs out keeping everything', async () => {
    const server = testServer()
    const seen: string[] = []
    const app = await freshApp((input, init) => {
      seen.push(`${init?.method ?? 'GET'} ${String(input)}`)
      return server.fetch(input, init)
    })
    const look = createCloudApi({ fetch: server.fetch })

    await app.ensureProjects()
    const a = await app.projectActions.create(survey('a.dxf'))
    const b = await app.projectActions.create(survey('b.dxf'))

    await app.startCloud()
    expect(app.useCloud.getState()).toMatchObject({ phase: 'signed-out', signup: 'open', sheet: null })
    expect(seen).toEqual(['GET /api/health', 'GET /api/session'])

    // Create an account: a recovery code to keep, and nothing uploaded yet.
    await app.cloudActions.createAccount('Tester')
    let s = app.useCloud.getState()
    expect(s).toMatchObject({ phase: 'signed-in', user: { name: 'Tester' }, sheet: 'code', problem: null })
    expect(s.code?.value).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/)
    expect(await look.projects()).toEqual([])

    // Kept the code: the review of what is on this device comes next.
    app.cloudActions.close()
    s = app.useCloud.getState()
    expect(s.sheet).toBe('upload')
    expect(s.code).toBeNull()
    expect(s.waiting.map(m => m.id).sort()).toEqual([a.id, b.id].sort())

    // One goes up, the other stays here and isn't asked about again.
    await app.cloudActions.upload([a.id], [b.id])
    await vi.waitFor(async () => expect((await look.projects()).map(p => p.id)).toEqual([a.id]), { timeout: 5000 })
    s = app.useCloud.getState()
    expect(s.sheet).toBeNull()
    expect(s.waiting).toEqual([])
    expect(s.kept.map(m => m.id)).toEqual([b.id])
    await vi.waitFor(() => expect(app.useCloud.getState().inCloud).toEqual([a.id]))

    // Signing out keeps both projects here.
    await app.cloudActions.signOut()
    expect(app.useCloud.getState()).toMatchObject({ phase: 'signed-out', user: null, inCloud: [] })
    expect(app.projectsNow().list.map(m => m.id).sort()).toEqual([a.id, b.id].sort())

    // Signing in again asks nothing more.
    await app.cloudActions.signIn()
    expect(app.useCloud.getState()).toMatchObject({ phase: 'signed-in', sheet: null, problem: null })
  })

  it('deletes the account after 30 days, signing out here, and keeps it when its owner signs in and says so', async () => {
    const server = testServer()
    const app = await freshApp(server.fetch)
    const look = createCloudApi({ fetch: server.fetch })
    await app.ensureProjects()
    const a = await app.projectActions.create(survey('a.dxf'))
    await app.startCloud()
    await app.cloudActions.createAccount('Tester')
    app.cloudActions.close()
    await app.cloudActions.upload([a.id])
    await vi.waitFor(async () => expect((await look.projects()).map(p => p.id)).toEqual([a.id]), { timeout: 5000 })

    await app.cloudActions.openHome()
    app.cloudActions.open('delete')
    await app.cloudActions.deleteAccount()
    expect(app.useCloud.getState()).toMatchObject({ phase: 'signed-out', user: null, sheet: null, problem: null })
    // The project stays on this device.
    expect(app.projectsNow().list.map(m => m.id)).toContain(a.id)

    // Signing in again within the 30 days asks first: keep it, or sign out. Nothing syncs meanwhile.
    server.clock.now += 5 * 24 * 60 * 60 * 1000
    await app.cloudActions.signIn()
    let s = app.useCloud.getState()
    expect(s).toMatchObject({ phase: 'signed-in', sheet: 'deleting' })
    expect(s.user?.deleteAfter).toBeGreaterThan(server.clock.now)
    expect(await app.cloudActions.openHome()).toBe(true)
    expect(app.useCloud.getState().sheet).toBe('deleting')

    await app.cloudActions.keepAccount()
    s = app.useCloud.getState()
    // Saving again: what else is on this device is offered for upload, as on any sign-in.
    expect(s).toMatchObject({ phase: 'signed-in', problem: null })
    expect(s.sheet === null || s.sheet === 'upload').toBe(true)
    expect(s.inCloud).toEqual([a.id])
    expect(s.user?.deleteAfter).toBeNull()
    const account = await app.cloudActions.account()
    expect(account.deleteAfter).toBeNull()
    expect(account.storage.limit).toBe(50 * 1024 * 1024)
    expect(account.storage.used).toBeGreaterThan(0)
  })

  it('shows nothing where there is no cloud (GitHub Pages)', async () => {
    const app = await freshApp(async () => new Response('<!doctype html><title>404</title>', { status: 404, headers: { 'content-type': 'text/html' } }))
    await app.startCloud()
    expect(app.useCloud.getState().phase).toBe('unavailable')
    expect(await app.cloudActions.openHome()).toBe(false)
    expect(app.useCloud.getState().sheet).toBeNull()
  })

  it('carries on signed in while offline, if he was signed in here last', async () => {
    localStorage.setItem('cloud-user-v1', JSON.stringify({ id: 'u_1', name: 'Tester' }))
    const app = await freshApp(async () => Promise.reject(new TypeError('Failed to fetch')))
    await app.startCloud()
    expect(app.useCloud.getState()).toMatchObject({ phase: 'signed-in', user: { name: 'Tester' } })
    expect(app.useCloud.getState().sync.offline).toBe(true)
  })

  it('says plainly why an account couldn’t be made', async () => {
    const server = testServer({ SIGNUP: 'invite', INVITE_CODE: 'right-code' })
    const app = await freshApp(server.fetch)
    await app.startCloud()
    expect(app.useCloud.getState().signup).toBe('invite')
    await app.cloudActions.createAccount('Tester', 'wrong-code')
    expect(app.useCloud.getState()).toMatchObject({ phase: 'signed-out', busy: false })
    expect(app.useCloud.getState().problem).toMatch(/invite/i)
    await app.cloudActions.createAccount('Tester', 'right-code')
    expect(app.useCloud.getState()).toMatchObject({ phase: 'signed-in', sheet: 'code' })
  })

  it('stays quiet when he closes the passkey prompt', async () => {
    const { passkeyTrouble } = await vi.importActual<typeof import('../passkeys')>('../passkeys')
    expect(passkeyTrouble(Object.assign(new Error('The operation either timed out or was not allowed.'), { name: 'NotAllowedError' }))).toBeNull()
    expect(passkeyTrouble(new Error('That passkey isn’t one this account knows.'))).toBe('That passkey isn’t one this account knows.')
  })
})
