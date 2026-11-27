import { beforeEach, describe, expect, it } from 'vitest'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { emptyPlan } from '../../plan/model'
import { nameSiteStep } from '../../shell/undoSteps'
import { parseProjectFile, projectFileText } from '../../share/project'
import { emptySiteData, emptySiteFiles, moveSiteData, normalizeSiteData, projectSite, unusedDrawings, useSiteStore } from '../../site/store'
import { keyPatch } from '../keySteps'
import { normalizePhotoView, photoName, type PhotoView } from '../model'
import { addPhoto, dragPhoto, endDrag, removePhoto, updatePhoto } from '../store'
import { photoRect } from '../shot'

const view = (extra: Partial<PhotoView> = {}): PhotoView => ({
  id: 'ph1',
  name: 'From the street',
  width: 2560,
  height: 1920,
  at: [1005, 1990],
  heading: 20,
  tilt: -2,
  roll: 0,
  fov: 66,
  eyeHeight: 1.6,
  level: null,
  lens: 'photo',
  taken: '2026-03-14T15:30:12',
  offset: 660,
  guessed: false,
  include: false,
  ...extra,
})

const JPEG = 'data:image/jpeg;base64,/9j/4AAQ'

describe('a view from a photo, saved with the site features', () => {
  it('keeps what is sound, with defaults for what is missing', () => {
    expect(normalizePhotoView({ id: 'x', width: 100, height: 50 })).toMatchObject({ name: 'Photo', at: null, eyeHeight: 1.6, level: null, lens: 'phone', fov: 60, include: false })
    expect(normalizePhotoView({ id: 'x', width: 0, height: 50 })).toBeNull()
    expect(normalizePhotoView({ ...view(), fov: 500, heading: -10, tilt: 120 })).toMatchObject({ fov: 120, heading: 350, tilt: 85 })
  })

  it('leaves older projects as they were: no photos, and no photos field', () => {
    const old = { version: 1, features: [], edits: {}, overlays: [], hidden: [], extraDxf: null }
    expect(normalizeSiteData(old)).toEqual(old)
    expect(normalizeSiteData({ ...old, photos: [view(), { junk: true }] }).photos).toEqual([view()])
  })

  it('goes in the project file; the photo itself only when ticked, like a drawing', () => {
    const survey = { fileName: 'plane.dxf', dxfText: planeSurvey(), roles: {} }
    const plan = emptyPlan({ e: 1006, n: 1006, rotation: 0, ffl: 84 })
    const files = { ...emptySiteFiles(), drawings: { ph1: { image: JPEG } } }
    const without = projectSite({ ...emptySiteData(), photos: [view()] }, files)!
    expect(without.drawings).toBeUndefined()
    const back = parseProjectFile(projectFileText(survey, plan, without))
    expect(back.site!.data.photos).toEqual([view()])
    const withPhoto = projectSite({ ...emptySiteData(), photos: [view({ include: true })] }, files)!
    expect(parseProjectFile(projectFileText(survey, plan, withPhoto)).site!.drawings).toEqual({ ph1: { image: JPEG } })
  })

  it('keeps a photo’s picture while the photo is there, like a drawing’s', () => {
    const files = { ...emptySiteFiles(), drawings: { ph1: { image: JPEG }, gone: { image: JPEG } } }
    expect(unusedDrawings({ ...emptySiteData(), photos: [view()] }, files)).toEqual(['gone'])
  })

  it('moves the spot and turns the direction with the block onto a new survey grid', () => {
    // Turned 90° anticlockwise about the grid's origin, then moved 100 m east.
    const moved = moveSiteData({ ...emptySiteData(), photos: [view()] }, [0, 1, -1, 0, 100, 0])
    expect(moved.photos![0].at![0]).toBeCloseTo(100 - 1990, 9)
    expect(moved.photos![0].at![1]).toBeCloseTo(1005, 9)
    expect(moved.photos![0].heading).toBeCloseTo(290, 9)
  })

  it('names its file without the extension', () => {
    expect(photoName('IMG_2041.JPG', null)).toBe('IMG_2041')
    expect(photoName('image.jpg', '2026-03-14T15:30:12')).toBe('Photo of 2026-03-14')
  })
})

describe('changing a view', () => {
  beforeEach(() => useSiteStore.setState({ data: emptySiteData(), past: [], future: [] }))
  const st = () => useSiteStore.getState()

  it('adds, changes and removes as one undo step each, named for the undo button', () => {
    addPhoto(view())
    expect(st().past).toHaveLength(1)
    expect(nameSiteStep(st().past[0], st().data)).toMatchObject({ what: 'add photo', area: 'site', tab: '3d' })
    updatePhoto('ph1', { heading: 40 })
    expect(nameSiteStep(st().past[1], st().data).what).toBe('change view from a photo')
    removePhoto('ph1')
    expect(st().data.photos).toEqual([])
    st().undo()
    expect(st().data.photos![0].heading).toBe(40)
  })

  it('makes a whole drag one step, ending where it was let go', () => {
    addPhoto(view())
    for (let h = 21; h <= 30; h++) dragPhoto('ph1', { heading: h })
    expect(st().past).toHaveLength(1)
    endDrag()
    expect(st().past).toHaveLength(2)
    expect(st().data.photos![0].heading).toBe(30)
    st().undo()
    expect(st().data.photos![0].heading).toBe(20)
  })
})

describe('fine steps and the photo’s place', () => {
  it('moves the spot forward the way it faces, and turns, tilts, leans and widens in half degrees', () => {
    const v = view({ heading: 90, at: [0, 0] })
    const fwd = keyPatch('ArrowUp', v)!.at!
    expect(fwd[0]).toBeCloseTo(0.1, 9)
    expect(fwd[1]).toBeCloseTo(0, 9)
    const right = keyPatch('ArrowRight', v)!.at!
    expect(right[1]).toBeCloseTo(-0.1, 9)
    expect(keyPatch('e', v)).toEqual({ heading: 90.5 })
    expect(keyPatch('R', v)).toEqual({ tilt: -1.5 })
    expect(keyPatch(']', v)).toEqual({ roll: 0.5 })
    expect(keyPatch('-', v)).toEqual({ fov: 66.5, lens: 'set' })
    expect(keyPatch('x', v)).toBeNull()
  })

  it('fits the photo in what the panels leave, keeping its shape', () => {
    const r = photoRect(1000, 600, 4 / 3, { l: 300, r: 0, t: 0, b: 0 })
    expect(r.width / r.height).toBeCloseTo(4 / 3, 9)
    expect(r.left).toBeGreaterThanOrEqual(300)
    expect(r.top + r.height).toBeLessThanOrEqual(600)
  })
})
