// A stair on the floor it comes up to: drawn over that floor's rooms, as the hole it climbs into,
// reading DN. The made-up split level (fixtures) and the tilted-plane test block.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlanEditor } from '../../components/PlanEditor'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, guessRoles } from '../../lib/survey'
import { readSite } from '../../safety/files'
import type { Plan } from '../model'
import { usePlan } from '../store'
import { splitLevels } from './fixtures'

const site = () => {
  const dxfText = planeSurvey()
  return readSite({ fileName: 'plane.dxf', dxfText, roles: guessRoles(analyzeLayers(parseDxf(dxfText))) })
}

/** The plan as it draws on `level`. */
function draw(plan: Plan, level: string): string {
  usePlan.getState().load(plan)
  usePlan.getState().setActiveLevel(level)
  // A static render reads the store's server snapshot, its initial state: put the plan there.
  Object.assign(usePlan.getInitialState(), usePlan.getState())
  const { survey, terrain } = site()
  return renderToStaticMarkup(
    <PlanEditor survey={survey} terrain={terrain} up="house" onUpChange={() => {}} showGround={false} onShowGroundChange={() => {}} earth={null} viewKey={null} />,
  )
}

describe('a stair on the floor it arrives at', () => {
  it('is drawn after the room fill, so the room doesn’t hide it, and reads DN', () => {
    const html = draw(splitLevels(), 'level_mid')
    const fill = html.lastIndexOf('class="room-fill')
    const arriving = html.indexOf('class="stair arriving"')
    expect(fill).toBeGreaterThan(-1)
    expect(arriving).toBeGreaterThan(fill)
    expect(html.slice(arriving)).toMatch(/<text class="stair-label"[^>]*>DN<\/text>/)
  })

  it('reads UP on its own floor, and isn’t drawn arriving on a floor it doesn’t reach', () => {
    const own = draw(splitLevels(), 'level_low')
    expect(own).toMatch(/<text class="stair-label"[^>]*>UP<\/text>/)
    expect(own).not.toContain('stair arriving')
    expect(draw(splitLevels(), 'level_top')).not.toContain('stair arriving')
  })

  it('marks a stair whose top meets no floor', () => {
    const p = splitLevels()
    const short = { ...p, stairs: [{ ...p.stairs[0], toLevel: null, rise: 0.8 }] }
    expect(draw(short, 'level_low')).toContain('Meets no floor')
    expect(draw(splitLevels(), 'level_low')).not.toContain('Meets no floor')
  })

  it('opens a plan on its lowest floor, whatever order the file lists the levels in', () => {
    const p = splitLevels()
    usePlan.getState().load({ ...p, levels: [p.levels[2], p.levels[1], p.levels[0]] })
    expect(usePlan.getState().activeLevel).toBe('level_low')
  })
})
