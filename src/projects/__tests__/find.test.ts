import { describe, expect, it } from 'vitest'
import { findProjects, FIND_FROM } from '../find'
import type { ProjectMeta } from '../types'

// Made-up projects only.
const meta = (name: string, updated: number, surveyFileName: string | null = null): ProjectMeta => ({
  id: `p_${name}`,
  name,
  updated,
  created: 0,
  revision: 1,
  archived: false,
  surveyFileName,
  thumbnail: null,
  numbers: { siteArea: null, floorArea: null, ffl: null },
})

// Most recently edited first, as the Projects home lists them.
const list = [meta('Copy of Beach shack', 50), meta('Hill house 10', 40), meta('beach shack', 30, 'sample-block.dxf'), meta('Hill house 2', 20), meta('Example: split-level house', 10)]
const names = (xs: ProjectMeta[]) => xs.map(m => m.name)

describe('finding a project on the Projects home (LF-18)', () => {
  it('filters by name, whatever the case, every word wanted', () => {
    expect(names(findProjects(list, 'beach', 'recent'))).toEqual(['Copy of Beach shack', 'beach shack'])
    expect(names(findProjects(list, '  SHACK copy ', 'recent'))).toEqual(['Copy of Beach shack'])
    expect(findProjects(list, 'cottage', 'recent')).toEqual([])
    expect(findProjects(list, '', 'recent')).toEqual(list)
  })

  it('finds a project by its survey file too', () => {
    expect(names(findProjects(list, 'sample-block', 'recent'))).toEqual(['beach shack'])
  })

  it('sorts by last edited, or by name with numbers in counting order', () => {
    expect(names(findProjects(list, '', 'recent'))).toEqual(names(list))
    expect(names(findProjects(list, '', 'name'))).toEqual(['beach shack', 'Copy of Beach shack', 'Example: split-level house', 'Hill house 2', 'Hill house 10'])
    // Two of the same name: the one edited last comes first.
    expect(findProjects([meta('Same', 1), { ...meta('Same', 9), id: 'p_newer' }], '', 'name')[0].id).toBe('p_newer')
  })

  it('leaves the list given as it was', () => {
    const before = names(list)
    findProjects(list, '', 'name')
    expect(names(list)).toEqual(before)
  })

  it('shows from more than a handful of projects', () => {
    expect(FIND_FROM).toBeGreaterThan(5)
  })
})
