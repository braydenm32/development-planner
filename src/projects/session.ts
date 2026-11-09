import { useEffect } from 'react'
import { create } from 'zustand'
import type { SavedProject, ViewSettings } from '../lib/storage'
import { normalizePlan, type Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import type { PrintPrefs } from '../print/prefs'
import { legacySource, migrateLegacy } from './legacy'
import { createLocalProjectStore, type LocalProjectStore } from './localStore'
import { createMemoryProjectStore } from './memoryStore'
import { archiveProject, createFromProjectFile, deleteProject, duplicateProject, freeName, renameProject, restoreProject } from './ops'
import { withWriteQueue, type QueuedProjectStore } from './queue'
import { projectNumbers, projectThumbnail, type SiteForSummary } from './summary'
import { NotArchivedError, type MetaPatch, type ProjectChange, type ProjectMeta, type ProjectRecords, type ProjectStore } from './types'

/** Per-project choices: the last view and the print settings, and where the new layout was left. */
export interface ProjectPrefs {
  view?: Partial<ViewSettings>
  print?: Partial<PrintPrefs>
  /** The new layout's last area, tab, view and level, as its route hash (`#/design/plan?view=plan&level=…`). */
  place?: string
}

export interface OpenProject {
  id: string
  /** The survey record, as stored (null until a survey is imported). */
  survey: SavedProject | null
  /** The survey it replaced, kept so it can be put back (Replace survey). */
  previousSurvey?: SavedProject | null
  prefs: ProjectPrefs
}

/** The record that keeps the survey a Replace survey took the place of. */
export const PREVIOUS_SURVEY = 'previous-survey'

export interface ProjectsState {
  /** Projects have been read (and any old single project moved in). */
  ready: boolean
  /** Every project, most recently edited first. */
  list: ProjectMeta[]
  currentId: string | null
  /** The current project's records, once read. */
  opened: OpenProject | null
  /** The last save failed; changes are kept and retried with the next one. */
  saveError: string | null
  /** This browser won't keep anything: projects live in memory until the tab closes. */
  memoryOnly: boolean
}

const useProjectsStore = create<ProjectsState>(() => ({
  ready: false,
  list: [],
  currentId: null,
  opened: null,
  saveError: null,
  memoryOnly: false,
}))

/** The projects as they are now, outside React (after an await, say). */
export const projectsNow = () => useProjectsStore.getState()

let local: LocalProjectStore | null = null
let store: QueuedProjectStore = withWriteQueue(createMemoryProjectStore())

// ---------------------------------------------------------------------------
// Which project this browser has open; per device, so it lives in localStorage.

const CURRENT_KEY = 'current-project-v1'

function readPointer(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

function writePointer(id: string | null) {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id)
    else localStorage.removeItem(CURRENT_KEY)
  } catch {
    // per-device convenience only
  }
}

// ---------------------------------------------------------------------------
// Saving.

const set = useProjectsStore.setState
const get = useProjectsStore.getState

function upsert(meta: ProjectMeta) {
  const list = get().list.filter(m => m.id !== meta.id)
  list.push(meta)
  list.sort((a, b) => b.updated - a.updated || b.created - a.created)
  set({ list })
}

async function refresh() {
  set({ list: (await store.list()).filter(m => !doomed.has(m.id)) })
}

async function save(id: string, change: ProjectChange): Promise<void> {
  try {
    upsert(await store.save(id, change))
    if (get().saveError && store.unsaved().length === 0) set({ saveError: null })
  } catch (e) {
    if (!get().list.some(m => m.id === id)) return // deleted meanwhile; nothing to keep
    set({ saveError: (e as Error)?.message || 'The browser refused to save.' })
  }
}

// The plan autosaves 400 ms after it stops changing, to the project it belonged to when it changed.
let pendingPlan: { id: string; plan: Plan } | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let loading = false
let site: { id: string; site: SiteForSummary } | null = null

function summaryFor(id: string, plan: Plan | null): MetaPatch {
  const s = site?.id === id ? site.site : null
  const meta = get().list.find(m => m.id === id)
  const numbers = projectNumbers(s, plan)
  return {
    numbers: s ? numbers : { ...(meta?.numbers ?? numbers), floorArea: numbers.floorArea, ffl: numbers.ffl },
    ...(s ? { thumbnail: projectThumbnail(s, plan) } : {}),
  }
}

