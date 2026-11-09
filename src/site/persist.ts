// Site features are kept with each project, as two records beside its survey and plan:
//
//   site        the features, edits, drawings' line-ups and settings, saved as they change
//   site-files  the drawings' pictures and line work, and the second DXF: large, so written
//               only when one is added, or let go once nothing can bring it back
//
// Duplicate copies them, delete removes them, and a project file opened as a new project
// brings its own (src/projects/ops.ts). Before projects, this browser held one set, in
// IndexedDB under site-v1, site-overlay-image-<id>, site-overlay-vector-<id> and
// site-extra-dxf; the first project to open without a site record takes them, once.

import { delMany, get, getMany, keys, type UseStore } from 'idb-keyval'
import { projectActions, projectsNow, registerRecordKind } from '../projects/session'
import type { VectorPage } from './pdfVector'
import {
  blobToDataUrl,
  emptySiteData,
  emptySiteFiles,
  normalizeSiteData,
  normalizeSiteFiles,
  openSite,
  SITE_FILES_KIND,
  SITE_KIND,
  unusedDrawings,
  useSiteStore,
  type SiteData,
  type SiteFiles,
  type SiteRecord,
} from './store'

/** The keys site features used before projects, in idb-keyval's default database. */
export const LEGACY_SITE_KEYS = {
  data: 'site-v1',
  extraDxf: 'site-extra-dxf',
  image: (id: string) => `site-overlay-image-${id}`,
  vector: (id: string) => `site-overlay-vector-${id}`,
}

const SAVE_DELAY = 400

let started = false
/** Which project the store's data and files came from (null: none open, or not yet read). */
let dataFor: string | null = null
let filesFor: string | null = null
/** Set while a project's site features are put in place, so that isn't saved back as an edit. */
let applying = false
let saveData: (v: SiteRecord) => Promise<void> = () => Promise.resolve()
let saveFiles: (v: SiteFiles) => Promise<void> = () => Promise.resolve()
let pending: { id: string; data: SiteData } | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let legacyChecked = false

function apply(data: SiteData, files: SiteFiles) {
  applying = true
  try {
    openSite(data, files)
  } finally {
    applying = false
  }
}

/** Save the waiting edit now, if its project is still the one open (a save always goes to the open one). */
function flush(): Promise<void> {
  clearTimeout(timer)
  const job = pending
  pending = null
  if (!job || projectsNow().currentId !== job.id) return Promise.resolve()
  return saveData({ version: 1, data: job.data })
}

/** Both records of the open project are in: let go of drawing files nothing can bring back. */
function tidy() {
  const id = projectsNow().currentId
  if (!id || dataFor !== id || filesFor !== id) return
  const s = useSiteStore.getState()
  const gone = unusedDrawings(s.data, s.files)
  if (!gone.length) return
  const drawings = { ...s.files.drawings }
  for (const k of gone) delete drawings[k]
  applying = true
  try {
    useSiteStore.setState({ files: { ...s.files, drawings } })
  } finally {
    applying = false
  }
  void saveFiles({ ...s.files, drawings })
}

function loadData(value: SiteRecord | undefined) {
  void flush()
  const id = projectsNow().currentId
  dataFor = null
  if (!id) {
    apply(emptySiteData(), emptySiteFiles())
    return
  }
  if (value === undefined && !legacyChecked) {
    // Not shown until we know whether the old single set of features belongs here.
    useSiteStore.setState({ loaded: false })
    void moveLegacyInto(id)
    return
  }
  const s = useSiteStore.getState()
  apply(normalizeSiteData(value?.data), filesFor === id ? s.files : emptySiteFiles())
  dataFor = id
  tidy()
}

