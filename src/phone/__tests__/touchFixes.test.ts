// Wave 3's phone and tablet fixes, as the plain rules behind them: wording for a finger (PH-13),
// the plan's notices in the toast (PH-11), the sheet handle's tap (AX-13), the keyboard's inset
// (PH-08), keeping a tapped thing clear of the sheet (PH-12, PH-24), the questions on a phone
// (PH-15), the empty plan's card (PH-28), and one query for the phone layout across the CSS.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openAt, staysInView } from '../../flow/questions'
import { emptyPlanCardShows } from '../../guide/hints'
import { buildIndex, search, withoutKeyboard } from '../../nav/search'
import { usePlan } from '../../plan/store'
import { useSiteStore } from '../../site/store'
import { PHONE_QUERY } from '../device'
import { clearOfSheet, PHONE_FIT, TOUCH_PICK_PX } from '../gestures'
import { keyboardInset } from '../native'
import { watchNotices } from '../notices'
import { coveredBy, fitClearOf } from '../sheetHeight'
import { toggleTall, useSheetSize } from '../sheetDrag'
import { forTouch, touchWords } from '../words'

describe('wording for a finger (PH-13)', () => {
  it('says Tap for Click, in any case', () => {
    expect(touchWords('Click on a wall to place it.')).toBe('Tap on a wall to place it.')
    expect(touchWords('Now click where the section ends.')).toBe('Now tap where the section ends.')
    expect(touchWords('Rooms and outdoor areas. Click one to see it on the plan')).toBe('Rooms and outdoor areas. Tap one to see it on the plan')
    expect(touchWords('Double-click to finish; clicking again adds a point.')).toBe('Double-tap to finish; tapping again adds a point.')
  })

  it('leaves out keys there is no keyboard to press', () => {
    expect(touchWords('Use the Garage door tool (G)')).toBe('Use the Garage door tool')
    expect(touchWords('No roofs yet. Pick the Roof tool (F) and click inside the walls to roof the building.')).toBe('No roofs yet. Pick the Roof tool and tap inside the walls to roof the building.')
    expect(touchWords('Click on the plan to place it. Press Q to turn the next piece a quarter turn before you click.')).toBe('Tap on the plan to place it.')
    expect(touchWords('Click each corner of the roof, then the first corner again (or press Enter) to close it.')).toBe('Tap each corner of the roof, then the first corner again to close it.')
    expect(touchWords('Picking a contour… (Esc)')).toBe('Picking a contour…')
    expect(touchWords('Tree added. Its details are in Features, on the left; Esc stops tracing.')).toBe('Tree added. Its details are in Features; Done stops tracing.')
  })

  it('keeps letters that are not keys: the gable and hip markers', () => {
    const line = 'the G and H markers on the plan to choose which ends are gables (G) and which are hipped (H).'
    expect(touchWords(line)).toBe(line)
  })

  it('only rewords where the screen is touched', () => {
    expect(forTouch('Click a wall.', false)).toBe('Click a wall.')
    expect(forTouch('Click a wall.', true)).toBe('Tap a wall.')
    // No matchMedia here (a test, or a server): a computer's words.
    expect(forTouch('Click a wall.')).toBe('Click a wall.')
  })

  it('search on a touch screen leaves out the keyboard shortcuts', () => {
    const all = buildIndex([{ id: 'single-key-shortcuts', name: 'Single-key shortcuts switch', where: 'Design › More', keywords: [] } as never])
    expect(search(all, 'keyboard shortcuts').some(r => r.action === 'keyboard-help')).toBe(true)
    const touch = withoutKeyboard(all)
    expect(touch.some(r => r.action === 'keyboard-help')).toBe(false)
    expect(touch.some(r => r.featureId === 'single-key-shortcuts')).toBe(false)
    expect(touch.length).toBeGreaterThan(all.length - 4)
  })
})

