// What the 3D presets frame: the house (or the block, before there is one) and which
// way the street is, in the 3D view's own units; and the part of the canvas they frame it in.

import type { Insets } from '../components/canvasFrame'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { floorRL, toSite, type Plan } from '../plan/model'
import { planBounds } from '../plan/ops'
import type { Frame } from './camera'
import { streetBearingOf } from '../plan/streetSide'

type Vec2 = [number, number]

/**
 * The frame for the presets. `refZ` and `exaggeration` are the 3D view's: heights are
 * metres above `refZ`, stretched by the exaggeration.
 */
export function siteFrame(plan: Plan | null, survey: Survey, terrain: Terrain, refZ: number, exaggeration: number): Frame {
  const xs = survey.boundary.map(p => p[0])
  const ys = survey.boundary.map(p => p[1])
  const bx = (Math.min(...xs) + Math.max(...xs)) / 2
  const by = (Math.min(...ys) + Math.max(...ys)) / 2
  const blockRadius = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2
  const street = streetBearingOf(plan, survey.boundary as Vec2[], terrain.stats.fallBearing)

  // Everything drawn (the house, its decks and driveway), in the site's frame.
  const b = plan ? planBounds(plan) : null
  if (!plan || !b) {
    const mid = (terrain.stats.minRL + terrain.stats.maxRL) / 2
    return { target: [bx, (mid - refZ) * exaggeration, -by], radius: blockRadius, blockRadius, street }
  }
  const corners: Vec2[] = [
    [b.minX, b.minY],
    [b.maxX, b.minY],
    [b.maxX, b.maxY],
    [b.minX, b.maxY],
  ].map(p => toSite(p as Vec2, plan.placement, survey.origin))
  const cx = corners.reduce((t, p) => t + p[0], 0) / 4
  const cy = corners.reduce((t, p) => t + p[1], 0) / 4
  // Eye height on the ground floor, so the house sits in the middle of the screen.
  const y = (floorRL(plan) + 1.5 - refZ) * exaggeration
  const radius = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2
  return { target: [cx, y, -cy], radius: Math.max(radius, 3), blockRadius, street }
}

/** The part of the 3D canvas nothing covers, and how to centre the picture in it. */
export interface OpenArea {
  /** Its shape: width over height. */
  aspect: number
  /** How much of the canvas's height it is (1 when nothing covers the top or bottom). */
  freeHeight: number
  /** How far the picture moves so its middle is the open part's middle, in pixels: as `setViewOffset` takes it (negative x moves it right, positive y moves it up). */
  dx: number
  dy: number
}

/**
 * The part of the 3D canvas nothing covers. On a phone, the camera buttons and the peek sheet
 * cover the top and bottom. On a desktop, a tab panel (or a tool's card) covers the left, the
 * selection the right, and the view bars the top and bottom, so Street view, From above and
 * Rear frame the house in what's left instead of behind the panel. With no insets (the old
 * layout), it's the whole canvas.
 */
export function openArea(w: number, h: number, insets: Insets | null | undefined, phone: boolean): OpenArea {
  const t = insets?.t ?? 0
  const b = insets?.b ?? 0
  // A phone's side buttons float over the picture; only its top and bottom are covered.
  const l = phone ? 0 : (insets?.l ?? 0)
  const r = phone ? 0 : (insets?.r ?? 0)
  const freeW = Math.max(w - l - r, Math.min(w, 160), 1)
  const freeH = Math.max(h - t - b, Math.min(h, 120), 1)
  return { aspect: freeW / freeH, freeHeight: freeH / Math.max(h, 1), dx: (r - l) / 2, dy: (b - t) / 2 }
}
