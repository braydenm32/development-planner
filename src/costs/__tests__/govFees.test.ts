// The council and government fees, worked by hand from the published scales: the NSW DA fee for
// 2026/27, the long service levy, Wollongong's section 7.12 levy, and the council and pathway a
// plan's check settings give.

import { describe, expect, it } from 'vitest'
import { contribution, daFee, feeContextOf, longServiceLevy, NO_FEE_CONTEXT } from '../govFees'

describe('the DA fee', () => {
  it('follows the 2026/27 scale, a part of $1,000 counting as a whole one', () => {
    expect(daFee(0)).toBe(0)
    expect(daFee(4_000)).toBe(153)
    // $50,001 to $250,000: $488 plus $3.64 for each $1,000 over $50,000.
    expect(daFee(150_000)).toBeCloseTo(488 + 3.64 * 100, 9)
    expect(daFee(150_000.01)).toBeCloseTo(488 + 3.64 * 101, 9)
    // $250,001 to $500,000: $1,608 plus $2.34 for each $1,000 over $250,000.
    expect(daFee(400_000)).toBeCloseTo(1_608 + 2.34 * 150, 9)
    // $500,001 to $1 million: $2,420 plus $1.64.
    expect(daFee(750_000)).toBeCloseTo(2_420 + 1.64 * 250, 9)
    // $1,000,001 to $10 million: $3,625 plus $1.44.
    expect(daFee(1_200_000)).toBeCloseTo(3_625 + 1.44 * 200, 9)
  })
})

describe('the long service levy', () => {
  it('is 0.25% of work costing $250,000 or more, and nothing under', () => {
    expect(longServiceLevy(249_999)).toBe(0)
    expect(longServiceLevy(250_000)).toBeCloseTo(625, 9)
    expect(longServiceLevy(600_000)).toBeCloseTo(1_500, 9)
  })
})

describe('the council’s development contribution', () => {
  it('is Wollongong’s 7.12 levy: nil to $100,000, 0.5% to $200,000, 1% over', () => {
    expect(contribution('wollongong', 90_000)!.amount).toBe(0)
    expect(contribution('wollongong', 200_000)!.amount).toBeCloseTo(1_000, 9)
    expect(contribution('wollongong', 600_000)).toMatchObject({ amount: 6_000, rate: 0.01 })
  })

  it('has no figure for a council the app has no plan for, or none', () => {
    expect(contribution('kiama', 600_000)).toBeNull()
    expect(contribution(null, 600_000)).toBeNull()
  })
})

describe('the fee context', () => {
  it('comes from the plan’s check settings: the council switched on, and DA or CDC', () => {
    expect(feeContextOf({ checks: { pathway: 'da', battleAxe: false, councils: { wollongong: true } } })).toEqual({ council: { id: 'wollongong', name: 'Wollongong' }, da: true })
    expect(feeContextOf({ checks: { pathway: 'cdc', battleAxe: false, councils: {} } })).toEqual({ council: null, da: false })
    // A plan with no check settings yet: CDC, with no council.
    expect(feeContextOf({})).toEqual({ council: null, da: false })
    expect(NO_FEE_CONTEXT).toEqual({ council: null, da: true })
  })
})
