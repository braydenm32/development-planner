// The plan and the 3D view have a name that says what they show (AX-09), and the plan's is one
// picture and one Tab stop pointing at the lists that hold the same in text.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { emptyPlan } from '../../plan/model'
import { garageFloor, splitLevels } from '../../plan/__tests__/fixtures'
import { PLAN_CANVAS } from '../planCanvas'
import { PlanWords } from '../PlanWords'
import { sceneProps } from '../scene'
import { planHelp, planSummary, SCENE_HELP, sceneSummary } from '../summary'

describe('the plan’s name', () => {
  it('says the level and counts what is drawn on it', () => {
    const text = planSummary(garageFloor(), 'level_ground')
    expect(text).toMatch(/^Plan of Ground floor: 4 rooms, [\d.]+ m² floor area, 10 walls, 5 doors and windows, 1 outdoor area\.$/)
  })

  it('counts one of a thing in the singular, and only the level asked for', () => {
    expect(planSummary(splitLevels(), 'level_low')).toMatch(/^Plan of Lower level: 1 room, [\d.]+ m² floor area, 4 walls, 1 stair\.$/)
  })

  it('says so when nothing is drawn', () => {
    expect(planSummary(emptyPlan({ e: 0, n: 0, rotation: 0, ffl: 10 }), 'level_ground')).toMatch(/nothing drawn on this level yet\.$/)
  })

  it('is a picture that Tab stops on, named and described by text beside it', () => {
    expect(PLAN_CANVAS).toEqual({ role: 'img', 'aria-labelledby': 'plan-summary', 'aria-describedby': 'plan-help', tabIndex: 0 })
    const html = renderToStaticMarkup(<PlanWords plan={garageFloor()} level="level_ground" changes />)
    expect(html).toMatch(/<p id="plan-summary" hidden="">Plan of Ground floor: 4 rooms/)
    expect(html).toMatch(/<p id="plan-help" hidden="">The plan is a drawing\./)
  })

  it('points to the lists, and only promises changes where the house can change', () => {
    expect(planHelp(true)).toContain('Walls and doors')
    expect(planHelp(true)).toContain('picked, changed and deleted')
    expect(planHelp(false)).not.toContain('changed')
    expect(planHelp(false)).toContain('arrow keys move the view;')
  })
})

describe('the 3D view’s name', () => {
  it('says the ground’s levels and the house’s', () => {
    expect(sceneSummary(splitLevels(), { minRL: 41.2, maxRL: 47.8 })).toBe('3D view of the block with the house on it: ground from RL 41.20 to RL 47.80; the house has 3 levels.')
    expect(sceneSummary(null, { minRL: 41.2, maxRL: 47.8 })).toBe('3D view of the block: ground from RL 41.20 to RL 47.80; no house drawn yet.')
  })

  it('is a named picture that Tab stops on, with its keys described', () => {
    expect(sceneProps('3D view of the block.')).toMatchObject({ role: 'img', 'aria-label': '3D view of the block.', 'aria-describedby': 'scene-help', tabIndex: 0, className: 'scene-keys' })
    expect(SCENE_HELP).toMatch(/left and right arrows turn the view, up and down tilt it, plus and minus zoom/)
  })
})
