// Cloud saves, for the app: whether this copy of the app has a cloud (the Cloudflare Worker does,
// GitHub Pages doesn't), who is signed in, how saving is going, and what to show. Nothing is sent
// anywhere until he signs in; before that the app only asks "is there a cloud here?".

import { create } from 'zustand'
import { PROJECTS } from '../nav/route'
import { navigate } from '../nav/router'
import { ensureProjects, projectSync } from '../projects/session'
import type { ProjectMeta } from '../projects/types'
import { showToast } from '../safety/store'
import { createCloudApi, isOffline, type CloudApi, type CloudUser, type Signup } from './api'
import { createCloudProjectStore } from './cloudStore'
import { makePasskey, passkeyTrouble, getPasskey } from './passkeys'
import { createSync, type Sync, type SyncNotice, type SyncState } from './sync'
import { longDate, noticeText } from './words'

export type CloudPhase = 'checking' | 'unavailable' | 'signed-out' | 'signed-in'
export type CloudSheet = 'sign-in' | 'create' | 'recover' | 'code' | 'upload' | 'account' | 'delete' | 'deleting'

export interface CloudState {
  phase: CloudPhase
  signup: Signup
  user: CloudUser | null
  sync: SyncState
  notices: SyncNotice[]
  /** On this device only: never asked about (offered for upload), and kept here by choice. */
  waiting: ProjectMeta[]
  kept: ProjectMeta[]
  inCloud: string[]
  sheet: CloudSheet | null
  /** A recovery code to keep, shown once. */
  code: { value: string; first: boolean } | null
  /** A passkey step is running. */
  busy: boolean
  /** What went wrong in the open sheet, in plain words. */
  problem: string | null
}

const IDLE: SyncState = { busy: 0, offline: false, signedOut: false, error: null, lastSynced: null }

export const useCloud = create<CloudState>(() => ({
  phase: 'checking',
  signup: 'closed',
  user: null,
  sync: IDLE,
  notices: [],
  waiting: [],
  kept: [],
  inCloud: [],
  sheet: null,
  code: null,
  busy: false,
  problem: null,
}))

const set = useCloud.setState
const get = useCloud.getState

/** Whether this project is in the cloud (so deleting it for good takes it from there too). */
export const useInCloud = (id: string) => useCloud(s => s.phase === 'signed-in' && s.inCloud.includes(id))

let api: CloudApi = createCloudApi()
let sync: Sync | null = null

// Who was signed in here last, so the app knows while offline. The session itself is an
// HttpOnly cookie the app never sees; this is only a name to show.
const HINT = 'cloud-user-v1'
function hint(): CloudUser | null {
  try {
    return JSON.parse(localStorage.getItem(HINT) ?? 'null') as CloudUser | null
  } catch {
    return null
  }
}
function setHint(u: CloudUser | null) {
  try {
    if (u) localStorage.setItem(HINT, JSON.stringify(u))
    else localStorage.removeItem(HINT)
  } catch {
    // a convenience only
  }
}

/** For tests: talk to another API. */
export function setCloudApi(next: CloudApi) {
  api = next
}

// ---------------------------------------------------------------------------
// Starting up.

let starting: Promise<void> | null = null

/** Find out whether there is a cloud here and who is signed in. Runs once. */
export function startCloud(): Promise<void> {
  starting ??= (async () => {
    await ensureProjects()
    // A browser that won't keep anything (some private windows) has nothing to sync from.
    if (!projectSync.local()) return void set({ phase: 'unavailable' })
    let health
    try {
      health = await api.health()
    } catch (e) {
      // Offline now: if he was signed in here, carry on as signed in and sync when back.
      const was = hint()
      if (isOffline(e) && was) {
        set({ phase: 'signed-in', user: was })
        if (was.deleteAfter) set({ sheet: 'deleting' })
        else await begin(was)
      } else set({ phase: 'unavailable' })
      return
    }
    if (!health) return void set({ phase: 'unavailable' })
    set({ signup: health.signup })
    const user = await api.session().catch(() => null)
    if (!user) {
      setHint(null)
      return void set({ phase: 'signed-out' })
    }
    await signedIn(user)
  })()
  return starting
}

