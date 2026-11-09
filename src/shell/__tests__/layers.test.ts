// What sits over what: a toast (the shell's notes, Undo, the Projects home's) never covers a
// dialog, so a note that comes up while Keyboard shortcuts, Search or a review is open can't
// hide what it says. Read from the stylesheets themselves.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = ['shell/shell.css', 'safety/safety.css', 'components/editing.css', 'projects/projects.css', 'cloud/cloud.css', 'sections/sections.css'].map(f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')).join('\n')

/** The z-index given to exactly this selector, in the first top-level rule for it that sets one. */
function z(selector: string): number {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const m of css.matchAll(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`, 'g'))) {
    const v = /z-index:\s*(\d+)/.exec(m[1])
    if (v) return Number(v[1])
  }
  throw new Error(`no z-index for ${selector}`)
}

const TOASTS = ['.toast', '.sf-toast', '.ph-toast']
const DIALOGS = ['.kbd-scrim', '.palette-backdrop', '.sf-scrim', '.cl-scrim', '.sec-scrim', '.ph-scrim']

describe('toasts and dialogs', () => {
  it('puts every dialog over every toast', () => {
    for (const d of DIALOGS) for (const t of TOASTS) expect(z(d), `${d} over ${t}`).toBeGreaterThan(z(t))
  })

  it('still puts a toast over the canvas, its cards and the Overview', () => {
    for (const t of TOASTS) {
      expect(z(t)).toBeGreaterThan(z('.sheet-backdrop'))
      expect(z(t)).toBeGreaterThan(z('.overview-sheet'))
    }
  })
})
