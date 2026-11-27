// Number and text boxes: Enter keeps the value where the cursor is, and a box with nothing typed
// in it leaves Undo to the app.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { settled } from '../fieldKeys'
import { Num, TextField } from '../fields'

describe('a box with nothing typed since its value was kept', () => {
  it('is marked settled, so Ctrl+Z there undoes in the app', () => {
    expect(renderToStaticMarkup(<Num label="Pitch" unit="°" value={22.5} onCommit={() => {}} />)).toContain('data-settled=""')
    expect(renderToStaticMarkup(<TextField label="Name" value="Room 1" onCommit={() => {}} />)).toContain('data-settled=""')
  })

  it('stops being settled once something different is typed', () => {
    expect(settled(null, '22.5')).toBe('')
    expect(settled('22.5', '22.5')).toBe('')
    expect(settled('25', '22.5')).toBeUndefined()
  })
})
