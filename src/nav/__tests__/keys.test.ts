// The one rule every window-level key handler asks before a shortcut fires, and the Single-key
// shortcuts setting.

import { afterEach, describe, expect, it } from 'vitest'
import { setSingleKeys, shortcutAllowed, singleKeysOn, textEntry, type KeyScene, type KeyTarget } from '../keys'

const CALM: KeyScene = { overlay: false, tabbing: false, singleKeys: true }

/** A stand-in for the element a key was pressed on; `inside` lists the selectors `closest` finds. */
const el = (tagName: string, more: Partial<KeyTarget> & { inside?: string[] } = {}): KeyTarget => ({
  tagName,
  ...more,
  closest: (selector: string) => ((more.inside ?? []).some(s => selector.includes(s)) ? {} : null),
})
const key = (k: string, target: KeyTarget | null, mod = false) => ({ key: k, ctrlKey: mod, metaKey: false, target })

const body = el('BODY')
const text = el('INPUT', { type: 'text' })
const number = el('INPUT') // no type: a text box
const settled = el('INPUT', { type: 'text', dataset: { settled: '' } })
const area = el('TEXTAREA')
const tick = el('INPUT', { type: 'checkbox' })
const radio = el('INPUT', { type: 'radio' })
const dropdown = el('SELECT')
const panelButton = el('BUTTON', { inside: ['button'] })
const railButton = el('BUTTON', { inside: ['button', '.tool-rail'] })

afterEach(() => setSingleKeys(true))

describe('what counts as typing', () => {
  it('is a text or number box, a text area or editable text, and nothing else', () => {
    expect([text, number, area, el('DIV', { isContentEditable: true })].map(textEntry)).toEqual([true, true, true, true])
    expect([tick, radio, dropdown, panelButton, body, el('INPUT', { type: 'range' }), null].map(textEntry)).toEqual([false, false, false, false, false, false, false])
  })
})

describe('may a shortcut fire?', () => {
  it('fires single keys from the page and the plan', () => {
    expect(shortcutAllowed(key('w', body), CALM)).toBe(true)
    expect(shortcutAllowed(key('Delete', null), CALM)).toBe(true)
    expect(shortcutAllowed(key('ArrowRight', el('svg', { inside: ['.plan-editor'] })), CALM)).toBe(true)
  })

  it('never fires behind an open dialog, sheet, menu or the search palette', () => {
    const open = { ...CALM, overlay: true }
    for (const k of ['w', 'Delete', 'ArrowDown', 'Escape', 'PageUp']) expect(shortcutAllowed(key(k, panelButton), open)).toBe(false)
    expect(shortcutAllowed(key('z', body, true), open)).toBe(false)
  })

  it('leaves every key to a box being typed in, the browser’s own undo included', () => {
    for (const t of [text, number, area]) {
      expect(shortcutAllowed(key('w', t), CALM)).toBe(false)
      expect(shortcutAllowed(key('Escape', t), CALM)).toBe(false)
      expect(shortcutAllowed(key('z', t, true), CALM)).toBe(false)
      expect(shortcutAllowed(key('c', t, true), CALM)).toBe(false)
    }
  })

  it('undoes in the app from a box with nothing typed since its value was kept', () => {
    expect(shortcutAllowed(key('z', settled, true), CALM)).toBe(true)
    expect(shortcutAllowed(key('y', settled, true), CALM)).toBe(true)
    // Only Undo and Redo: copy and the single keys are still the box's.
    expect(shortcutAllowed(key('c', settled, true), CALM)).toBe(false)
    expect(shortcutAllowed(key('w', settled), CALM)).toBe(false)
  })

  it('undoes, copies and cuts from a dropdown, tick box, radio or button', () => {
    for (const t of [dropdown, tick, radio, panelButton]) for (const k of ['z', 'y', 'c', 'x']) expect(shortcutAllowed(key(k, t, true), CALM)).toBe(true)
  })

  it('keeps plain keys from a dropdown, tick box or radio, which use them', () => {
    for (const t of [dropdown, tick, radio]) for (const k of ['w', 'ArrowDown', 'Delete', 'Escape']) expect(shortcutAllowed(key(k, t), CALM)).toBe(false)
  })

  it('fires from a button that was clicked, but not from one reached with Tab outside the plan', () => {
    expect(shortcutAllowed(key('q', panelButton), CALM)).toBe(true)
    const tabbing = { ...CALM, tabbing: true }
    for (const k of ['w', 'Backspace', 'ArrowRight', 'PageUp', '?']) expect(shortcutAllowed(key(k, panelButton), tabbing)).toBe(false)
    // The tools beside the plan are part of the drawing; the page itself has no control in focus.
    expect(shortcutAllowed(key('d', railButton), tabbing)).toBe(true)
    expect(shortcutAllowed(key('w', body), tabbing)).toBe(true)
    // Esc always puts down what is in hand.
    expect(shortcutAllowed(key('Escape', panelButton), tabbing)).toBe(true)
  })

  it('turns single characters off with the setting, and nothing else', () => {
    const off = { ...CALM, singleKeys: false }
    for (const k of ['w', 'W', '?', '+', '[']) expect(shortcutAllowed(key(k, body), off)).toBe(false)
    for (const k of ['Escape', 'Delete', 'ArrowLeft', 'PageDown', 'Enter']) expect(shortcutAllowed(key(k, body), off)).toBe(true)
    expect(shortcutAllowed(key('z', body, true), off)).toBe(true)
    // A length typed while drawing isn't a shortcut.
    expect(shortcutAllowed(key('4', body), off)).toBe(true)
    expect(shortcutAllowed(key('.', body), off)).toBe(true)
  })
})

describe('the Single-key shortcuts setting', () => {
  it('is on until turned off, and the rule reads it', () => {
    expect(singleKeysOn()).toBe(true)
    expect(shortcutAllowed(key('w', body))).toBe(true)
    setSingleKeys(false)
    expect(singleKeysOn()).toBe(false)
    expect(shortcutAllowed(key('w', body))).toBe(false)
    expect(shortcutAllowed(key('Escape', body))).toBe(true)
  })
})
