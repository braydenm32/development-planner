// Share › Export's door and window schedule as drawn, on the made-up garage floor: a real table
// with a caption, a scope on every header and the unit on each size, so a screen reader ties each
// figure to its column (AX-24).

import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { normalizePlan } from '../../plan/model'

const doc = parseDxf(readFileSync(new URL('../../../samples/sample-block.dxf', import.meta.url), 'utf8'))
const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
const terrain = buildTerrain(survey)
const plan = normalizePlan({ ...garageFloor(), name: 'Sample house' })

vi.mock('../../shell/useSite', () => ({ useLoaded: () => ({ plan, survey, terrain, earth: null }) }))

const { ExportTab } = await import('../ExportTab')

describe('the door and window schedule on Share › Export', () => {
  const html = renderToStaticMarkup(<ExportTab />)
  const table = /<table class="schedule">(.*?)<\/table>/.exec(html)![1]

  it('has a caption that says what it lists and in what unit', () => {
    expect(table).toMatch(/^<caption>Door and window schedule: each door and window, where it is and its size in millimetres<\/caption>/)
  })

  it('scopes every column header, with the unit on the sizes', () => {
    const heads = [...table.matchAll(/<th scope="col">(.*?)<\/th>/g)].map(m => m[1].replace(/<[^>]+>/g, ''))
    expect(heads).toEqual(['Mark', 'Type', 'Where', 'W × H (mm)', 'Sill (mm)'])
    expect(table).toContain('<abbr title="Width by height">W × H</abbr>')
    expect(table).not.toMatch(/<th>/)
  })

  it('heads each row with its mark', () => {
    const marks = [...table.matchAll(/<th scope="row">(.*?)<\/th>/g)].map(m => m[1])
    expect(marks).toEqual(['D1', 'D2', 'W1', 'O1', 'O2'])
  })
})
