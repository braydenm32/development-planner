// Going to a step's item (../go.ts): a check with no place of its own opens its row in
// Approvals › Checks with nothing selected, so the last step's card doesn't cover its pin (LF-09).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChecksPointing } from '../../checks/pointStore'
import { useRouter } from '../../nav/router'
import type { AppRoute } from '../../nav/route'
import { goTo } from '../go'

describe('going to a check from the steps', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { hash: '' })
    vi.stubGlobal('history', { state: null, pushState() {}, replaceState() {} })
    useRouter.setState({ route: { kind: 'app', area: 'earthworks', tab: 'retaining-walls', view: 'plan', level: 'g', sel: 'step_wall' }, focus: null })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('puts the last selection down when the check is read in Approvals › Checks', () => {
    goTo({ to: 'check', id: 'turning-in', fix: null })
    const r = useRouter.getState().route as AppRoute
    expect(r).toMatchObject({ area: 'approvals', tab: 'checks', view: 'plan', level: 'g' })
    expect(r.sel).toBeUndefined()
    expect(useChecksPointing.getState().picked).toBe('turning-in')
  })

  it('keeps it when the check is fixed where the thing is', () => {
    goTo({ to: 'check', id: 'wall-height', fix: { area: 'earthworks', tab: 'retaining-walls', where: 'Earthworks › Retaining walls' } })
    expect((useRouter.getState().route as AppRoute).sel).toBe('step_wall')
  })
})
