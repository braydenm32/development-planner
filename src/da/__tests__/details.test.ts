// The DA pack's site details: typed above Download, kept as the project's own record (never in the
// plan, so never on a share link), and falling back to the map placement when left blank.

import { describe, expect, it } from 'vitest'
import { DA_DETAILS_KIND, emptyDaDetails, normalizeDaDetails, packDetails, setDaDetail, useDaDetails } from '../details'

describe('the DA pack’s site details', () => {
  it('start blank, with no made-up defaults', () => {
    expect(emptyDaDetails()).toEqual({ address: '', lot: '', preparedBy: '' })
    expect(normalizeDaDetails(undefined)).toEqual(emptyDaDetails())
    expect(normalizeDaDetails({ address: 3, lot: null, preparedBy: ['x'] })).toEqual(emptyDaDetails())
  })

  it('are tidied as typed: one line, trimmed, not too long', () => {
    expect(normalizeDaDetails({ address: '  1 Example   Street\n Sampleton ', lot: 'Lot 1 DP 123456', preparedBy: 'A. Designer' })).toEqual({
      address: '1 Example Street Sampleton',
      lot: 'Lot 1 DP 123456',
      preparedBy: 'A. Designer',
    })
    expect(normalizeDaDetails({ address: 'x'.repeat(500) }).address).toHaveLength(120)
  })

  it('what’s typed wins; a blank falls back to the map placement', () => {
    const map = { address: '1 Example Street Sampleton 2000', lot: 'Lot 1 DP123456' }
    expect(packDetails(emptyDaDetails(), map)).toEqual({ place: map, preparedBy: null })
    expect(packDetails({ address: '2 Sample Road', lot: '', preparedBy: 'A. Designer' }, map)).toEqual({ place: { address: '2 Sample Road', lot: map.lot }, preparedBy: 'A. Designer' })
    expect(packDetails({ address: '', lot: 'Lot 2 DP 654321', preparedBy: '' }, null)).toEqual({ place: { address: null, lot: 'Lot 2 DP 654321' }, preparedBy: null })
    expect(packDetails(emptyDaDetails(), null)).toEqual({ place: null, preparedBy: null })
  })

  it('a change goes into the store as typed, cleaned', () => {
    setDaDetail('preparedBy', '  A. Designer ')
    expect(useDaDetails.getState().details.preparedBy).toBe('A. Designer')
    setDaDetail('preparedBy', '')
    expect(useDaDetails.getState().details.preparedBy).toBe('')
  })

  it('is its own record kind, not part of the plan', () => {
    expect(DA_DETAILS_KIND).toBe('da-details')
  })
})
