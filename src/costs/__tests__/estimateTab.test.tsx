// Costs › Estimate and the Costs strip as drawn, on the example project (a made-up house on the
// made-up sample block): one headline with the cross-check under it and the bridge between them
// under the total, the estimate marked up as a table, and the strip rounded as every strip is.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { exampleProjectText } from '../../example/exampleProject'
import { areaRoute } from '../../nav/route'
import { earthFrom, earthInputs } from '../../plan/useEarthworks'
import { readSite } from '../../safety/files'
import { parseProjectFile } from '../../share/project'
import type { Loaded } from '../../shell/useSite'
import type { Estimate } from '../estimate'
import { money, shortMoney } from '../format'
import { useCosts } from '../store'

const opened = parseProjectFile(exampleProjectText())
const site = readSite(opened.survey)
const earth = earthFrom(site.terrain.grid, site.survey.boundary, earthInputs(opened.plan, site.survey))
const d = { plan: opened.plan, survey: site.survey, terrain: site.terrain, earth } as unknown as Loaded

vi.mock('../../shell/useSite', () => ({ useLoaded: () => d }))

const { CostsStrip, EstimateTab } = await import('../CostsTabs')
const { useEstimate } = await import('../useEstimate')

/** Set the costs store, for a static render too (which reads the store's first state). */
function setCosts(patch: Partial<ReturnType<typeof useCosts.getState>>) {
  useCosts.setState(patch)
  Object.assign(useCosts.getInitialState(), useCosts.getState())
}

/** The estimate as the panel has it: the same hook, read in a render. */
function estimateNow(): Estimate {
  let out: Estimate | null = null
  const Probe = () => {
    out = useEstimate(d)
    return null
  }
  renderToStaticMarkup(<Probe />)
  return out!
}

const e = estimateNow()
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

describe('Costs › Estimate', () => {
  setCosts({ open: ['site'] })
  const html = renderToStaticMarkup(<EstimateTab />)

  it('has one headline, and the other figure as a cross-check that says what to make of it (HO-08)', () => {
    expect(e.against).toBe('under')
    expect(html).toContain(`<div class="ce-big tnum">${money(e.total)}</div>`)
    expect(html.split('ce-big').length - 1).toBe(1)
    const t = text(html)
    expect(t).toContain(`Cross-check Custom-built at a mid finish ${shortMoney(e.guide!.low)} to ${shortMoney(e.guide!.high)} The estimate is under it`)
    expect(t).toContain('Treat the estimate as a floor, not a budget.')
    expect(t).not.toContain('From quantities')
  })

  it('bridges the two under the total, in a table whose rows add up (HO-08, DB-15)', () => {
    const table = /<table class="ce-bridge[^>]*>(.*?)<\/table>/.exec(html)![1]
    expect(table).toContain('<caption>What’s not in the quantities yet')
    const amounts = [...table.matchAll(/<td>(\+?)\$([\d,]+)<\/td>/g)].map(m => Number(m[2].replace(/,/g, '')))
    expect(amounts.length).toBe(4)
    expect(amounts[0]).toBe(Math.round(e.total))
    expect(amounts[0] + amounts[1] + amounts[2]).toBe(amounts[3])
    expect(amounts[3]).toBe(Math.round(e.guide!.low))
    expect(table).toMatch(/<th scope="row">Not counted in the house itself<small>/)
  })

  it('is a table to a screen reader: column headers, a row header per item, the fold button in the first cell (AX-24)', () => {
    expect(html).toContain('<div role="table" aria-label="Estimate" class="ce-table">')
    expect(html).toContain('<span role="columnheader">Item</span><span role="columnheader">Quantity</span><span role="columnheader">Rate</span><span role="columnheader">Amount</span>')
    // A group's row: its name is the button that folds it, and its total sits under Amount.
    expect(html).toMatch(/<div role="row" class="ce-gh"><span role="rowheader" class="ce-gl"><button class="ce-fold" aria-expanded="true">.*?Site works<\/button><\/span><span role="cell" class="ce-fill" aria-colspan="2"><\/span><span role="cell" class="ce-amt tnum">\$[\d,]+<\/span><\/div>/)
    // A line: name, quantity, rate, amount, each a cell of its own (they used to be one button).
    const cut = e.lines.find(l => l.id === 'cut')!
    expect(html).toMatch(
      new RegExp(
        `<div role="row" class="ce-ln-main"><span role="rowheader" class="ce-what"><button class="ce-fold" aria-expanded="false"[^>]*>Dig out \\(cut\\)<small>From Cut &amp; fill</small></button></span><span role="cell" class="ce-qty tnum">${cut.qty.toFixed(1)} m³</span><span role="cell" class="ce-rate tnum">\\$85/m³</span><span role="cell" class="ce-amt tnum">\\${money(cut.amount)}</span></div>`,
      ),
    )
    // The totals are rows of the same table.
    expect(html).toMatch(/<div class="ce-sum-row total" role="row"><span role="rowheader">Total<\/span>/)
    // No buttons that swallow a whole row.
    expect(html).not.toContain('<button class="ce-ln-main"')
    expect(html).not.toContain('<button class="ce-gh" aria-expanded="true"')
  })

  it('gives an owner-builder Materials and Labour columns, with a group’s total across both', () => {
    setCosts({ data: { ...useCosts.getState().data, who: 'owner' } })
    const ob = renderToStaticMarkup(<EstimateTab />)
    setCosts({ data: { ...useCosts.getState().data, who: 'builder' } })
    expect(ob).toContain('<span role="columnheader">Materials and fees</span><span role="columnheader">Labour</span>')
    expect(ob).toMatch(/<span role="cell" class="ce-fill"><\/span><span role="cell" class="ce-amt tnum" aria-colspan="2">/)
  })
})

describe('the Costs strip', () => {
  const strip = (shown = {}) => renderToStaticMarkup(<CostsStrip d={d} route={areaRoute('costs')} shown={shown} onOverview={() => {}} overviewOpen={false} />)

  it('rounds the total as every strip and the Overview do, with the dollars on a hover (LD-27, AX-35)', () => {
    const t = text(strip())
    expect(t).toContain(`Estimate ${shortMoney(e.total)} ± 20%`)
    expect(t).not.toContain(money(e.total))
    expect(strip()).toContain(`title="${money(e.total)}, likely ${money(e.low)} to ${money(e.high)}"`)
    // On the Estimate tab, where the panel has it to the dollar, the echo is the same rounded figure.
    expect(text(strip({ cost: 'in the panel' }))).toContain(`Estimate ${shortMoney(e.total)} Cross-check`)
  })

  it('quotes the cross-check beside the estimate, so one isn’t read without the other (HO-08)', () => {
    expect(text(strip())).toContain(`Cross-check ${shortMoney(e.guide!.low)} to ${shortMoney(e.guide!.high)}`)
  })

  it('pages its chips sideways where they don’t fit, as the main strip does (PH-21)', () => {
    expect(strip()).toMatch(/<div class="scroll-cue chips-cue"><div class="chips">/)
  })
})
