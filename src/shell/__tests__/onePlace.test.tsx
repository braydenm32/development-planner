// One home for each control and one name for each thing (LD-09, HO-20, LD-26, LF-22, PH-32).

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NEED_COUNCIL } from '../../checks/settings'
import { areaSizeText } from '../../components/planNumbers'
import { ViewToggles } from '../../components/SiteSections'
import { DEFAULT_VIEW } from '../../lib/storage'
import { typeInfo } from '../../site/model'

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('Site › 3D', () => {
  it('keeps the block’s switches and leaves Roof and Furniture to the 3D view’s Show menu', () => {
    const t = text(renderToStaticMarkup(<ViewToggles view={DEFAULT_VIEW} onChange={() => {}} />))
    for (const label of ['Contours', 'Spot levels', 'Reference points', 'Show as a solid block', 'House', 'Cut and fill']) expect(t).toContain(label)
    expect(t).not.toMatch(/\bRoof\b|Furniture/)
  })
})

describe('an outdoor area', () => {
  it('shows its size at the top of its card, m² and the way round', () => {
    expect(areaSizeText([[0, 0], [6, 0], [6, 4], [0, 4]])).toBe('24.00 m² · 20.00 m around')
  })
  it('the Site feature says it is the existing driveway, where Design’s Driveway is the proposed one', () => {
    expect(typeInfo('paving').label).toBe('Existing driveway or paving')
  })
})

describe('a DA with no council picked', () => {
  it('says why the switch stays on CDC and what to do', () => {
    expect(NEED_COUNCIL).toMatch(/^Still on CDC: a DA is checked against your council’s rules, so pick your council/)
    expect(NEED_COUNCIL).toMatch(/isn’t listed/)
  })
})