async function refreshLists() {
  if (!sync) return
  const [{ waiting, kept }, inCloud] = await Promise.all([sync.localOnly(), sync.inCloud()])
  set({ waiting, kept, inCloud: [...inCloud] })
}

/** The Projects home, to see both copies after a conflict. */
function toProjects() {
  navigate(PROJECTS)
}

function heard(n: SyncNotice) {
  set({ notices: [n, ...get().notices].slice(0, 20) })
  if (n.kind === 'conflict') showToast({ text: noticeText(n), link: { label: 'See both', go: toProjects }, ms: 15000 })
  else if (n.kind === 'kept-edited' || n.kind === 'kept-changed') showToast({ text: noticeText(n) })
  void refreshLists()
}

async function begin(user: CloudUser) {
  sync?.stop()
  const local = projectSync.local()
  if (!local) return
  sync = createSync({
    local,
    cloud: createCloudProjectStore(api),
    userId: user.id,
    host: projectSync,
    onState: s => {
      set({ sync: s })
      if (!s.busy) void refreshLists()
    },
    onNotice: heard,
  })
  await sync.syncNow()
  await refreshLists()
}

async function signedIn(user: CloudUser, opts: { offerUpload?: boolean } = {}) {
  setHint(user)
  set({ phase: 'signed-in', user, problem: null })
  // An account waiting to be deleted saves nothing: first, keep it or sign out.
  if (user.deleteAfter) {
    sync?.stop()
    sync = null
    return void set({ sheet: 'deleting' })
  }
  await begin(user)
  // Projects made here before signing in: ask before any of them goes up.
  if ((opts.offerUpload ?? true) && get().waiting.length && !get().sheet) set({ sheet: 'upload' })
}

// ---------------------------------------------------------------------------
// What the sheets and menus do.

/** Run a passkey step: busy while it runs, a plain problem if it fails, quiet if he closed the prompt. */
async function step<T>(fn: () => Promise<T>): Promise<T | null> {
  set({ busy: true, problem: null })
  try {
    return await fn()
  } catch (e) {
    set({ problem: isOffline(e) ? 'You’re offline. Try again when you’re back online.' : passkeyTrouble(e) })
    return null
  } finally {
    set({ busy: false })
  }
}

/** Forget the account on this device (its projects stay). */
function signedOutHere() {
  sync?.stop()
  sync = null
  setHint(null)
  set({ phase: 'signed-out', user: null, sync: IDLE, sheet: null, waiting: [], kept: [], inCloud: [], notices: [] })
}

