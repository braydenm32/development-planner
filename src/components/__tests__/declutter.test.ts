// The plan's labels that would pile up (C20): the lower of two that overlap hides, by priority
// room > area > dimension > warning > contour number, whatever order they were drawn in.

import { describe, expect, it } from 'vitest'
import { crowded, LABEL_PRIORITY } from '../declutter'

const box = (x: number, y: number, w = 40, h = 14) => ({ x, y, w, h })

describe('crowded plan labels', () => {
  it('keeps the higher priority of two that overlap, wherever it was drawn', () => {
    // A wall length drawn first, then a room name over it: the room name stays.
    const hidden = crowded([
      { priority: 2, box: box(100, 100) },
      { priority: 0, box: box(110, 104) },
    ])
    expect([...hidden]).toEqual([0])
  })

  it('runs down the order: room, area, dimension, warning, contour number', () => {
    expect(LABEL_PRIORITY[0]).toBe('.room-label')
    expect(LABEL_PRIORITY[1]).toBe('.area-label')
    expect(LABEL_PRIORITY[LABEL_PRIORITY.length - 1]).toBe('text.contour-label')
    // "Garden beds", its 23 m², two warning flags and a 7000 all in one spot: only the area name stays.
    const labels = [
      { priority: 4, box: box(0, 0) },
      { priority: 3, box: box(5, 2, 20, 20) },
      { priority: 3, box: box(12, 2, 20, 20) },
      { priority: 2, box: box(0, 6) },
      { priority: 1, box: box(2, 4) },
    ]
    expect([...crowded(labels)].sort()).toEqual([0, 1, 2, 3])
  })

  it('never hides a room’s name, even over another room’s', () => {
    expect(crowded([{ priority: 0, box: box(0, 0) }, { priority: 0, box: box(10, 2) }]).size).toBe(0)
  })

  it('leaves labels apart alone, and ignores ones with nothing drawn', () => {
    expect(crowded([{ priority: 0, box: box(0, 0) }, { priority: 2, box: box(100, 0) }, { priority: 2, box: box(0, 0, 0, 0) }]).size).toBe(0)
    // Touching within a pixel counts as overlapping, so text never sits hard against text.
    expect(crowded([{ priority: 0, box: box(0, 0) }, { priority: 2, box: box(40.5, 0) }]).size).toBe(1)
  })
})
