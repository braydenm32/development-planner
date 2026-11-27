// The plan's labels that would pile up (C20): the lower of two that overlap hides, by priority
// room > area > dimension > warning > contour number, whatever order they were drawn in.

import { describe, expect, it } from 'vitest'
import { crowded, fitName, LABEL_PRIORITY } from '../declutter'

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
    expect(LABEL_PRIORITY[0]).toBe('.room-label .room-name')
    expect(LABEL_PRIORITY[1]).toBe('.room-label .room-area')
    expect(LABEL_PRIORITY[2]).toBe('.area-label')
    expect(LABEL_PRIORITY[LABEL_PRIORITY.length - 1]).toBe('text.contour-label')
    // "Garden beds", its 23 m², two warning flags and a 7000 all in one spot: only the area name stays.
    const labels = [
      { priority: 7, box: box(0, 0) },
      { priority: 5, box: box(5, 2, 20, 20) },
      { priority: 5, box: box(12, 2, 20, 20) },
      { priority: 4, box: box(0, 6) },
      { priority: 2, box: box(2, 4) },
    ]
    expect([...crowded(labels)].sort()).toEqual([0, 1, 2, 3])
  })

  it('never hides a room’s name, even over another room’s', () => {
    expect(crowded([{ priority: 0, box: box(0, 0) }, { priority: 0, box: box(10, 2) }]).size).toBe(0)
  })

  it('drops a room’s area and note where they would print through a neighbour’s name (PH-16)', () => {
    // The example at a phone's fitted zoom: Kitchen's area and "on piers" land on "Living" and its area.
    const kitchen = {}
    const living = {}
    const labels = [
      { priority: 0, box: box(200, 100, 110, 14), own: kitchen },
      { priority: 1, box: box(225, 114, 50, 14), own: kitchen },
      { priority: 1, box: box(228, 128, 46, 14), own: kitchen },
      { priority: 0, box: box(190, 116, 40, 14), own: living },
      { priority: 1, box: box(185, 130, 50, 14), own: living },
    ]
    // Both names stay. Kitchen's area and note would run through "Living", so they hide; Living keeps its area.
    expect([...crowded(labels)].sort()).toEqual([1, 2])
    // With the rooms apart, every line shows: a label's own lines touch one another and never hide each other.
    expect(crowded(labels.map((l, i) => (i > 2 ? { ...l, box: { ...l.box, x: l.box.x + 300 } } : l))).size).toBe(0)
  })

  it('hides "Ground meets floor" where it would run through a room’s label (HO-43)', () => {
    const ground = LABEL_PRIORITY.indexOf('text.ground-meets-label')
    expect(ground).toBeGreaterThan(LABEL_PRIORITY.indexOf('text.dim'))
    expect([...crowded([{ priority: ground, box: box(90, 90, 150, 30) }, { priority: 0, box: box(100, 100) }])]).toEqual([0])
  })

  it('leaves labels apart alone, and ignores ones with nothing drawn', () => {
    expect(crowded([{ priority: 0, box: box(0, 0) }, { priority: 2, box: box(100, 0) }, { priority: 2, box: box(0, 0, 0, 0) }]).size).toBe(0)
    // Touching within a pixel counts as overlapping, so text never sits hard against text.
    expect(crowded([{ priority: 0, box: box(0, 0) }, { priority: 2, box: box(40.5, 0) }]).size).toBe(1)
  })
})

describe('a room’s name across a narrow room on a phone (PH-16)', () => {
  it('stays whole where it fits', () => {
    expect(fitName('Living', 60)).toBe('Living')
    expect(fitName('Kitchen and dining', Infinity)).toBe('Kitchen and dining')
  })

  it('is cut at a word, never at a joining word, and never shorter than its first word', () => {
    expect(fitName('Kitchen and dining', 100)).toBe('Kitchen…')
    expect(fitName('Main bedroom with robe', 100)).toBe('Main bedroom…')
    expect(fitName('Kitchen and dining', 10)).toBe('Kitchen…')
    expect(fitName('Rumpus', 10)).toBe('Rumpus')
  })
})
