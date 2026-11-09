// The 3D view's Show menu (C18): roof, each level, trees and furniture, on every 3D toolbar.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW } from '../../lib/storage'
import { viewFor } from '../../projects/prefs'
import { PresetBar } from '../CanvasBits'
import { hiddenCount } from '../showMenu'

const levels = [
  { id: 'g', name: 'Ground floor' },
  { id: 'u', name: 'Upper floor' },
]

describe('the Show menu', () => {
  it('sits on the 3D toolbar, saying how many things are hidden', () => {
    const set = () => {}
    const html = (view = DEFAULT_VIEW, phone = false) =>
      renderToStaticMarkup(<PresetBar phone={phone} presenting={false} setPresenting={() => {}} show={{ view, set, levels }} />)
    expect(html()).toContain('>Show<')
    expect(html()).not.toContain(' off<')
    expect(html({ ...DEFAULT_VIEW, showRoof: false, hiddenLevels: ['u'] })).toContain('2 off')
    // On a phone it's the icon, named for a screen reader.
    expect(html({ ...DEFAULT_VIEW, showTrees: false }, true)).toContain('aria-label="Show, 1 off"')
    // Full screen for showing people keeps the bar to Done and the camera.
    expect(renderToStaticMarkup(<PresetBar phone presenting setPresenting={() => {}} show={{ view: DEFAULT_VIEW, set, levels }} />)).not.toContain('Show,')
  })

  it('counts a level only while the house has more than one, and ids from elsewhere not at all', () => {
    const view = { ...DEFAULT_VIEW, hiddenLevels: ['u', 'gone'] }
    expect(hiddenCount(view, levels)).toBe(1)
    expect(hiddenCount(view, [levels[1]])).toBe(0)
  })

  it('opens an older project with everything showing', () => {
    // Saved before the menu: no hidden levels, and the trees on.
    const v = viewFor({ view: { showRoof: false } }, DEFAULT_VIEW)
    expect(v.hiddenLevels).toEqual([])
    expect(v.showTrees).toBe(true)
    expect(v.showRoof).toBe(false)
  })
})