/** Save the plan edit that is waiting, now. */
export function flushPlan(): Promise<void> {
  clearTimeout(timer)
  const job = pendingPlan
  pendingPlan = null
  if (!job) return Promise.resolve()
  const name = job.plan.name?.trim()
  return save(job.id, { records: { plan: job.plan }, meta: { ...summaryFor(job.id, job.plan), ...(name ? { name } : {}) } })
}

usePlan.subscribe((state, prev) => {
  if (loading || state.plan === prev.plan || !state.plan) return
  const { currentId, list } = get()
  if (!currentId) return
  // One name for the project: a plan without one takes the project's.
  const name = list.find(m => m.id === currentId)?.name
  if (!state.plan.name?.trim() && name) {
    usePlan.setState({ plan: { ...state.plan, name } })
    return
  }
  if (pendingPlan && pendingPlan.id !== currentId) void flushPlan()
  pendingPlan = { id: currentId, plan: state.plan }
  clearTimeout(timer)
  timer = setTimeout(() => void flushPlan(), 400)
})

if (typeof window !== 'undefined') {
  const now = () => {
    void flushPlan()
    void store.flush()
  }
  window.addEventListener('pagehide', () => {
    now()
    void finishDelete()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') now()
  })
}

/** Put a project's plan in the editor without counting it as an edit. */
function loadIntoEditor(blob: unknown, name: string) {
  const p = blob as Plan | undefined
  const plan = p && p.version === 1 && Array.isArray(p.walls) ? { ...normalizePlan(p), name } : null
  loading = true
  try {
    usePlan.getState().load(plan)
  } finally {
    loading = false
  }
}

// ---------------------------------------------------------------------------
// Records of a feature's own (see RecordKind in types.ts).

const kinds = new Map<string, (value: unknown) => void>()

function loadKinds(records: ProjectRecords | null) {
  for (const [kind, load] of kinds) load(records?.[kind])
}

/**
 * Keep a feature's own record with each project, beside the survey and the plan. `load` gets the
 * record each time a project opens (undefined for one without it, and when none is open); the
 * function returned saves a new value to the project open now. Duplicate, delete and the
 * revision come with it, since the store keeps every kind the same way.
 */
export function registerRecordKind<T>(
  kind: string,
  load: (value: T | undefined) => void,
  /** `touch: false` for a record of choices rather than content (tool defaults, say): saving it doesn't count as an edit. */
  opts: { touch?: boolean } = {},
): (value: T, id?: string) => Promise<void> {
  if (['survey', 'plan', 'prefs'].includes(kind)) throw new Error(`"${kind}" is the app's own record kind.`)
  kinds.set(kind, load as (value: unknown) => void)
  const id = get().currentId
  if (id)
    void store.read(id, [kind]).then(
      r => get().currentId === id && load(r?.[kind] as T | undefined),
      () => {},
    )
  // `id` names the project the value belongs to, for a save that waited (debounced) while another opened.
  return (value, id) => {
    const to = id ?? get().currentId
    return to ? save(to, { records: { [kind]: value }, ...(opts.touch === false ? { touch: false } : {}) }) : Promise.resolve()
  }
}

// ---------------------------------------------------------------------------
// Start-up.

let booting: Promise<void> | null = null

async function boot() {
  try {
    local = createLocalProjectStore()
    const queued = withWriteQueue(watched(local))
    await queued.list() // throws if IndexedDB is unavailable
    store = queued
  } catch {
    local = null
    set({ memoryOnly: true })
  }
  if (local) {
    try {
      const migrated = await migrateLegacy(store, local, legacySource())
      if (migrated && !readPointer()) writePointer(migrated.projectId)
    } catch (e) {
      // The old survey and plan stay where they were, and the move is tried again next load.
      set({ saveError: `Your saved project couldn’t be moved into Projects yet (${(e as Error)?.message || 'storage error'}). It’s still saved; reload to try again.` })
    }
  }
  const list = (await store.list()).filter(m => !doomed.has(m.id))
  set({ list })
  const pointer = readPointer()
  const current = list.find(m => m.id === pointer && !m.archived)
  try {
    if (current) await openProject(current.id)
  } catch {
    // It can't be read: the Projects home shows instead, with every project still listed.
  }
  set({ ready: true })
}

export function ensureProjects(): Promise<void> {
  booting ??= boot()
  return booting
}

// ---------------------------------------------------------------------------
// What the app and the Projects home can do.

