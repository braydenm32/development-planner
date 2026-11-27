// What screen readers are told when something changes without focus moving (AX-16): the tool, the
// selection and where its details are, the results after an edit, saving stopping, search counts.

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { Announcer } from '../Announcer'
import { announce, resultCountWords, resultsWords, saveWords, selectionName, selectionWords, toolWords, useAnnounce, type ResultFacts } from '../announce'

const CALM: ResultFacts = { checks: 'CDC checks: Nothing to fix', balance: null, batters: null, site: 0 }

describe('the live region', () => {
  beforeEach(() => useAnnounce.setState({ text: '', n: 0 }))

  it('is one polite status region, there before anything is said', () => {
    const html = renderToStaticMarkup(<Announcer />)
    expect(html).toMatch(/<div class="a11y-hidden" role="status" aria-live="polite" aria-atomic="true"[^>]*><\/div>/)
  })

  it('counts each thing said, so the same words twice are two announcements', () => {
    announce('Wall tool')
    announce('Wall tool')
    expect(useAnnounce.getState()).toEqual({ text: 'Wall tool', n: 2 })
    announce('   ')
    expect(useAnnounce.getState().n).toBe(2)
  })
})

describe('what is said', () => {
  it('names the tool picked up as its button does', () => {
    expect(toolWords('wall')).toBe('Wall tool')
    expect(toolWords('opening')).toBe('Wall opening tool')
    expect(toolWords('select')).toBe('Select tool')
  })

  it('names a selection and says where its details are', () => {
    const plan = garageFloor()
    expect(selectionWords(plan, { type: 'room', id: 'r1' }, 0, false)).toBe('Garage selected. Its details are in the Selection panel.')
    expect(selectionName(plan, { type: 'wall', id: 'hall_w' })).toBe('Internal wall')
    expect(selectionName(plan, { type: 'opening', id: 'office_window' })).toBe('Window')
    expect(selectionName(plan, { type: 'area', id: 'a1' })).toBe('Patio')
    expect(selectionWords(plan, { type: 'wall', id: 'south' }, 2, true)).toBe('3 things selected. They move and delete together.')
  })

  it('says a selection was put down, and nothing when there was none', () => {
    const plan = garageFloor()
    expect(selectionWords(plan, null, 0, true)).toBe('Nothing selected.')
    expect(selectionWords(plan, null, 0, false)).toBe('')
  })

  it('says the results that changed after an edit, with what the checks were', () => {
    const after: ResultFacts = { checks: 'CDC checks: 6 to fix', balance: 'Out of balance, 160.7 m³ to bring in', batters: 'the east boundary', site: 0 }
    expect(resultsWords(CALM, after)).toBe('CDC checks: 6 to fix. It was Nothing to fix. Out of balance, 160.7 m³ to bring in. Earth slopes (batters) cross the east boundary.')
    expect(resultsWords(after, after)).toBe('')
  })

  it('says a warning has gone when it has', () => {
    const before: ResultFacts = { checks: 'CDC checks: 6 to fix', balance: 'Out of balance, 160.7 m³ to bring in', batters: 'the east boundary', site: 2 }
    expect(resultsWords(before, { ...before, balance: null, batters: null, site: 0 })).toBe('The cut and fill are back in balance. The earth slopes no longer cross a boundary. Site: nothing left to check.')
  })

  it('speaks up when saving stops and when it works again, and stays quiet for routine saves', () => {
    const saved = { label: 'Saved in this browser', detail: 'Saved in this browser at 2:14 pm.' }
    const trouble = { label: 'Not saved yet', detail: 'The last change didn’t save. It’s kept and will be tried again.' }
    expect(saveWords(saved, trouble)).toBe(trouble.detail)
    expect(saveWords(trouble, saved)).toBe('Saving works again: saved in this browser.')
    expect(saveWords(saved, saved)).toBe('')
    expect(saveWords(null, saved)).toBe('')
    expect(saveWords({ label: 'Saved' }, { label: 'Offline', detail: 'Offline. Changes are kept on this device.' })).toBe('Offline. Changes are kept on this device.')
  })

  it('counts search results in words', () => {
    expect([0, 1, 12].map(resultCountWords)).toEqual(['No results', '1 result', '12 results'])
  })
})
