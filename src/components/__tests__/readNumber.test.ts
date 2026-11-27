import { describe, expect, it } from 'vitest'
import { readNumber } from '../readNumber'

describe('reading a number box in mm', () => {
  it('reads a bare whole number as millimetres, whatever its size (LD-11)', () => {
    expect(readNumber('900', 'mm', false)).toEqual({ ok: true, value: 0.9, said: undefined })
    expect(readNumber(' 2400 ', 'mm', false)).toMatchObject({ ok: true, value: 2.4 })
    // 9 and 10 mean the same kind of thing: the meaning no longer flips at 10.
    expect(readNumber('9', 'mm', false)).toEqual({ ok: true, value: 0.009, said: undefined })
    expect(readNumber('10', 'mm', false)).toEqual({ ok: true, value: 0.01, said: undefined })
    expect(readNumber('5', 'mm', false, 0.05, 1)).toEqual({ ok: false, hint: 'Min 50 mm' })
  })

  it('reads a decimal point as metres, and says so', () => {
    expect(readNumber('0.9', 'mm', false)).toEqual({ ok: true, value: 0.9, said: '= 900 mm' })
    expect(readNumber('9.0', 'mm', false)).toEqual({ ok: true, value: 9, said: '= 9000 mm' })
    expect(readNumber('12.5', 'mm', false)).toEqual({ ok: true, value: 12.5, said: '= 12500 mm' })
    expect(readNumber('2,4', 'mm', false)).toEqual({ ok: true, value: 2.4, said: '= 2400 mm' })
  })

  it('reads a thousands comma or space as part of the number, and says what it read', () => {
    expect(readNumber('12,000', 'mm', false)).toEqual({ ok: true, value: 12, said: '= 12000 mm' })
    expect(readNumber('12 000', 'mm', false)).toEqual({ ok: true, value: 12, said: '= 12000 mm' })
    expect(readNumber('1,200 mm', 'mm', false)).toEqual({ ok: true, value: 1.2, said: '= 1200 mm' })
    expect(readNumber('1,234,567', 'mm', false)).toMatchObject({ ok: true, value: 1234.567 })
    expect(readNumber('12,00', 'mm', false)).toEqual({ ok: true, value: 12, said: '= 12000 mm' })
    expect(readNumber('1,2,3', 'mm', false)).toEqual({ ok: false, hint: 'Enter a number' })
  })

  it('says how to type metres when a small bare number is under the minimum', () => {
    expect(readNumber('9', 'mm', false, 0.05, 200)).toEqual({ ok: false, hint: 'Min 50 mm (for 9 m, type 9m)' })
    expect(readNumber('12', 'mm', false, 0.05, 200)).toEqual({ ok: false, hint: 'Min 50 mm (for 12 m, type 12m)' })
    // Not when metres wouldn't fit either, or when mm was said.
    expect(readNumber('9', 'mm', false, 0.05, 1)).toEqual({ ok: false, hint: 'Min 50 mm' })
    expect(readNumber('9mm', 'mm', false, 0.05, 200)).toEqual({ ok: false, hint: 'Min 50 mm' })
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

  it('gives a reason of its own for a value in range that still can’t be used (LD-12)', () => {
    const check = (v: number) => (v > 2 ? 'Max 2000 mm, the clear width of its wall' : null)
    expect(readNumber('2500', 'mm', false, 0.3, 12, check)).toEqual({ ok: false, hint: 'Max 2000 mm, the clear width of its wall' })
    expect(readNumber('1800', 'mm', false, 0.3, 12, check)).toMatchObject({ ok: true, value: 1.8 })
    // The range is said first.
    expect(readNumber('100', 'mm', false, 0.3, 12, check)).toEqual({ ok: false, hint: 'Min 300 mm' })
  })
})

describe('reading other number boxes', () => {
  it('takes the number as it is', () => {
    expect(readNumber('22.5', '°', false)).toEqual({ ok: true, value: 22.5, said: undefined })
    expect(readNumber('45.5', 'RL', false, 40, 50)).toMatchObject({ ok: true, value: 45.5 })
    expect(readNumber('1,005.25', 'm', false)).toMatchObject({ ok: true, value: 1005.25 })
    expect(readNumber('22,5', '°', false)).toMatchObject({ ok: true, value: 22.5 })
    expect(readNumber('abc', '°', false)).toEqual({ ok: false, hint: 'Enter a number' })
  })

  it('does not scale a box that is already in its unit', () => {
    expect(readNumber('0.9', 'mm', true)).toEqual({ ok: true, value: 0.9, said: undefined })
  })

  it('gives the range with the box’s unit', () => {
    expect(readNumber('5', '°', false, 10)).toEqual({ ok: false, hint: 'Min 10 °' })
    expect(readNumber('60', 'RL', false, 0, 50)).toEqual({ ok: false, hint: 'Max 50' })
  })
})