export async function openProject(id: string): Promise<void> {
  await flushPlan()
  // Cloud sync brings it up to date first, when it can (it gives up quickly offline).
  if (beforeOpen && !reloading) await beforeOpen(id).catch(() => {})
  const [meta, records] = await Promise.all([store.get(id), store.read(id)])
  if (!meta || !records) throw new Error('That project is no longer here.')
  loadIntoEditor(records.plan, meta.name)
  upsert(meta)
  set({
    currentId: id,
    opened: {
      id,
      survey: (records.survey as SavedProject | undefined) ?? null,
      previousSurvey: (records[PREVIOUS_SURVEY] as SavedProject | undefined) ?? null,
      prefs: (records.prefs as ProjectPrefs | undefined) ?? {},
    },
  })
  loadKinds(records)
  writePointer(id)
}

/** Leave the current project (for example when it's archived): nothing is open afterwards. */
async function closeProject() {
  await flushPlan()
  loadIntoEditor(null, '')
  set({ currentId: null, opened: null })
  loadKinds(null)
  writePointer(null)
}

/** A new project, opened straight away. Without a survey, the start screen asks for one. */
export async function createProject(records: ProjectRecords = {}): Promise<ProjectMeta> {
  const survey = records.survey as SavedProject | undefined
  const name = await freeName(store, get().list.length ? 'New house' : 'My house')
  const meta = await store.create({ name, records, meta: { surveyFileName: survey?.fileName ?? null } })
  await refresh()
  await openProject(meta.id)
  return meta
}

/** A project file (.json) becomes a new project, opened straight away; it never overwrites one. */
export async function openProjectFile(text: string): Promise<ProjectMeta> {
  const meta = await createFromProjectFile(store, text)
  await refresh()
  await openProject(meta.id)
  return meta
}

export async function duplicate(id: string): Promise<ProjectMeta> {
  if (id === get().currentId) await flushPlan()
  const meta = await duplicateProject(store, id)
  await refresh()
  return meta
}

export async function rename(id: string, name: string): Promise<void> {
  upsert(await renameProject(store, id, name))
  const plan = usePlan.getState().plan
  // The open plan carries the same name (title blocks, file names); this saves it too.
  if (id === get().currentId && plan) usePlan.setState({ plan: { ...plan, name: name.trim() } })
}

export async function archive(id: string): Promise<void> {
  if (id === get().currentId) await closeProject()
  upsert(await archiveProject(store, id))
}

export async function restore(id: string): Promise<void> {
  upsert(await restoreProject(store, id))
}

export async function deleteForGood(id: string): Promise<void> {
  doomed.delete(id)
  await deleteProject(store, id)
  set({ list: get().list.filter(m => m.id !== id) })
}

// Delete for good, with a moment to undo: the project leaves the list straight away, and is
// removed from storage only when that moment is over (or the page closes). Undo puts it back
// exactly as it was, since nothing was touched.
const doomed = new Map<string, ProjectMeta>()

/** Take an archived project off the list, to delete for good when `finishDelete` runs. Returns Undo. */
export function deleteSoon(id: string): () => void {
  const meta = get().list.find(m => m.id === id)
  if (!meta) throw new Error('That project is no longer here.')
  if (!meta.archived) throw new NotArchivedError()
  doomed.set(id, meta)
  set({ list: get().list.filter(m => m.id !== id) })
  return () => {
    if (!doomed.delete(id)) return
    upsert(meta)
  }
}

/** Delete for good the projects waiting on `deleteSoon` (one, or all). */
export async function finishDelete(id?: string): Promise<void> {
  for (const d of id ? [id] : [...doomed.keys()]) if (doomed.has(d)) await deleteForGood(d)
}

/** Records of any project, for the delete review and the project-file download. */
export const readProject = (id: string) => store.read(id)

/**
 * Replace the current project's survey (an import, or a layer role change). `previous`, when
 * given, is kept as the survey it replaced (null forgets it).
 */
export function saveSurvey(survey: SavedProject, previous?: SavedProject | null): Promise<void> {
  const { opened } = get()
  if (!opened) return Promise.resolve()
  set({ opened: { ...opened, survey, ...(previous !== undefined ? { previousSurvey: previous } : {}) } })
  return save(opened.id, {
    records: { survey, ...(previous !== undefined ? { [PREVIOUS_SURVEY]: previous } : {}) },
    meta: { surveyFileName: survey.fileName },
  })
}

