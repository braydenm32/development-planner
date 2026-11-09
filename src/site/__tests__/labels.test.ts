import { describe, expect, it } from 'vitest'
import { mergeRepeatedLabels } from '../SitePlanLayer'

// Points named alike on the plan, at screen positions (px).
const pit = (id: string, at: [number, number], text = 'Manhole') => ({ id, text, at })

describe('repeated site labels', () => {
  it('names points that would overlap once, with a count', () => {
    // "Manhole" is about 7 × 5.8 = 41 px wide: two pits 20 px apart would print over each other.
    const m = mergeRepeatedLabels([pit('a', [100, 100]), pit('b', [120, 104])])
    expect(m.get('a')).toBe('Manhole ×2')
    expect(m.get('b')).toBe('')
  })

  it('leaves names alone when they have room, or differ', () => {
    // 60 px apart side by side, or 20 px apart one above the other: both clear.
    expect(mergeRepeatedLabels([pit('a', [100, 100]), pit('b', [160, 100])]).size).toBe(0)
    expect(mergeRepeatedLabels([pit('a', [100, 100]), pit('b', [100, 120])]).size).toBe(0)
    expect(mergeRepeatedLabels([pit('a', [100, 100]), pit('b', [101, 100], 'Pit')]).size).toBe(0)
  })

  it('counts every point in the cluster, and keeps clusters apart', () => {
    const m = mergeRepeatedLabels([pit('a', [100, 100]), pit('b', [105, 102]), pit('c', [110, 98]), pit('d', [400, 100]), pit('e', [404, 100])])
    expect(m.get('a')).toBe('Manhole ×3')
    expect(m.get('b')).toBe('')
    expect(m.get('c')).toBe('')
    expect(m.get('d')).toBe('Manhole ×2')
    expect(m.get('e')).toBe('')
  })

  it('skips points without a name', () => {
    expect(mergeRepeatedLabels([{ id: 'a', text: undefined, at: [0, 0] }, { id: 'b', text: undefined, at: [0, 0] }]).size).toBe(0)
  })
})
