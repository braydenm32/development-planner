// The name tips on icon buttons (Undo, Redo, the tools) go away on Esc without moving the pointer
// or the focus, and come back the next time (AX-39, WCAG 1.4.13).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dismissTips, TIP_OFF, TIP_SHOWING, type TipButton } from '../tips'

/** A stand-in for a button: its attributes, and what is listening on it. */
function button() {
  const attrs = new Set<string>()
  const heard = new Map<string, () => void>()
  const el: TipButton = {
    setAttribute: name => void attrs.add(name),
    removeAttribute: name => void attrs.delete(name),
    addEventListener: (type, fn) => void heard.set(type, fn),
    removeEventListener: type => void heard.delete(type),
  }
  return { el, attrs, heard, fire: (type: string) => heard.get(type)?.() }
}

describe('a button’s name tip', () => {
  it('is put away by Esc until the pointer leaves, then shows again as before', () => {
    const b = button()
    dismissTips([b.el])
    expect(b.attrs.has(TIP_OFF)).toBe(true)
    b.fire('pointerleave')
    expect(b.attrs.has(TIP_OFF)).toBe(false)
    // Nothing left listening.
    expect(b.heard.size).toBe(0)
  })

  it('comes back after the keyboard’s focus moves on, too', () => {
    const b = button()
    dismissTips([b.el])
    b.fire('blur')
    expect(b.attrs.has(TIP_OFF)).toBe(false)
  })

  it('is the tip the stylesheet draws: the same buttons, hidden by the same attribute', () => {
    const css = readFileSync(new URL('../shell.css', import.meta.url), 'utf8')
    expect(TIP_SHOWING).toBe('button[data-tip]:hover, button[data-tip]:focus-visible')
    expect(css).toMatch(/\.app-shell button\[data-tip\]:hover::after,\s*\.app-shell button\[data-tip\]:focus-visible::after \{\s*content: attr\(data-tip\)/)
    expect(css).toMatch(new RegExp(`\\.app-shell button\\[data-tip\\]\\[${TIP_OFF}\\]::after \\{\\s*display: none;`))
  })
})