export function savePrefs(patch: ProjectPrefs): Promise<void> {
  const { opened } = get()
  if (!opened) return Promise.resolve()
  const prefs = { ...opened.prefs, ...patch }
  set({ opened: { ...opened, prefs } })
  return save(opened.id, { records: { prefs }, touch: false })
}

/**
 * Tell the projects which site the open project has, once the app has built it, so the card's
 * numbers and thumbnail match what the app shows. Call it from where the site is built.
 */
export function useProjectSite(summary: SiteForSummary | null) {
  const id = useProjectsStore(s => s.currentId)
  useEffect(() => {
    if (!id || !summary) return
    site = { id, site: summary }
    const meta = get().list.find(m => m.id === id)
    const plan = usePlan.getState().plan
    const next = summaryFor(id, plan)
    if (meta && JSON.stringify({ n: meta.numbers, t: meta.thumbnail }) !== JSON.stringify({ n: next.numbers, t: next.thumbnail })) {
      void save(id, { meta: next, touch: false })
    }
  }, [id, summary])
}

export const projectActions = {
  open: openProject,
  create: createProject,
  openFile: openProjectFile,
  duplicate,
  rename,
  archive,
  restore,
  deleteForGood,
  deleteSoon,
  finishDelete,
  read: readProject,
  saveSurvey,
  savePrefs,
  flush: async () => {
    await flushPlan()
    await store.flush()
  },
}

// ---------------------------------------------------------------------------
// Cloud sync (src/cloud) works beside the session: it hears about every write to this browser's
// store, writes what it downloads straight there, and asks the session to show it. Nothing here
// talks to a server.

/** A write to this browser's store, through the session. `kinds`: the records a save wrote. */
export interface StoreWrite {
  op: 'create' | 'save' | 'remove'
  id: string
  kinds?: string[]
}

const watchers = new Set<(w: StoreWrite) => void>()

function tell(w: StoreWrite) {
  for (const f of watchers) {
    try {
      f(w)
    } catch {
      // a watcher's trouble is its own
    }
  }
}

/** The local store, telling the watchers once each write has landed. */
function watched(s: LocalProjectStore): ProjectStore {
  return {
    ...s,
    create: async init => {
      const meta = await s.create(init)
      tell({ op: 'create', id: meta.id })
      return meta
    },
    save: async (id, change) => {
      const meta = await s.save(id, change)
      tell({ op: 'save', id, kinds: Object.keys(change.records ?? {}) })
      return meta
    },
    remove: async id => {
      await s.remove(id)
      tell({ op: 'remove', id })
    },
  }
}

let beforeOpen: ((id: string) => Promise<void>) | null = null
let reloading = false

export const projectSync = {
  /** This browser's store (null until started, or when the browser won't save). */
  local: () => local,
  /** Hear about every write made through the session. Returns the way to stop. */
  watch(fn: (w: StoreWrite) => void): () => void {
    watchers.add(fn)
    return () => void watchers.delete(fn)
  },
  /** Run before a project opens, to bring it up to date (null stops it). */
  beforeOpen(fn: ((id: string) => Promise<void>) | null) {
    beforeOpen = fn
  },
  openId: () => get().currentId,
  /** An edit is waiting to be written to this project (the plan's short wait). */
  pending: (id: string) => pendingPlan?.id === id,
  flush: () => projectActions.flush(),
  /**
   * Cloud sync wrote these projects (or removed these) straight to the store: show them. An open
   * project it replaced goes back in the editor, unless an edit is waiting there: then the editor
   * keeps what it has and this returns false, so sync treats the edit as made on the old copy.
   */
  async landed(changed: string[], removed: string[] = []): Promise<boolean> {
    await refresh()
    const cur = get().currentId
    if (cur && removed.includes(cur)) await closeProject()
    if (!cur || !changed.includes(cur)) return true
    if (pendingPlan?.id === cur) return false
    reloading = true
    try {
      await openProject(cur)
    } finally {
      reloading = false
    }
    return true
  },
}

/**
 * The projects, for the Projects home, the project menu and the app. Reading it starts the
 * store (and the one-off move of an older single project) on first use.
 */
export function useProjects() {
  const state = useProjectsStore()
  useEffect(() => {
    void ensureProjects()
  }, [])
  const current = state.list.find(m => m.id === state.currentId) ?? null
  return { ...state, current, ...projectActions }
}
