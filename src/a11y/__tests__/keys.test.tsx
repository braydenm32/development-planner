// Getting around without a pointer: the skip links (AX-14), the tool rail as one Tab stop, and the
// 3D view's keys and buttons (AX-28).

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fromSpherical, steppedPose, TILT_STEP, toSpherical, TURN_STEP, ZOOM_STEP_3D, type Pose, type Vec3 } from '../../phone/camera'
import { useCamera } from '../../phone/cameraStore'
import { ToolRail } from '../../shell/CanvasChrome'
import { SHORTCUTS } from '../../shell/shortcuts'
import { sceneKeyStep } from '../scene'
import { TurnButtons } from '../SceneKeys'
import { SkipLinks } from '../SkipLinks'
import { skipsFor } from '../skips'
import { toolbarStep } from '../toolbar'

describe('skip links', () => {
  const at = (area: 'design' | 'approvals' | 'costs' | 'share' | 'site', tab: string, view: 'plan' | '3d' = 'plan') => ({ kind: 'app' as const, area, tab, view })

  it('are the first buttons on the page, with one always there to take the first Tab', () => {
    // On the server the router is on Design › Plan with no plan open: nothing to skip to yet but the page.
    const html = renderToStaticMarkup(<SkipLinks />)
    expect(html).toMatch(/^<div class="skip-links"><button type="button">Skip to the main part<\/button><\/div>$/)
  })

  it('go to the tab’s panel by name, the plan tools, the plan and the selection', () => {
    expect(skipsFor(at('design', 'walls'), true, true).map(s => s.label)).toEqual(['Skip to the Walls & doors panel', 'Skip to the plan tools', 'Skip to the plan', 'Skip to the selection'])
    // Design › Plan is the canvas alone: no panel to skip to.
    expect(skipsFor(at('design', 'plan'), true, false).map(s => s.label)).toEqual(['Skip to the plan tools', 'Skip to the plan'])
    // Approvals has no tools; the 3D view is named as itself.
    expect(skipsFor(at('approvals', 'checks'), true, false).map(s => s.label)).toEqual(['Skip to the Checks panel', 'Skip to the plan'])
    expect(skipsFor(at('site', '3d', '3d'), true, false).map(s => s.label)).toEqual(['Skip to the 3D panel', 'Skip to the 3D view'])
    expect(skipsFor(at('design', 'more'), true, false)[0].label).toBe('Skip to the More panel')
  })

  it('offer only the panel until the plan has loaded, and the projects on All projects', () => {
    expect(skipsFor(at('approvals', 'checks'), false, false).map(s => s.id)).toEqual(['panel'])
    expect(skipsFor({ kind: 'projects' }, false, false).map(s => s.label)).toEqual(['Skip to the projects'])
    expect(skipsFor({ kind: 'page', page: 'about' }, false, false)).toEqual([])
  })

  it('are in the list of keys', () => {
    const rows = SHORTCUTS.flatMap(g => g.rows)
    expect(rows.some(r => r.keys.includes('Tab') && /skip to the panel/.test(r.what))).toBe(true)
    expect(rows.some(r => r.keys.includes('arrows') && /Move the plan when nothing is picked/.test(r.what))).toBe(true)
  })
})

describe('the tool rail', () => {
  it('is a toolbar with one Tab stop: the tool in hand', () => {
    const html = renderToStaticMarkup(<ToolRail />)
    expect(html).toMatch(/role="toolbar" aria-label="Plan tools"/)
    const stops = [...html.matchAll(/<button tabindex="(-?\d)"[^>]*aria-label="([^"]+)"/g)].map(m => [m[1], m[2]])
    expect(stops.length).toBeGreaterThan(10)
    expect(stops.filter(s => s[0] === '0')).toEqual([['0', 'Select tool (V)']])
  })

  it('moves along with the arrow keys, wraps at the ends, and jumps with Home and End', () => {
    expect(toolbarStep('ArrowDown', 0, 15)).toBe(1)
    expect(toolbarStep('ArrowDown', 14, 15)).toBe(0)
    expect(toolbarStep('ArrowUp', 0, 15)).toBe(14)
    expect(toolbarStep('ArrowRight', 3, 15)).toBe(4)
    expect(toolbarStep('ArrowLeft', 3, 15)).toBe(2)
    expect(toolbarStep('Home', 7, 15)).toBe(0)
    expect(toolbarStep('End', 7, 15)).toBe(14)
  })

  it('leaves every other key alone, so W still picks the Wall tool from it', () => {
    for (const k of ['w', 'Enter', ' ', 'Tab', 'Escape']) expect(toolbarStep(k, 3, 15)).toBeNull()
    expect(toolbarStep('ArrowDown', 0, 0)).toBeNull()
  })
})

