// The panels that have the most to read are wide enough, and nothing in them stops long words
// wrapping: checked on the style sheets themselves, so no browser is needed. scripts/check-panels.mjs
// measures the real thing in a browser.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TAB_PANELS } from '../sections'
import { INSPECTOR_W, PANEL_W, WIDE_TABS, WIDE_W } from '../panelWidth'

const css = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(sheet: string, selector: string): string {
  const at = sheet.search(new RegExp(`(^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`))
  expect(at, selector).toBeGreaterThanOrEqual(0)
  const open = sheet.indexOf('{', at)
  return sheet.slice(open + 1, sheet.indexOf('}', open))
}

describe('panel widths', () => {
  const shell = css('../shell.css')

  it('match what the plan keeps clear of', () => {
    expect(shell).toContain(`--panel-w: ${PANEL_W}px;`)
    expect(rule(shell, '.inspector')).toContain(`width: ${INSPECTOR_W}px;`)
  })

  it('give Site › Features, the retaining wall card and the sections’ drawings 420–480 px on a desktop', () => {
    expect(WIDE_W).toBeGreaterThanOrEqual(420)
    expect(WIDE_W).toBeLessThanOrEqual(480)
    expect(rule(shell, '.float-col.wide')).toContain(`width: min(${WIDE_W}px`)
    expect(rule(shell, '.inspector.wide')).toContain(`width: min(${WIDE_W}px`)
    expect([...WIDE_TABS].sort()).toEqual(['design/sections', 'earthworks/retaining-walls', 'site/features'])
    for (const t of WIDE_TABS) expect(TAB_PANELS[t], t).toBeDefined()
    // the phone's sheets stay full width
    expect(rule(shell, '.app-shell.phone .float-col')).toContain('width: auto;')
    expect(rule(shell, '.app-shell.phone .inspector')).toContain('width: auto;')
  })
})

describe('long words in the panels', () => {
  it('wrap in Site › Features instead of widening it: drawing names, warnings, every section', () => {
    const site = css('../../site/site.css')
    expect(rule(site, '.sf')).toContain('grid-template-columns: minmax(0, 1fr);')
    expect(rule(site, '.sf-drawing')).toContain('grid-template-columns: minmax(0, 1fr);')
    const name = rule(site, '.sf-drawing-head b')
    expect(name).not.toContain('nowrap')
    expect(name).toContain('overflow-wrap: anywhere;')
    expect(rule(site, '.sf-warnings .site-chip')).toContain('white-space: normal;')
  })

  it('wrap in the retaining wall card: no line is kept from breaking', () => {
    const rw = css('../../components/retaining.css')
    expect(rw).not.toContain('nowrap')
    expect(rule(rw, '.rw-kv dd')).toContain('overflow-wrap: anywhere;')
  })

  it('wrap in search results rather than lose their ends', () => {
    const label = rule(css('../shell.css'), '.pi-label')
    expect(label).not.toContain('nowrap')
    expect(label).not.toContain('ellipsis')
  })

  it('lift the plan’s question cards clear of a note at the foot of the screen (Undo, what an import found)', () => {
    const flow = css('../../flow/flow.css')
    const toast = (sheet: string) => Number(/\.toast \{[^}]*bottom: (\d+)px/.exec(sheet)![1])
    const sfToast = Number(/\.sf-toast \{[^}]*position: fixed;[^}]*bottom: (\d+)px/.exec(css('../../safety/safety.css'))![1])
    const lifted = Number(/bottom: (\d+)px/.exec(rule(flow, 'body:has(.toast, .sf-toast) .flow-card'))![1])
    // a one-line note is about 46 px tall, a two-line one about 60
    expect(lifted).toBeGreaterThanOrEqual(Math.max(toast(css('../shell.css')), sfToast) + 60 + 16)
    expect(rule(flow, 'body:has(.app-shell .toast):has(.sf-toast) .flow-card')).toMatch(/bottom: \d+px/)
  })
})