describe('the plan’s messages on a phone (PH-11)', () => {
  afterEach(() => {
    vi.useRealTimers()
    usePlan.getState().notify(null)
    useSiteStore.setState({ notice: null, focus: false })
  })

  it('says each new notice once, reworded, and lets the same slip say it again', () => {
    vi.useFakeTimers()
    const said: string[] = []
    const stop = watchNotices(t => said.push(t), 5000)
    usePlan.getState().notify('Click on a wall to place it.')
    usePlan.getState().notify('Click on a wall to place it.')
    expect(said).toEqual(['Tap on a wall to place it.'])
    // Once the toast has gone the notice is dropped, so the next tap on empty ground speaks again.
    vi.advanceTimersByTime(5000)
    expect(usePlan.getState().notice).toBeNull()
    usePlan.getState().notify('Click on a wall to place it.')
    expect(said).toHaveLength(2)
    stop()
    usePlan.getState().notify('Removed. Undo brings it back.')
    expect(said).toHaveLength(2)
  })

  it('passes on Site’s notices only while Site has the plan', () => {
    const said: string[] = []
    const stop = watchNotices(t => said.push(t))
    useSiteStore.getState().notify('Moved. Now click a second point on the drawing, far from the first.')
    expect(said).toEqual([])
    useSiteStore.setState({ focus: true, notice: null })
    useSiteStore.getState().notify('Moved. Now click a second point on the drawing, far from the first.')
    expect(said).toEqual(['Moved. Now tap a second point on the drawing, far from the first.'])
    stop()
  })
})