describe('the 3D view from the keyboard', () => {
  const limits = { min: 5, max: 200, maxPolar: Math.PI * 0.495 }
  const target: Vec3 = [10, 2, -10]
  const pose = (r: number, phi: number, theta: number): Pose => {
    const o = fromSpherical(r, phi, theta)
    return { position: [target[0] + o[0], target[1] + o[1], target[2] + o[2]], target }
  }
  const sph = (p: Pose) => toSpherical([p.position[0] - p.target[0], p.position[1] - p.target[1], p.position[2] - p.target[2]])

  it('maps arrows to a turn or a tilt and + and − to a zoom', () => {
    expect(sceneKeyStep('ArrowLeft')).toEqual({ turn: -1 })
    expect(sceneKeyStep('ArrowRight')).toEqual({ turn: 1 })
    expect(sceneKeyStep('ArrowUp')).toEqual({ tilt: 1 })
    expect(sceneKeyStep('ArrowDown')).toEqual({ tilt: -1 })
    expect(sceneKeyStep('+')).toEqual({ zoom: 1 })
    expect(sceneKeyStep('=')).toEqual({ zoom: 1 })
    expect(sceneKeyStep('-')).toEqual({ zoom: -1 })
    expect(sceneKeyStep('w')).toBeNull()
  })

  it('turns about the same target, keeping its height and distance', () => {
    const from = pose(40, 1, 0.3)
    const to = steppedPose(from, { turn: 1 }, limits)
    expect(to.target).toEqual(target)
    expect(sph(to).theta).toBeCloseTo(0.3 + TURN_STEP)
    expect(sph(to).r).toBeCloseTo(40)
    expect(sph(to).phi).toBeCloseTo(1)
    expect(sph(steppedPose(to, { turn: -1 }, limits)).theta).toBeCloseTo(0.3)
  })

  it('tilts towards looking down, and never under the ground or quite straight down', () => {
    expect(sph(steppedPose(pose(40, 1, 0), { tilt: 1 }, limits)).phi).toBeCloseTo(1 - TILT_STEP)
    expect(sph(steppedPose(pose(40, 1.5, 0), { tilt: -3 }, limits)).phi).toBeCloseTo(limits.maxPolar)
    expect(sph(steppedPose(pose(40, 0.1, 0), { tilt: 3 }, limits)).phi).toBeCloseTo(0.02)
  })

  it('zooms a step at a time, no closer or further than dragging allows', () => {
    expect(sph(steppedPose(pose(40, 1, 0), { zoom: 1 }, limits)).r).toBeCloseTo(40 / ZOOM_STEP_3D)
    expect(sph(steppedPose(pose(40, 1, 0), { zoom: -1 }, limits)).r).toBeCloseTo(40 * ZOOM_STEP_3D)
    expect(sph(steppedPose(pose(5.5, 1, 0), { zoom: 4 }, limits)).r).toBeCloseTo(5)
    expect(sph(steppedPose(pose(190, 1, 0), { zoom: -4 }, limits)).r).toBeCloseTo(200)
  })

  it('has Turn left and Turn right buttons, named with their keys, that order a step each press', () => {
    const html = renderToStaticMarkup(<TurnButtons />)
    expect(html).toMatch(/role="group" aria-label="Turn"/)
    expect(html).toContain('aria-label="Turn left (←)"')
    expect(html).toContain('aria-label="Turn right (→)"')
    const n = useCamera.getState().step?.n ?? 0
    useCamera.getState().nudge({ zoom: 1 })
    useCamera.getState().nudge({ zoom: 1 })
    expect(useCamera.getState().step).toEqual({ by: { zoom: 1 }, n: n + 2 })
  })
})
