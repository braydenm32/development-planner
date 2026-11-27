// What the Keyboard shortcuts list says about Enter, Esc and Cut.

import { describe, expect, it } from 'vitest'
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
})