describe('sheets on a phone', () => {
  it('the handle’s tap makes the panel taller, and the next one shorter (AX-13)', () => {
    useSheetSize.setState({ tall: false })
    toggleTall()
    expect(useSheetSize.getState().tall).toBe(true)
    toggleTall()
    expect(useSheetSize.getState().tall).toBe(false)
  })

  it('the handle is a named button with its state, and a tap on it is not swallowed by the drag', () => {
    const shell = readFileSync('src/shell/AppShell.tsx', 'utf8')
    expect(shell).toMatch(/<button type="button" className="sheet-grab" aria-expanded=\{tall\} aria-label=\{tall \? 'Make the panel shorter' : 'Make the panel taller'\} onClick=\{toggleTall\}/)
    const drag = readFileSync('src/phone/sheetDrag.ts', 'utf8')
    expect(drag).toContain("t.closest('button.sheet-grab')")
  })

  it('the project menu has a name on a phone, where its title is drawn as ⋯ (AX-21)', () => {
    expect(readFileSync('src/shell/ProjectMenu.tsx', 'utf8')).toContain('aria-label={phone ? `Project menu: ${title}` : undefined}')
  })

  it('knows how much of the screen the keyboard covers, and ignores a toolbar coming and going (PH-08)', () => {
    expect(keyboardInset(664, 664)).toBe(0)
    expect(keyboardInset(664, 620)).toBe(0)
    expect(keyboardInset(664, 364)).toBe(300)
  })

  it('every field is 16 px in the phone layout and on any touch screen, so iOS does not zoom the page (PH-08, final check 3)', () => {
    const css = readFileSync('src/phone/phone.css', 'utf8')
    expect(css).toMatch(/@media \(max-width: 760px\), \(pointer: coarse\) \{\s*\.app-shell:is\(\.phone, :not\(\.phone\)\) :is\(input, select, textarea\)[^{]*\{\s*font-size: 16px !important;/)
    expect(css).toContain('height: calc(100% - var(--keyboard-inset, 0px));')
  })

  it('measures what an open sheet covers from the canvas’s foot (PH-24)', () => {
    expect(coveredBy(598, [])).toBe(0)
    expect(coveredBy(598, [270])).toBe(328)
    expect(coveredBy(598, [336, 270.4])).toBe(328)
    expect(coveredBy(598, [640])).toBe(0)
  })

  it('fits the plan above a panel, but not above one pulled up over the whole canvas', () => {
    expect(fitClearOf(0, 546)).toBe(0)
    expect(fitClearOf(262, 546)).toBe(270)
    expect(fitClearOf(520, 546)).toBe(0)
  })

  it('slides a tapped thing clear of the sheet that then covers it, and leaves the rest alone (PH-12)', () => {
    // A 546 px canvas, 62 px of chips at the top, a 328 px inspector: 218 px left clear.
    expect(clearOfSheet(100, 546, 62, 328)).toBe(0)
    expect(clearOfSheet(190, 546, 62, 328)).toBe(0)
    // Tapped at 300, under the sheet: it moves up 160 px, to the middle of the clear part (140).
    expect(clearOfSheet(300, 546, 62, 328)).toBe(160)
    expect(clearOfSheet(300, 546, 62, 0)).toBe(0)
    expect(TOUCH_PICK_PX).toBeGreaterThanOrEqual(12)
    expect(PHONE_FIT).toBeGreaterThan(0.75)
  })
})

describe('questions and the empty plan on a phone', () => {
  it('opens one waiting question straight at its choices on a phone (PH-15)', () => {
    expect(openAt([{ id: 'street', kind: 'street' }], true)).toBe('street')
    expect(openAt([{ id: 'street', kind: 'street' }], false)).toBeNull()
    expect(openAt([{ id: 'street', kind: 'street' }, { id: 'facts', kind: 'facts' }], true)).toBeNull()
    expect(openAt([{ id: 'facts', kind: 'facts' }], true)).toBeNull()
  })

  it('answers the street question without leaving View; anything that draws switches to Edit', () => {
    expect(staysInView([{ kind: 'street' }])).toBe(true)
    expect(staysInView([{ kind: 'street' }, { kind: 'floor-type' }])).toBe(false)
    expect(staysInView([])).toBe(false)
  })

  it('says "No house drawn yet" on a plan with no house walls, until it is hidden (PH-28)', () => {
    expect(emptyPlanCardShows({ walls: [] }, false)).toBe(true)
    expect(emptyPlanCardShows({ walls: [{ kind: 'retaining' }] as never }, false)).toBe(true)
    expect(emptyPlanCardShows({ walls: [{ kind: 'external' }] as never }, false)).toBe(false)
    expect(emptyPlanCardShows({ walls: [] }, true)).toBe(false)
  })

  it('opens the example in View, like an import or a sketch', () => {
    expect(readFileSync('src/example/open.ts', 'utf8')).toContain("usePhoneMode.getState().setMode('view')")
  })
})

describe('one query for the phone layout', () => {
  const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? cssFiles(join(dir, f)) : f.endsWith('.css') ? [join(dir, f)] : []))

  it('a tablet rule in the CSS is the layout’s own query, so an iPad on its side keeps a computer’s dialogs', () => {
    const tablet = /@media [^{]*\(pointer: coarse\) and \(max-width: \d+px\)[^{]*\{/g
    const found = cssFiles('src').flatMap(f => readFileSync(f, 'utf8').match(tablet) ?? [])
    expect(found.length).toBeGreaterThanOrEqual(10)
    for (const q of found) expect(q).toBe(`@media ${PHONE_QUERY} {`)
  })

  it('reviews, the cloud’s dialogs, the guide and comments are bottom sheets only in the phone layout', () => {
    const sheetIn = (file: string, selector: string) => {
      const css = readFileSync(file, 'utf8')
      const at = css.indexOf(`@media ${PHONE_QUERY} {`)
      expect(at, file).toBeGreaterThan(-1)
      // The selector is set inside a phone-layout block, not in one for every touch screen.
      const blocks = css.split('@media ').filter(b => b.startsWith(`${PHONE_QUERY} {`))
      expect(blocks.some(b => b.includes(`  ${selector} {`)), `${file} ${selector}`).toBe(true)
      const anyTouch = css.split('@media ').filter(b => b.startsWith('(max-width: 760px), (pointer: coarse) {'))
      expect(anyTouch.some(b => b.includes(`  ${selector} {\n    position: fixed`) || b.includes(`  ${selector} {\n    place-items`) || b.includes(`  ${selector} {\n    width: 100%`)), `${file} ${selector}`).toBe(false)
    }
    sheetIn('src/safety/safety.css', '.sf-scrim')
    sheetIn('src/safety/safety.css', '.sf-sheet')
    sheetIn('src/cloud/cloud.css', '.cl-scrim')
    sheetIn('src/guide/guide.css', '.guide-ui.cl-scrim')
    sheetIn('src/comments/comments.css', '.cm-card')
  })
})
