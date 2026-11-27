// What the Keyboard shortcuts list says about Enter, Esc and Cut.

import { describe, expect, it } from 'vitest'
import { TOOLS } from '../../components/tools'
import { allPlaces } from '../../nav/menu'
import { SHORTCUTS } from '../shortcuts'

describe('the keyboard shortcuts list', () => {
  const rows = SHORTCUTS.flatMap(g => g.rows)
  const row = (k: string) => rows.filter(r => r.keys.includes(k)).map(r => r.what)

  it('says Enter keeps the value and stays in the box', () => {
    expect(row('Enter').join(' ')).toMatch(/stay in the box/)
  })

  it('says what Esc does in every drawing tool: end the run, then Select, then clear', () => {
    expect(row('Esc')[0]).toMatch(/End what you are drawing.*back to Select.*clear the selection/)
  })

  it('lists Cut', () => {
    expect(row('mod+X')[0]).toMatch(/^Cut/)
  })

  // LD-22: the Tool keys hint in search left out L, E, K and B; it's built from this list now.
  it('gives search’s Tool keys hint every tool letter the list has', () => {
    const hint = allPlaces().find(p => p.entry.id === 'kbd-tools')!.entry.hint!
    const letters = SHORTCUTS.find(g => g.title === 'Tools')!.rows.flatMap(r => r.keys).filter(k => /^[A-Z]$/.test(k))
    for (const t of TOOLS) expect(letters, t.label).toContain(t.key)
    for (const k of [...letters, 'X', 'B']) expect(hint, k).toMatch(new RegExp(`\\b${k} [a-z]`))
    expect(hint).toContain('A outdoor area')
  })
})