function loadFiles(value: SiteFiles | undefined) {
  const id = projectsNow().currentId
  const files = normalizeSiteFiles(value)
  const s = useSiteStore.getState()
  filesFor = id
  if (!id) return
  // The data may already be in for this project: keep it, and its undo history, as it is.
  if (dataFor === id) {
    const images: Record<string, string> = {}
    const vectors: Record<string, VectorPage> = {}
    for (const [k, d] of Object.entries(files.drawings)) {
      images[k] = d.image
      if (d.vector) vectors[k] = d.vector
    }
    applying = true
    try {
      useSiteStore.setState({ files, images, vectors, extraDxfText: s.data.extraDxf ? files.extraDxfText : null })
    } finally {
      applying = false
    }
    tidy()
  } else {
    applying = true
    try {
      useSiteStore.setState({ files })
    } finally {
      applying = false
    }
  }
}

/** Read the old single set of site features; null when there is none. */
export async function readLegacySite(db?: UseStore): Promise<{ data: SiteData; files: SiteFiles } | null> {
  const raw = await get(LEGACY_SITE_KEYS.data, db)
  if (raw === undefined) return null
  const data = normalizeSiteData(raw)
  const files = emptySiteFiles()
  if (data.extraDxf) files.extraDxfText = (await get<string>(LEGACY_SITE_KEYS.extraDxf, db)) ?? null
  for (const o of data.overlays) {
    const [image, vector] = await getMany<unknown>([LEGACY_SITE_KEYS.image(o.id), LEGACY_SITE_KEYS.vector(o.id)], db)
    if (!(image instanceof Blob)) continue
    files.drawings[o.id] = { image: await blobToDataUrl(image), ...(vector ? { vector: vector as VectorPage } : {}) }
  }
  return { data, files: normalizeSiteFiles(files) }
}

/** Remove the old keys, the drawings' files with them. */
export async function clearLegacySite(db?: UseStore): Promise<void> {
  const old = (await keys(db)).filter(k => typeof k === 'string' && (k === LEGACY_SITE_KEYS.data || k === LEGACY_SITE_KEYS.extraDxf || /^site-overlay-(?:image|vector)-/.test(k)))
  await delMany(old, db)
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * The one-off move: the old site features become the open project's `site` and `site-files`
 * records. They are read back before the old keys go; if that fails, the old keys stay.
 */
async function moveLegacyInto(id: string) {
  legacyChecked = true
  let old: { data: SiteData; files: SiteFiles } | null = null
  try {
    old = await readLegacySite()
  } catch {
    old = null
  }
  if (projectsNow().currentId !== id) return // another project opened meanwhile; it loads its own
  if (!old) {
    apply(emptySiteData(), filesFor === id ? useSiteStore.getState().files : emptySiteFiles())
    dataFor = id
    tidy()
    return
  }
  try {
    await saveFiles(old.files)
    await saveData({ version: 1, data: old.data })
    await projectActions.flush()
    const back = await projectActions.read(id)
    if (back && same((back[SITE_KIND] as SiteRecord | undefined)?.data, old.data) && same(back[SITE_FILES_KIND], old.files)) await clearLegacySite()
  } catch {
    // The old keys stay, and the features still show from them for this session.
  }
  if (projectsNow().currentId !== id) return
  apply(old.data, old.files)
  dataFor = id
  filesFor = id
}

/** Keep site features with each project. Call once the app starts; later calls do nothing. */
export function startSiteRecords() {
  if (started) return
  started = true
  saveFiles = registerRecordKind<SiteFiles>(SITE_FILES_KIND, loadFiles)
  saveData = registerRecordKind<SiteRecord>(SITE_KIND, loadData)

  useSiteStore.subscribe((state, prev) => {
    if (applying || !state.loaded) return
    const id = projectsNow().currentId
    if (!id) return
    if (state.files !== prev.files) {
      // A drawing or a DXF added: written now, without waiting.
      void saveFiles(state.files)
    }
    if (state.data !== prev.data) {
      if (pending && pending.id !== id) void flush()
      pending = { id, data: state.data }
      clearTimeout(timer)
      timer = setTimeout(() => void flush(), SAVE_DELAY)
    }
  })

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => void flush())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush()
    })
  }
}

