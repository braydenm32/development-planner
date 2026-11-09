// Replace survey with a block on other coordinates: the site features and drawings go where
// the house goes, and the review says what happens to them and to the ground under a house
// left off the block. Synthetic blocks only: the tilted-plane test block and the test garage.

import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { parseDxf } from '../../lib/dxf'
import type { SavedProject } from '../../lib/storage'
import { analyzeLayers, guessRoles } from '../../lib/survey'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { fromSite, toSite, type Placement } from '../../plan/model'
import { usePlan } from '../../plan/store'
import { ensureProjects, projectActions } from '../../projects/session'
import { applyAffine } from '../../site/align'
import { emptySiteData, useSiteStore, type Overlay, type SiteData } from '../../site/store'
import type { SiteFeature } from '../../site/model'
import { replaceSurvey } from '../flows'
import { undoToast, useSafety, type Review } from '../store'

function plane(fileName = 'plane.dxf', shift: [number, number] = [0, 0]): SavedProject {
  const dxfText = shiftDxf(planeSurvey(), shift)
  return { fileName, dxfText, roles: guessRoles(analyzeLayers(parseDxf(dxfText))) }
}

/** Move every point of a DXF by `de`, `dn` (group codes 10 and 20). */
function shiftDxf(text: string, [de, dn]: [number, number]): string {
  if (!de && !dn) return text
  const lines = text.split('\n')
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim()
    if (code === '10') lines[i + 1] = String(Number(lines[i + 1]) + de)
    if (code === '20') lines[i + 1] = String(Number(lines[i + 1]) + dn)
  }
  return lines.join('\n')
}

const plan = () => usePlan.getState().plan!
const world = (p: Vec2, pl: Placement) => toSite(p, pl, [0, 0])
const houseFrame = (p: Vec2, pl: Placement) => fromSite(p, pl, [0, 0])

async function review(): Promise<Review & { answer: (c: string | null) => void }> {
  for (let i = 0; i < 200; i++) {
    const r = useSafety.getState().review
    if (r) return r
    await new Promise(res => setTimeout(res, 1))
  }
  throw new Error('No review was asked for.')
}

/** The garage on the plane block, with a tree and an easement beside it and a drawing laid over it. */
async function garageWithFeatures(): Promise<SiteData> {
  await projectActions.create({ survey: plane(), plan: garageFloor() })
  const pl = plan().placement
  const tree: SiteFeature = { id: 'sf_tree', type: 'tree', geom: { kind: 'point', at: world([-3, 2], pl) }, source: 'trace', trunk: 0.3, canopy: 6, height: 8, remove: false }
  const easement: SiteFeature = { id: 'sf_ease', type: 'easement', geom: { kind: 'area', pts: [world([0, -2], pl), world([6, -2], pl), world([6, -1], pl)] }, source: 'trace' }
  const at = world([1, 1], pl)
  const drawing: Overlay = {
    id: 'ov_1', name: 'Site plan', kind: 'image', page: 1, width: 100, height: 50, pxPerUnit: 1, scale: null,
    transform: [0.1, 0, 0, 0.1, at[0], at[1]], aligned: true, opacity: 0.6, visible: true, locked: false, include: false, vector: false, added: [],
  }
  const data = { ...emptySiteData(), features: [tree, easement], overlays: [drawing] }
  useSiteStore.setState({ data, past: [], future: [] })
  return data
}

beforeAll(() => ensureProjects())
beforeEach(() => useSafety.setState({ review: null, toast: null, busy: false }))

describe('Replace survey with a block on other coordinates', () => {
  it('moves the site features and drawings with the house when it is centred, and Undo puts them back', async () => {
    const before = await garageWithFeatures()
    const from = plan().placement
    const done = replaceSurvey(plane('mga.dxf', [700, 300]))
    const r = await review()
    expect(r.kept.join(' ')).toMatch(/Your site features \(3 features\)\. They’re off the new block, so they go where the house goes\./)
    expect(r.choices?.find(c => c.id === 'centre')?.detail).toMatch(/Your 3 site features move with it\./)
    r.answer('centre')
    await done
    const to = plan().placement
    expect(to.e - from.e).toBeGreaterThan(600)

    const after = useSiteStore.getState().data
    // Each feature keeps its place beside the house.
    const tree = after.features.find(f => f.id === 'sf_tree')!.geom
    expect(tree.kind === 'point' && houseFrame(tree.at, to)).toEqual([expect.closeTo(-3, 6), expect.closeTo(2, 6)])
    const ease = after.features.find(f => f.id === 'sf_ease')!.geom
    expect(ease.kind === 'area' && ease.pts.map(p => houseFrame(p, to).map(v => Math.round(v * 1e6) / 1e6))).toEqual([[0, -2], [6, -2], [6, -1]])
    // So the centroid moves by just what the house moved.
    const c = (d: SiteData) => {
      const g = d.features.find(f => f.id === 'sf_ease')!.geom as { pts: Vec2[] }
      return [g.pts.reduce((s, p) => s + p[0], 0) / 3, g.pts.reduce((s, p) => s + p[1], 0) / 3]
    }
    const moved = world([0, 0], to)
    const was = world([0, 0], from)
    if (Math.abs(to.rotation - from.rotation) < 1e-9) {
      expect(c(after)[0] - c(before)[0]).toBeCloseTo(moved[0] - was[0], 6)
      expect(c(after)[1] - c(before)[1]).toBeCloseTo(moved[1] - was[1], 6)
    }
    // The drawing's line-up moves the same way.
    const corner = applyAffine(after.overlays[0].transform, [0, 0])
    expect(houseFrame(corner, to).map(v => Math.round(v * 1e6) / 1e6)).toEqual([1, 1])

    const t = useSafety.getState().toast!
    await undoToast(t.id)
    await projectActions.flush()
    expect(useSiteStore.getState().data).toBe(before)
  })

  it('leaves them where they are with a revised survey on the same grid', async () => {
    const before = await garageWithFeatures()
    const done = replaceSurvey(plane('revised.dxf'))
    const r = await review()
    expect(r.kept.join(' ')).not.toMatch(/off the new block/)
    r.answer('centre')
    await done
    expect(useSiteStore.getState().data).toBe(before)
  })

  it('keeping the house says the features stay with it, and reads no ground off the block', async () => {
    const before = await garageWithFeatures()
    const done = replaceSurvey(plane('mga.dxf', [700, 300]))
    const r = await review()
    const keep = r.choices?.find(c => c.id === 'keep')?.detail ?? ''
    expect(keep).toMatch(/Your 3 site features stay with it, off the new block\./)
    expect(keep).toMatch(/it’s off the new block, so there’s no ground under it to read/)
    expect(keep).not.toMatch(/the ground under it/)
    r.answer('keep')
    await done
    expect(useSiteStore.getState().data).toBe(before)
  })
})