export const cloudActions = {
  open(sheet: CloudSheet) {
    set({ sheet, problem: null })
  },
  /** The project menu's and ⌘K's way in: sign in, or the account when signed in. False when there's no cloud here. */
  async openHome(): Promise<boolean> {
    await startCloud()
    const { phase } = get()
    if (phase === 'signed-in') set({ sheet: get().user?.deleteAfter ? 'deleting' : 'account', problem: null })
    else if (phase === 'signed-out') set({ sheet: 'sign-in', problem: null })
    return phase === 'signed-in' || phase === 'signed-out'
  },
  close() {
    const wasCode = get().sheet === 'code'
    set({ sheet: null, problem: null, ...(wasCode ? { code: null } : {}) })
    // After keeping a new account's code, offer the upload.
    if (wasCode && get().waiting.length) set({ sheet: 'upload' })
  },

  async signIn() {
    const done = await step(async () => {
      const o = await api.loginOptions()
      return api.loginVerify(o.challengeId, await getPasskey(o.options))
    })
    if (!done) return
    set({ sheet: null })
    await signedIn(done.user)
  },

  async createAccount(name: string, invite?: string) {
    const done = await step(async () => {
      const o = await api.signupOptions(name, invite)
      return api.signupVerify(o.challengeId, await makePasskey(o.options), invite)
    })
    if (!done) return
    set({ sheet: 'code', code: { value: done.recoveryCode, first: true }, signup: 'closed' })
    await signedIn(done.user, { offerUpload: false })
  },

  async recover(code: string) {
    const done = await step(async () => {
      const o = await api.recoverOptions(code)
      return api.recoverVerify(o.challengeId, await makePasskey(o.options))
    })
    if (!done) return
    set({ sheet: 'code', code: { value: done.recoveryCode, first: false } })
    await signedIn(done.user, { offerUpload: false })
  },

  async addPasskey() {
    const done = await step(async () => {
      const o = await api.passkeyOptions()
      await api.passkeyVerify(o.challengeId, await makePasskey(o.options))
      return true
    })
    if (done) showToast({ text: 'Passkey added. You can sign in with it on this device now.' })
  },

  async newRecoveryCode() {
    const value = await step(() => api.newRecoveryCode())
    if (value) set({ sheet: 'code', code: { value, first: false } })
  },

  account: () => api.account(),

  async signOut() {
    const done = await step(async () => {
      // Send what is waiting first, if it can go quickly; it stays on this device either way.
      await Promise.race([sync?.flush(), new Promise(r => setTimeout(r, 3000))])
      await api.logout()
      return true
    })
    if (!done) return
    signedOutHere()
    showToast({ text: 'Signed out. Your projects are still on this device.' })
  },

  /** Ask for the account to be deleted, 30 days from now: signed out everywhere, this device too. */
  async deleteAccount() {
    const deleteAfter = await step(() => api.deleteAccount())
    if (deleteAfter === null) return
    signedOutHere()
    showToast({ text: `Your account will be deleted on ${longDate(deleteAfter)}. Sign in before then to keep it. Your projects are still on this device.`, ms: 15000 })
  },

  /** Keep an account that was waiting to be deleted, and start saving again. */
  async keepAccount() {
    const user = await step(() => api.keepAccount())
    if (!user) return
    set({ sheet: null })
    await signedIn(user)
    showToast({ text: 'Your account is kept, and saving to the cloud has started again.' })
  },

  /** Bring everything up to date both ways (the chip's Sync now, and when the page comes back). */
  async syncNow(opts: { leaveOpen?: boolean } = {}) {
    if (!sync) return
    await sync.syncNow(opts)
    await refreshLists()
  },

  /** The upload review's answer: these go up, the rest stay on this device (and aren't asked about again). */
  async upload(ids: string[], keep: string[] = []) {
    if (!sync) return
    await sync.upload(ids)
    if (keep.length) await sync.keepHere(keep)
    set({ sheet: null })
    await refreshLists()
    if (ids.length) showToast({ text: ids.length === 1 ? 'Uploading 1 project. It stays on this device too.' : `Uploading ${ids.length} projects. They stay on this device too.` })
  },

  /**
   * Put a project in the cloud now and wait for it to land (a share link needs it there): it
   * goes up if it was on this device only, and anything waiting is sent. False when it couldn't
   * go (offline, say); it is then sent when it can be.
   */
  async putInCloud(id: string): Promise<boolean> {
    if (!sync) return false
    if (!get().inCloud.includes(id)) await sync.upload([id])
    await sync.flush()
    await refreshLists()
    const s = sync.state()
    return get().inCloud.includes(id) && !s.offline && !s.error && !s.signedOut
  },

  /** Send what's waiting to the cloud now and wait for it (⌘S). True when the cloud has it all. */
  async flush(): Promise<boolean> {
    if (!sync) return false
    await sync.flush()
    const s = sync.state()
    return !s.offline && !s.error && !s.signedOut && !s.busy
  },

  /** Keep these on this device only (the review's "Not now", or a card's choice). */
  async keepHere(ids: string[]) {
    if (!sync) return
    await sync.keepHere(ids)
    set({ sheet: null })
    await refreshLists()
  },

  dismissNotices() {
    set({ notices: [] })
  },
}

// Back online, or back to the page: catch up. Not from under the editor while he is working.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void cloudActions.syncNow({ leaveOpen: true }))
  let hiddenAt = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      void sync?.flush()
    } else if (hiddenAt && Date.now() - hiddenAt > 5000) void cloudActions.syncNow()
  })
}
