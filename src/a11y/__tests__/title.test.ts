// The browser tab's title and the place said to screen readers (AX-08, LD-29): every screen has
// its own, with the project's name, so two tabs and Back's history list read apart.

import { describe, expect, it } from 'vitest'
import { AREAS, MORE, tabIds } from '../../nav/menu'
import { ARCHIVED_PROJECTS, everyRoute, NEW_PROJECT, pageRoute, PROJECTS, type AppRoute } from '../../nav/route'
import { APP_NAME, placeWords, titleFor } from '../title'

const at = (area: AppRoute['area'], tab: string): AppRoute => ({ kind: 'app', area, tab, view: 'plan' })

describe('the browser tab title', () => {
  it('says the tab, the area, the project and the app', () => {
    expect(titleFor(at('approvals', 'basix'), 'Hill house')).toBe('BASIX · Approvals · Hill house · Contour & Gable')
    expect(titleFor(at('design', 'plan'), 'Hill house')).toBe('Plan · Design · Hill house · Contour & Gable')
    expect(titleFor(at('costs', MORE), 'Hill house')).toBe('More · Costs · Hill house · Contour & Gable')
  })

  it('leaves the project out when it has no name yet', () => {
    expect(titleFor(at('site', 'block'), '  ')).toBe('Block · Site · Contour & Gable')
    expect(titleFor(at('site', 'block'))).toBe('Block · Site · Contour & Gable')
  })

  it('names All projects, the archived ones and a new project', () => {
    expect(titleFor(PROJECTS)).toBe('All projects · Contour & Gable')
    expect(titleFor(ARCHIVED_PROJECTS)).toBe('Archived projects · Contour & Gable')
    expect(titleFor(NEW_PROJECT)).toBe('New project · Contour & Gable')
  })

  it('leaves the pages about the app to set their own', () => {
    expect(titleFor(pageRoute('about'), 'Hill house')).toBeNull()
  })

  it('is different for every tab of every area, and never just the app’s name', () => {
    const titles = new Set<string>()
    let tabs = 0
    for (const a of AREAS)
      for (const t of tabIds(a)) {
        tabs++
        const title = titleFor(at(a.id, t), 'Hill house')!
        expect(title).not.toBe(APP_NAME)
        expect(title.endsWith(`Hill house · ${APP_NAME}`), title).toBe(true)
        titles.add(title)
      }
    expect(titles.size).toBe(tabs)
    for (const r of everyRoute()) expect(titleFor(r, 'Hill house')).toBeTruthy()
  })

  it('says the place in a few words for the live region', () => {
    expect(placeWords(at('approvals', 'checks'))).toBe('Checks, Approvals')
    expect(placeWords(at('design', 'walls'))).toBe('Walls & doors, Design')
    expect(placeWords(PROJECTS)).toBe('All projects')
  })
})
