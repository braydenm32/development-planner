import { describe, expect, it } from 'vitest'
import { readNumber } from '../readNumber'

describe('reading a number box in mm', () => {
  it('reads a bare number of 10 or more as millimetres', () => {
    expect(readNumber('900', 'mm', false)).toEqual({ ok: true, value: 0.9, said: undefined })
    expect(readNumber(' 2400 ', 'mm', false)).toMatchObject({ ok: true, value: 2.4 })
  })

  it('reads a bare number under 10 as metres, and says so', () => {
    expect(readNumber('0.9', 'mm', false)).toEqual({ ok: true, value: 0.9, said: '= 900 mm' })
    expect(readNumber('2,4', 'mm', false)).toEqual({ ok: true, value: 2.4, said: '= 2400 mm' })
  })

  it('follows an m or mm suffix', () => {
    expect(readNumber('0.9m', 'mm', false)).toMatchObject({ ok: true, value: 0.9, said: '= 900 mm' })
    expect(readNumber('12 M', 'mm', false)).toMatchObject({ ok: true, value: 12, said: '= 12000 mm' })
    expect(readNumber('5mm', 'mm', false)).toMatchObject({ ok: true, value: 0.005 })
    expect(readNumber('900 mm', 'mm', false)).toMatchObject({ ok: true, value: 0.9 })
  })

  it('says what is wrong with something unreadable', () => {
    expect(readNumber('', 'mm', false)).toEqual({ ok: false, hint: 'Enter a number' })
    expect(readNumber('wide', 'mm', false)).toEqual({ ok: false, hint: 'Enter a number' })
    expect(readNumber('9 feet', 'mm', false)).toEqual({ ok: false, hint: 'Enter a number' })
  })

  it('says the range in mm for a length', () => {
    expect(readNumber('0.2', 'mm', false, 0.3)).toEqual({ ok: false, hint: 'Min 300 mm' })
    expect(readNumber('250', 'mm', false, 0.3)).toEqual({ ok: false, hint: 'Min 300 mm' })
    expect(readNumber('3m', 'mm', false, 0.3, 2.5)).toEqual({ ok: false, hint: 'Max 2500 mm' })
    expect(readNumber('300', 'mm', false, 0.3)).toMatchObject({ ok: true })
  })
})

describe('reading other number boxes', () => {
  it('takes the number as it is', () => {
    expect(readNumber('22.5', '°', false)).toEqual({ ok: true, value: 22.5, said: undefined })
    expect(readNumber('45.5', 'RL', false, 40, 50)).toMatchObject({ ok: true, value: 45.5 })
  })

  it('does not scale a box that is already in its unit', () => {
    expect(readNumber('0.9', 'mm', true)).toEqual({ ok: true, value: 0.9, said: undefined })
  })

  it('gives the range with the box’s unit', () => {
    expect(readNumber('5', '°', false, 10)).toEqual({ ok: false, hint: 'Min 10 °' })
    expect(readNumber('60', 'RL', false, 0, 50)).toEqual({ ok: false, hint: 'Max 50' })
  })
})
