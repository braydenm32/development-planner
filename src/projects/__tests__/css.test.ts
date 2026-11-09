// All projects is styled by projects.css, but it also opens inside the app shell, whose
// shell.css has its own rules for buttons. These read both stylesheets and work out which
// `color` wins on the 'Delete for good' button there, so a shell rule can't quietly paint its
// label the same red as the button again.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

interface Hit {
  selector: string
  specificity: [number, number]
  color: string
}

/**
 * The plain rules (no pseudo-classes, no combinators but descendant) in `text` that set `color`
 * and match an element with `tag` and `classes` sitting inside ancestors with `ancestors`.
 */
function colorRules(text: string, tag: string, classes: string[], ancestors: string[]): Hit[] {
  const hits: Hit[] = []
  const body = text.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const color = /(?:^|;|\s)color:\s*([^;]+)/.exec(m[2])?.[1].trim()
    if (!color) continue
    for (const raw of m[1].split(',')) {
      const selector = raw.trim()
      if (!selector || /[:>+~[]/.test(selector)) continue
      const parts = selector.split(/\s+/)
      const tokens = (compound: string) => compound.match(/[.#]?[a-z0-9_-]+/gi) ?? []
      const fits = (compound: string, own: string[], ownTag?: string) =>
        tokens(compound).every(t => (t.startsWith('.') ? own.includes(t.slice(1)) : t === ownTag))
      const last = parts[parts.length - 1]
      if (!fits(last, classes, tag)) continue
      if (!parts.slice(0, -1).every(p => fits(p, ancestors))) continue
      const all = parts.flatMap(tokens)
      hits.push({
        selector,
        specificity: [all.filter(t => t.startsWith('.')).length, all.filter(t => !/^[.#]/.test(t)).length],
        color,
      })
    }
  }
  return hits
}

const outranks = (a: Hit, b: Hit) => a.specificity[0] > b.specificity[0] || (a.specificity[0] === b.specificity[0] && a.specificity[1] > b.specificity[1])

describe('the Delete for good button inside the app shell', () => {
  it('keeps a white label on its red background', () => {
    const shell = colorRules(css('../../shell/shell.css'), 'button', ['ph-btn', 'danger', 'ph-a-del'], ['app-shell'])
    const projects = colorRules(css('../projects.css'), 'button', ['ph-btn', 'danger', 'ph-a-del'], ['app-shell'])
    // The shell's red-text rule for its own buttons does reach this one...
    expect(shell.some(h => h.color === 'var(--danger)')).toBe(true)
    // ...so projects.css needs a white rule that outranks every shell rule setting a colour.
    const white = projects.filter(h => /^#fff(fff)?$/i.test(h.color))
    expect(white.length).toBeGreaterThan(0)
    for (const s of shell) expect(white.some(w => outranks(w, s)), `${s.selector} beats the white label`).toBe(true)
  })
})
