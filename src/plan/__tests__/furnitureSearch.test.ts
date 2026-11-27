// Finding furniture by typing, and the custom box (HO-28, CB-22).

import { describe, expect, it } from 'vitest'
import { CATALOG, furnitureSymbol, newFurniture } from '../furniture'
import { CUSTOM_BOX } from '../furnitureCatalog'
import { searchCatalog } from '../furnitureSearch'

const keys = (q: string) => searchCatalog(q).map(c => c.key)

describe('searching the furniture list', () => {
  it('finds pieces by the start of any word of their name, in any room', () => {
    expect(keys('bed')).toEqual(expect.arrayContaining(['bed-single', 'bed-queen', 'bed-king', 'bedside']))
    expect(keys('que')).toEqual(['bed-queen'])
    expect(keys('table')).toEqual(expect.arrayContaining(['bedside', 'coffee-table', 'dining-4', 'outdoor-table']))
    expect(keys('  KING   bed ')).toEqual(['bed-king-single', 'bed-king'])
  })

  it('finds them by the other words people use, and by room', () => {
    expect(keys('couch')).toEqual(['sofa-2', 'sofa-3', 'sofa-corner'])
    expect(keys('refrigerator')).toEqual(['fridge'])
    expect(keys('loo')).toEqual(['toilet'])
    expect(keys('barbecue')).toEqual(['bbq'])
    expect(keys('laundry')).toEqual(expect.arrayContaining(['washer', 'dryer', 'tub']))
    // The pantry, tank and pool have their own pieces now; the custom box still stands in for a shed.
    expect(keys('pantry')).toEqual(['pantry'])
    expect(keys('water tank')).toEqual(['tank'])
    expect(keys('pool')).toEqual(['pool'])
    expect(keys('shed')).toEqual([CUSTOM_BOX])
  })

  it('puts pieces whose own name matches first', () => {
    // "sink" is the Sink's name, and another word for the vanity basin and the laundry tub.
    expect(keys('sink')[0]).toBe('sink')
    expect(keys('sink')).toEqual(expect.arrayContaining(['vanity', 'tub']))
  })

  it('gives everything for nothing typed, and nothing for a word no piece has', () => {
    expect(searchCatalog('')).toHaveLength(CATALOG.length)
    expect(searchCatalog('   ')).toHaveLength(CATALOG.length)
    expect(keys('trampoline')).toEqual([])
  })
})

describe('the custom box', () => {
  it('is a plain box at a size to change, with the name it is given written on it', () => {
    const box = newFurniture(CUSTOM_BOX, 'level_ground', [1, 1])!
    expect(box).toMatchObject({ width: 1, depth: 0.6, height: 0.9 })
    expect(furnitureSymbol(box).code).toBeNull()
    expect(furnitureSymbol({ ...box, label: 'Pantry' }).code).toBe('Pantry')
    expect(furnitureSymbol({ ...box, label: 'A very long name for a cupboard' }).code).toHaveLength(14)
    // Other pieces keep their own note, whatever they're called.
    expect(furnitureSymbol({ ...newFurniture('fridge', 'level_ground', [0, 0])!, label: 'Beer fridge' }).code).not.toBe('Beer fridge')
  })
})
