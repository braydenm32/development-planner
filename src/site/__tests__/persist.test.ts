import 'fake-indexeddb/auto'
import { get, keys, set } from 'idb-keyval'
import { describe, expect, it } from 'vitest'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { describeContents } from '../../projects/ops'
import { ensureProjects, projectActions, projectsNow } from '../../projects/session'
import { parseProjectFile, projectFileText } from '../../share/project'
import type { SiteFeature } from '../model'
import { LEGACY_SITE_KEYS, startSiteRecords } from '../persist'
import { addFeatures, emptySiteData, projectSiteFromRecords, siteForProject, SITE_FILES_KIND, SITE_KIND, storeOverlayFiles, useSiteStore, type Overlay, type SiteData } from '../store'

// Site features kept with each project, through the same session the app uses. Synthetic data only.

const survey = (name: string) => ({ fileName: `${name}.dxf`, dxfText: planeSurvey(), roles: {} })
const tree = (id: string, at: [number, number]): SiteFeature => ({ id, type: 'tree', source: 'trace', label: id.toUpperCase(), geom: { kind: 'point', at }, trunk: 0.4, canopy: 6, height: 8 })
const overlay = (id: string, include: boolean): Overlay => ({
  id,
  name: 'site-plan.pdf',
  kind: 'pdf',
  page: 1,
  width: 842,
  height: 595,
  pxPerUnit: 2,
  scale: 200,
  transform: [0.07, 0, 0, 0.07, 1000, 2000],
  aligned: true,
  opacity: 0.6,
  visible: true,
  locked: false,
  include,
  vector: true,
  added: [],
})
const PNG = 'data:image/png;base64,iVBORw0KGgo='
const vector = { width: 842, height: 595, texts: [], paths: [], imageCover: 0 }

/** Wait until the open project's site features have been read (or moved in). */
async function settled() {
  for (let i = 0; i < 200; i++) {
    if (useSiteStore.getState().loaded) return
    await new Promise(r => setTimeout(r, 10))
  }
  throw new Error('site features never loaded')
}

/** Past the save delay, and through the write queue. */
async function saved() {
  await new Promise(r => setTimeout(r, 450))
  await projectActions.flush()
}

const ids = (d: SiteData) => d.features.map(f => f.id)
const siteOf = async (id: string) => ((await projectActions.read(id)) ?? {})[SITE_KIND] as { data: SiteData }
const drawingsOf = async (id: string) => ((await projectActions.read(id)) ?? {})[SITE_FILES_KIND] as { drawings: object }

describe('site features with each project', () => {
  it('moves the old single set into the first project, once, and removes the old keys after reading it back', async () => {
    const old: SiteData = { ...emptySiteData(), features: [tree('t1', [1010, 2010])], overlays: [overlay('o1', true)], extraDxf: { fileName: 'trees.dxf', roles: {} } }
    await set(LEGACY_SITE_KEYS.data, old)
    await set(LEGACY_SITE_KEYS.image('o1'), new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }))
    await set(LEGACY_SITE_KEYS.vector('o1'), vector)
    await set(LEGACY_SITE_KEYS.extraDxf, '0\nEOF\n')
    // a drawing removed before projects: its files go too
    await set(LEGACY_SITE_KEYS.image('gone'), new Blob(['x']))

    await ensureProjects()
    startSiteRecords()
    const a = await projectActions.create({ survey: survey('a') })
    await settled()
    // let the move finish (it reads back before it clears)
    for (let i = 0; i < 100 && (await get(LEGACY_SITE_KEYS.data)) !== undefined; i++) await new Promise(r => setTimeout(r, 10))

    const s = useSiteStore.getState()
    expect(ids(s.data)).toEqual(['t1'])
    expect(s.files.drawings.o1.image).toMatch(/^data:image\/png;base64,/)
    expect(s.files.drawings.o1.vector).toEqual(vector)
    expect(s.extraDxfText).toBe('0\nEOF\n')
    expect(s.images.o1).toBe(s.files.drawings.o1.image)

    expect((await siteOf(a.id)).data).toEqual(s.data)
    expect((await projectActions.read(a.id))?.[SITE_FILES_KIND]).toEqual(s.files)
    expect((await keys()).filter(k => String(k).startsWith('site-'))).toEqual([])
  })

  it('keeps each project its own features, saves edits to the one open, and copies them with Duplicate', async () => {
    const a = projectsNow().currentId!
    const b = await projectActions.create({ survey: survey('b') })
    await settled()
    expect(ids(useSiteStore.getState().data)).toEqual([])
    expect(useSiteStore.getState().files.drawings).toEqual({})

    addFeatures([tree('t2', [1020, 2020])])
    await saved()
    expect(ids((await siteOf(b.id)).data)).toEqual(['t2'])

    await projectActions.open(a)
    await settled()
    expect(ids(useSiteStore.getState().data)).toEqual(['t1'])
    // opening isn't an edit: nothing to undo, and project A isn't saved again
    expect(useSiteStore.getState().past).toEqual([])

    await projectActions.open(b.id)
    await settled()
    expect(ids(useSiteStore.getState().data)).toEqual(['t2'])

    const copy = await projectActions.duplicate(b.id)
    expect(ids((await siteOf(copy.id)).data)).toEqual(['t2'])
    // and Delete's review says what goes
    const meta = projectsNow().list.find(m => m.id === copy.id)!
    expect(describeContents(meta, await projectActions.read(copy.id))).toContain('Its site features: 1 traced or read feature')
  })

  it('keeps a drawing’s picture with the project, and lets it go once nothing can bring it back', async () => {
    const id = projectsNow().currentId!
    useSiteStore.getState().commit(d => ({ ...d, overlays: [overlay('o2', false)] }))
    await storeOverlayFiles('o2', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), null)
    await saved()
    expect(Object.keys((await drawingsOf(id)).drawings)).toEqual(['o2'])

    // Removed: Undo could still bring it back, so the picture stays until the project opens again.
    useSiteStore.getState().commit(d => ({ ...d, overlays: [] }))
    await saved()
    expect(Object.keys((await drawingsOf(id)).drawings)).toEqual(['o2'])
    await projectActions.open(id)
    await settled()
    await saved()
    expect((await drawingsOf(id)).drawings).toEqual({})
  })

  it('opens a shared project file as a new project with its site features and the drawings sent with it', async () => {
    const before = projectsNow().currentId
    const data: SiteData = { ...emptySiteData(), features: [tree('t9', [1030, 2030])], overlays: [overlay('o9', true), overlay('o8', false)] }
    const text = projectFileText(survey('shared'), garageFloor(), { data, drawings: { o9: { image: PNG, vector } } })
    const meta = await projectActions.openFile(text)
    await settled()
    expect(projectsNow().currentId).toBe(meta.id)
    expect(projectsNow().currentId).not.toBe(before)
    const s = useSiteStore.getState()
    expect(ids(s.data)).toEqual(['t9'])
    expect(s.images.o9).toBe(PNG)
    expect(s.vectors.o9).toEqual(vector)

    // Sent on again, it carries the same: the ticked drawing, not the other.
    const again = parseProjectFile(projectFileText(survey('shared'), garageFloor(), await siteForProject()))
    expect(again.site?.data).toEqual(s.data)
    expect(Object.keys(again.site?.drawings ?? {})).toEqual(['o9'])
    // The same from the Projects home, for a project that isn't open.
    await projectActions.create({ survey: survey('c') })
    await settled()
    expect(projectSiteFromRecords(await projectActions.read(meta.id))).toEqual(again.site)
  })
})
