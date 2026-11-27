// The start screen sets expectations before anyone draws: who the app is for, and what it is not.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StartScreen } from '../StartScreen'

describe('the start screen', () => {
  const text = renderToStaticMarkup(<StartScreen into="new" />)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, '’')
    .replace(/\s+/g, ' ')

  it('says it is for NSW, what works anywhere and what the app is not (CB-35, HO-42)', () => {
    expect(text).toContain('For house blocks in NSW, Australia')
    expect(text).toContain('the planning rules and prices are NSW’s')
    expect(text).toContain('work on any block')
    expect(text).toContain('a planning aid, not advice')
    expect(text).toContain('not a decorating or photo-render tool')
    // Before the ways in, so it is read first.
    expect(text.indexOf('For house blocks in NSW')).toBeLessThan(text.indexOf('Start with your block'))
  })

  it('says where to find the Lot and DP, and calls the guide by its name', () => {
    expect(text).toContain('Lot and DP (the lot and plan numbers on your rates notice)')
    expect(text).toContain('Getting started')
  })
})
