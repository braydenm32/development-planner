// The Keyboard shortcuts list's switch for single-key shortcuts (WCAG 2.1.4).

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { setSingleKeys } from '../../nav/keys'
import { SingleKeysSwitch } from '../KeyboardHelp'

afterEach(() => setSingleKeys(true))

describe('Single-key shortcuts switch', () => {
  it('is a labelled tick box that says what turning it off does', () => {
    const html = renderToStaticMarkup(<SingleKeysSwitch />)
    expect(html).toMatch(/<label[^>]*><input type="checkbox"/)
    expect(html).toContain('Single-key shortcuts')
    expect(html).toContain('speech input')
  })
})
