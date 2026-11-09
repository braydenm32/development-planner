// Small wording slips the audit found: each line says what is true for the project in front of you.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RoomFloorType } from '../../components/FloorTypeFields'
import { SurveyLayers } from '../../components/SiteSections'
import { areaById, tabOf } from '../../nav/menu'
import { garageFloor } from '../../plan/__tests__/fixtures'

describe('wording', () => {
  it("doesn't call a room's floor a slab before the floor's type is chosen", () => {
    const plan = garageFloor()
    const room = plan.rooms[0]
    const html = renderToStaticMarkup(<RoomFloorType plan={plan} room={room} />)
    expect(html).toContain('Same as Ground floor (not chosen yet)')
    const chosen = { ...plan, levels: plan.levels.map(l => ({ ...l, floorType: 'piers' as const })) }
    expect(renderToStaticMarkup(<RoomFloorType plan={chosen} room={room} />)).not.toContain('not chosen yet')
  })

  it("doesn't call a sketched block surveyed", () => {
    expect(tabOf(areaById('site')!, 'block')!.subtitle).not.toMatch(/survey/i)
  })

  it('calls the survey a survey file, since it can be a CSV or LandXML as well as a DXF', () => {
    const html = renderToStaticMarkup(<SurveyLayers layers={[]} roles={{}} onRoleChange={() => {}} />)
    expect(html).toContain('your survey file')
    expect(html).not.toContain('your DXF')
  })
})
