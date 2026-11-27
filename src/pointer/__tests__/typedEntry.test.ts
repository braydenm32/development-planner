import { describe, expect, it } from 'vitest'
import { typedKey, typedLabel, typedPoint } from '../typedEntry'

const type = (keys: string, angles = true) => [...keys].reduce<string>((t, k) => typedKey(t, k, angles) ?? t, '')
const near = (p: [number, number] | null, x: number, y: number) => {
  expect(p).not.toBeNull()
  expect(p![0]).toBeCloseTo(x, 6)
  expect(p![1]).toBeCloseTo(y, 6)
}

describe('typed entry while drawing (DB-19)', () => {
  it('reads a bare number as mm towards the pointer', () => {
    near(typedPoint([1, 1], [5, 1], '3000'), 4, 1)
    near(typedPoint([0, 0], [0, -2], '450'), 0, -0.45)
  })

  it('reads metres as the number boxes do: a decimal point or an m', () => {
    near(typedPoint([0, 0], [1, 0], '4.5'), 4.5, 0)
    near(typedPoint([0, 0], [1, 0], '4.5m'), 4.5, 0)
    near(typedPoint([0, 0], [1, 0], '9m'), 9, 0)
    near(typedPoint([0, 0], [1, 0], '900mm'), 0.9, 0)
  })

  it('reads length<angle whatever way the pointer points, anticlockwise from the house’s x', () => {
    near(typedPoint([0, 0], [-7, 3], '3000<45'), 3 * Math.SQRT1_2, 3 * Math.SQRT1_2)
    near(typedPoint([2, 2], [9, 9], '1000<-90'), 2, 1)
    near(typedPoint([0, 0], [1, 0], '2.5m<180'), -2.5, 0)
  })

  it('goes towards the pointer while the angle is still to come', () => {
    near(typedPoint([0, 0], [0, 4], '3000<'), 0, 3)
    near(typedPoint([0, 0], [0, 4], '3000<-'), 0, 3)
  })

  it('reads @across,up as an offset in mm from the last point', () => {
    near(typedPoint([1, 1], [0, 0], '@3000,-500'), 4, 0.5)
    expect(typedPoint([1, 1], [0, 0], '@3000')).toBeNull()
    expect(typedPoint([1, 1], [0, 0], '@0,0')).toBeNull()
  })

  it('has no point for nothing, zero or half an entry', () => {
    expect(typedPoint([0, 0], [1, 0], '')).toBeNull()
    expect(typedPoint([0, 0], [1, 0], '0')).toBeNull()
    expect(typedPoint([0, 0], [0, 0], '3000')).toBeNull()
  })

  it('takes only the keys that belong in an entry', () => {
    expect(type('3000<45')).toBe('3000<45')
    expect(type('3000<-30')).toBe('3000<-30')
    expect(type('2.5m')).toBe('2.5m')
    expect(type('900mm')).toBe('900mm')
    expect(type('@3000,-500')).toBe('@3000,-500')
    // One point, one <, no unit on an angle, nothing after a unit.
    expect(type('1.2.3')).toBe('1.23')
    expect(type('30<<45')).toBe('30<45')
    expect(type('30<45m')).toBe('30<45')
    expect(type('2m5')).toBe('2m')
    expect(type('-5')).toBe('5')
  })

  it('leaves letters to the shortcuts until a number is being typed', () => {
    expect(typedKey('', 'm')).toBeNull()
    expect(typedKey('', 'w')).toBeNull()
    expect(typedKey('25', 'w')).toBeNull()
    expect(typedKey('', '<')).toBeNull()
    expect(typedKey('', 'Enter')).toBeNull()
  })

  it('takes only a radius where an angle means nothing', () => {
    expect(type('1500<45', false)).toBe('150045')
    expect(typedKey('', '@', false)).toBeNull()
  })

  it('shows mm after plain digits and the entry as typed otherwise', () => {
    expect(typedLabel('3000')).toBe('3000▌ mm')
    expect(typedLabel('3000<45')).toBe('3000<45▌')
    expect(typedLabel('4.5m')).toBe('4.5m▌')
  })
})
