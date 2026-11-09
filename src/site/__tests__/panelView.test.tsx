// Site › Features on a phone in View shows what can be read, not greyed-out buttons; in Edit the
// trace buttons come first, each with its plan symbol.

import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadBlock, words } from '../../phone/__tests__/block'
import { SiteFeaturesPanel } from '../SiteFeaturesPanel'
import { useSiteStore } from '../store'

describe('the features panel', () => {
  const { survey } = loadBlock()
  // A static render reads the store's first state.
  const first = { ...useSiteStore.getInitialState() }
  beforeAll(() => Object.assign(useSiteStore.getInitialState(), { loaded: true }))
  afterAll(() => Object.assign(useSiteStore.getInitialState(), first))

  it('in View, leaves out what only changes things', () => {
    const html = renderToStaticMarkup(<SiteFeaturesPanel survey={survey} onShowPlan={() => {}} viewOnly />)
    const text = words(html)
    expect(text).not.toMatch(/Add a drawing|Add a DXF|Trace/)
    expect(html).not.toMatch(/<button/)
    expect(text).toContain('Nothing traced or read onto the block yet.')
  })

  it('in Edit, starts with the trace buttons, each with its symbol', () => {
    const html = renderToStaticMarkup(<SiteFeaturesPanel survey={survey} onShowPlan={() => {}} />)
    expect(words(html).indexOf('Trace')).toBeLessThan(words(html).indexOf('Drawings'))
    const trace = html.slice(html.indexOf('sf-trace'), html.indexOf('Drawings'))
    expect(trace.match(/<button[^>]*><svg class="sf-key"/g)).toHaveLength(8)
  })
})
