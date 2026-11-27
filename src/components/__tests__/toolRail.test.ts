import { describe, expect, it } from 'vitest'
import { DESIGN_RAIL, EARTHWORKS_RAIL, TOOL_GROUPS, TOOLS } from '../tools'

describe('the tool rail (HO-32, LF-30)', () => {
  it('shows every drawing tool in Design, each once', () => {
    expect(DESIGN_RAIL.map(t => t.id).sort()).toEqual(TOOLS.filter(t => t.id !== 'move').map(t => t.id).sort())
  })

  it('keeps each group of tools together, in the order the groups are named', () => {
    const groups = DESIGN_RAIL.map(t => TOOL_GROUPS.indexOf(t.group))
    expect(groups.every(g => g >= 0)).toBe(true)
    expect([...groups].sort((a, b) => a - b)).toEqual(groups)
    // The four ways to put a hole in a wall sit side by side.
    const at = (id: string) => DESIGN_RAIL.findIndex(t => t.id === id)
    expect([at('door'), at('window'), at('opening'), at('garage')].sort((a, b) => a - b)).toEqual([at('door'), at('door') + 1, at('door') + 2, at('door') + 3])
  })

  it('says in a few words what each tool is for, and gives each its own key', () => {
    for (const t of TOOLS) expect(t.tip.length, t.id).toBeGreaterThan(8)
    expect(new Set(TOOLS.map(t => t.key)).size).toBe(TOOLS.length)
  })

  it('gives Earthworks the ground’s own tools: Move house, Retaining wall, Driveway, the brush and Measure', () => {
    expect(EARTHWORKS_RAIL).toEqual(['select', 'move', 'retaining', 'driveway', 'brush', 'measure'])
    expect(TOOLS.find(t => t.id === 'move')!.short).toBe('Move house')
  })
})
