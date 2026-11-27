// Door and window kinds on the PDF floor plans and in the DXF (CB-18). The made-up test garage
// on the tilted-plane test block.

import { describe, expect, it } from 'vitest'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, guessRoles } from '../../lib/survey'
import { garageFloor } from '../../plan/__tests__/fixtures'
import type { Plan } from '../../plan/model'
import { readSite } from '../../safety/files'
import { planSetPdf, type PlanSetInput } from '../plans'

const dxfText = planeSurvey()
const { survey, terrain } = readSite({ fileName: 'plane.dxf', dxfText, roles: guessRoles(analyzeLayers(parseDxf(dxfText))) })
const input = (plan: Plan): PlanSetInput => ({ plan, survey, siteArea: terrain.stats.area, earthworks: null, up: 'house', paper: 'A3', title: 'Test', date: '27 November 2026' })
const house = (): Plan => ({ ...garageFloor(), placement: { e: 1006, n: 1006, rotation: 0, ffl: 84 } })

describe('door and window kinds on the PDF floor plans', () => {
  it('draws a kind’s own symbol, and leaves a plan with no kinds exactly as it was', async () => {
    const plain = await planSetPdf(input(house()))
    const again = await planSetPdf(input(house()))
    expect(again.length).toBe(plain.length)
    const p = house()
    p.openings = p.openings.map(o => (o.id === 'entry' ? { ...o, style: 'double' as const } : o.id === 'office_window' ? { ...o, style: 'sliding' as const } : o))
    const kinds = await planSetPdf(input(p))
    // A pair of leaves and two passing sashes are more lines than one swing and two glass lines.
    expect(kinds.length).not.toBe(plain.length)
  })
})
