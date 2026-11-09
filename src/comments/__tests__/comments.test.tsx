// Comments on share links in the app: where a pin goes (on its spot of the block, whichever way
// the plan is turned or the house moved), the limits checked before sending (the same as the
// Worker's), the words for who wrote it and which link, the viewer's Add a comment and the
// owner's list, Resolve and Delete with Undo, against the Worker in-process. Every comment shows
// as text, never as markup. On the made-up plan only.

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkComment } from '../../../worker/src/comments'
import { commenter, person, pin, server } from '../../../worker/test/people'
import type { Vec2 } from '../../lib/geom'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { normalizePlan, type Plan } from '../../plan/model'
import { onDay } from '../../projects/format'
import { usePlan } from '../../plan/store'
import { dismissToast, undoToast, useSafety } from '../../safety/store'
import { ShareLinksBody } from '../../share-links/ShareLinks'
import { useShareLinks, type ShareLinksState } from '../../share-links/store'
import { createCommentsApi } from '../api'
import { OwnerBody, ViewerBody } from '../CommentCards'
import { commenterToken } from '../commenter'
import {
  commentProblem,
  countWords,
  floorOf,
  linkName,
  newCount,
  numbered,
  ownerOrder,
  planToSurvey,
  SOMEONE,
  spotAt,
  surveyToPlan,
  TEXT_MAX,
  NAME_MAX,
  whoWrote,
  type OwnerComment,
  type ViewerComment,
} from '../model'
import { CommentsSection } from '../OwnerComments'
import { useCommentsPlan, type CommentsPlan } from '../PlanComments'
import { commentActions, setCommentsApi, useComments } from '../store'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 9, 1, 0)

/** Markup as the words a person reads. */
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/\s+/g, ' ')
    .trim()
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map(m => words(m[1]) || (/aria-label="([^"]*)"/.exec(m[0])?.[1] ?? ''))

const placed = (rotation = 0): Plan => normalizePlan({ ...garageFloor(), name: 'Sample house', placement: { e: 5006, n: 8004, rotation, ffl: 45.5 } })
const two = (): Plan => {
  const p = placed()
  return { ...p, levels: [...p.levels, { id: 'level_first', name: 'First floor', elevation: 3, height: 2.7 }] }
}

const owned = (id: string, extra: Partial<OwnerComment> = {}): OwnerComment => ({ id, link: 'h1', floor: 'level_ground', x: 5010, y: 8010, text: `Comment ${id}`, name: null, created: NOW - DAY, resolved: null, ...extra })
const viewed = (id: string, extra: Partial<ViewerComment> = {}): ViewerComment => ({ id, floor: 'level_ground', x: 5010, y: 8010, text: `Comment ${id}`, name: null, created: NOW - DAY, resolved: false, mine: true, ...extra })

/** What the stores hold now, for drawing on the server (which draws a store's first state otherwise). */
function serve() {
  Object.assign(useComments.getInitialState(), useComments.getState())
  Object.assign(usePlan.getInitialState(), usePlan.getState())
}

/** localStorage, as a browser has it. */
function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), map: m }
}

beforeEach(() => {
  commentActions.reset()
  usePlan.getState().load(placed())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('where a pin goes', () => {
  it('keeps the survey’s easting and northing of the spot, to the millimetre, on the floor showing', () => {
    // The house's frame starts at its placement on the block: 1 m east of it is 1 m east on the survey.
    expect(planToSurvey([1, 2], placed().placement)).toEqual([5007, 8006])
    expect(spotAt([1.23456, 2.00049], 'level_ground', placed().placement)).toEqual({ floor: 'level_ground', x: 5007.235, y: 8006 })
    // A house turned on the block: the same spot on the plan is another spot on the block.
    const turned = placed(90).placement
    const [x, y] = planToSurvey([1, 0], turned)
    expect([x, y].map(v => Math.round(v * 1000) / 1000)).toEqual([5006, 8005])
  })

  it('puts it back on the same spot of the block, however the house is turned or moved', () => {
    for (const rotation of [0, 37, 90, 211]) {
      const pl = placed(rotation).placement
      const spot = { x: 5012.5, y: 8001.25 }
      const back = planToSurvey(surveyToPlan(spot, pl), pl)
      expect(back[0]).toBeCloseTo(spot.x, 9)
      expect(back[1]).toBeCloseTo(spot.y, 9)
    }
    // The house moved 2 m east: the pin is 2 m further west of the house, still on its spot of the block.
    const before = surveyToPlan({ x: 5010, y: 8010 }, placed().placement)
    const after = surveyToPlan({ x: 5010, y: 8010 }, { ...placed().placement, e: 5008 })
    expect(after[0]).toBeCloseTo(before[0] - 2, 9)
    expect(after[1]).toBeCloseTo(before[1], 9)
  })

  it('shows on its own floor, or on the lowest if that floor has gone', () => {
    const plan = two()
    expect(floorOf({ floor: 'level_first', x: 0, y: 0 }, plan)).toBe('level_first')
    expect(floorOf({ floor: 'level_gone', x: 0, y: 0 }, plan)).toBe('level_ground')
  })

  it('numbers comments by when they were written, the same on the plan and in the list', () => {
    const n = numbered([owned('c', { created: 3 }), owned('a', { created: 1 }), owned('b', { created: 2 })])
    expect([...n]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
  })
})

describe('what is checked before a comment is sent', () => {
  const cp = String.fromCodePoint
  const cases: [string, string][] = [
    ['Move this wall back a metre?', ''],
    ['  trimmed  ', '  Sam  '],
    ['two\nlines', 'Sam'],
    ['a'.repeat(TEXT_MAX), 'n'.repeat(NAME_MAX)],
    ['🏠'.repeat(TEXT_MAX), ''],
    ['<b>markup</b> is just words', ''],
    ['', ''],
    ['   ', ''],
    ['a'.repeat(TEXT_MAX + 1), ''],
    ['ok', 'n'.repeat(NAME_MAX + 1)],
    [`bell${cp(7)}`, ''],
    [`tab${cp(9)}here`, ''],
    [`turned ${cp(0x202e)}around`, ''],
    [`split${cp(0x2028)}line`, ''],
    ['ok', 'two\nlines'],
    ['ok', `odd${cp(0x2066)}name`],
  ]

  it('refuses just what the Worker refuses, in plain words', () => {
    for (const [text, name] of cases) {
      const here = commentProblem(text, name)
      let there: string | null = null
      try {
        checkComment({ ...pin(text), name })
      } catch (e) {
        there = (e as Error).message
      }
      expect(here, JSON.stringify([text.slice(0, 20), name.slice(0, 20)])).toBe(there)
    }
  })
})

describe('the words for a comment', () => {
  it('says who wrote it, or “Someone with the link”', () => {
    expect(whoWrote({ name: 'Sam' })).toBe('Sam')
    expect(whoWrote({ name: null })).toBe(SOMEONE)
    expect(whoWrote({ name: '   ' })).toBe('Someone with the link')
  })

  it('names the link it came by, as Share › Send names links, and says when that has ended', () => {
    const made = Date.UTC(2026, 10, 3, 1)
    expect(linkName({ created: made, expires: NOW + DAY }, NOW)).toBe(`the link made ${onDay(made, NOW)}`)
    expect(linkName({ created: made, expires: NOW - 1 }, NOW)).toBe(`the link made ${onDay(made, NOW)}, which has ended`)
    expect(linkName({ created: made, expires: null }, NOW)).toBe(`the link made ${onDay(made, NOW)}`)
    expect(linkName(undefined, NOW)).toBe('a share link')
  })

  it('counts a link’s comments, and the new ones across the project', () => {
    expect(countWords(undefined)).toBeNull()
    expect(countWords({ total: 0, new: 0 })).toBeNull()
    expect(countWords({ total: 1, new: 0 })).toBe('1 comment')
    expect(countWords({ total: 3, new: 1 })).toBe('3 comments, 1 new')
    expect(newCount({ a: { created: 1, expires: null, total: 3, new: 1 }, b: { created: 2, expires: null, total: 2, new: 2 } })).toBe(3)
    expect(newCount(null)).toBe(0)
  })

  it('lists new comments first, as they were written, then resolved ones, latest resolved first', () => {
    const list = [owned('r1', { created: 1, resolved: 10 }), owned('n2', { created: 5 }), owned('r2', { created: 2, resolved: 20 }), owned('n1', { created: 3 })]
    expect(ownerOrder(list).map(c => c.id)).toEqual(['n1', 'n2', 'r2', 'r1'])
  })
})

describe('a comment shows as text, never as markup', () => {
  const evil = '<img src=x onerror="alert(1)"> <script>alert(2)</script>\nsecond line'

  it('for someone with the link, and for the owner', () => {
    useComments.setState({ side: 'owner', counts: { h1: { created: NOW - 3 * DAY, expires: NOW + DAY, total: 1, new: 1 } } })
    serve()
    for (const html of [renderToStaticMarkup(<ViewerBody c={viewed('a', { text: evil, name: '<b>Sam</b>' })} />), renderToStaticMarkup(<OwnerBody c={owned('a', { text: evil, name: '<b>Sam</b>' })} />)]) {
      expect(html).not.toMatch(/<img|<script|<b>Sam/)
      expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
      expect(html).toContain('&lt;b&gt;Sam&lt;/b&gt;')
      // The line break stays (the card keeps white space).
      expect(html).toContain('\nsecond line')
    }
  })
})

/** The plan layer, drawn once, with what it gives back. */
function drawLayer(plan: Plan, level = 'level_ground') {
  const out: { current: CommentsPlan | null } = { current: null }
  const S = (p: Vec2): Vec2 => [p[0] * 10 + 100, -p[1] * 10 + 500]
  serve()
  function Layer() {
    const r = useCommentsPlan({ plan, level, S, size: { w: 1200, h: 800 }, fitTo: () => {} })
    out.current = r
    return (
      <div>
        {r.pins}
        {r.html}
        {r.key}
      </div>
    )
  }
  return { html: renderToStaticMarkup(<Layer />), layer: out.current! }
}

describe('comments on the plan', () => {
  it('draws a numbered pin for each comment on the floor showing, where it was left', () => {
    const plan = two()
    useComments.setState({ side: 'viewer', mode: 'own', seen: [viewed('a', { created: 1 }), viewed('b', { created: 2, x: 5007, y: 8005, resolved: true }), viewed('c', { created: 3, floor: 'level_first' })] })
    const { html } = drawLayer(plan)
    const pins = [...html.matchAll(/<button[^>]*class="cm-pin([^"]*)"[^>]*style="left:([\d.]+)px;top:([\d.]+)px"[^>]*>(\d+)<\/button>/g)].map(m => [m[4], m[2], m[3], m[1].trim()])
    // 4 m east and 6 m north of the house's corner; 1 m and 1 m for the second (resolved).
    expect(pins).toEqual([
      ['1', '140', '440', ''],
      ['2', '110', '490', 'resolved'],
    ])
    expect(drawLayer(plan, 'level_first').html).toMatch(/>3<\/button>/)
  })

  it('waits for a tap after Add a comment, pins it there, and lets taps through otherwise', () => {
    const plan = placed()
    useComments.setState({ side: 'viewer', mode: 'own', token: 't' })
    expect(drawLayer(plan).layer.click([1, 2])).toBe(false)
    commentActions.startPlacing()
    const { html, layer } = drawLayer(plan)
    expect(words(html)).toContain('the spot on the plan your comment is about. Cancel Esc')
    expect(layer.click([1, 2])).toBe(true)
    expect(useComments.getState()).toMatchObject({ placing: false, draft: { floor: 'level_ground', x: 5007, y: 8006 } })
    const writing = drawLayer(plan).html
    expect(writing).toContain('aria-label="Add a comment"')
    expect(words(writing)).toContain('Only the person who shared this sees it, and you, on this device.')
    expect(buttons(writing)).toEqual(['Cancel the comment', 'Cancel', 'Send'])
  })

  it('adds nothing on a link that takes no comments', () => {
    useComments.setState({ side: 'viewer', mode: 'off', token: 't' })
    commentActions.startPlacing()
    expect(useComments.getState().placing).toBe(false)
  })

  it('gives the owner the plan key’s switch, with how many are new, and hides the pins when it is off', () => {
    useComments.setState({ side: 'owner', projectId: 'p1', comments: [owned('a'), owned('b', { resolved: 5 })], pins: true })
    const on = drawLayer(placed()).html
    expect(words(on)).toContain('Comments from share links 1 new')
    expect(on.match(/class="cm-pin/g)).toHaveLength(2)
    useComments.setState({ pins: false })
    const off = drawLayer(placed()).html
    expect(off).not.toContain('cm-pin')
    expect(words(off)).toContain('Comments from share links')
    // No comments: no switch.
    useComments.setState({ comments: [] })
    expect(words(drawLayer(placed()).html)).toBe('')
  })
})

describe('someone with a link (against the Worker)', () => {
  async function sharedLink(comments: 'off' | 'own' | 'all' = 'own') {
    const s = server()
    const ana = await person(s, 'Ana')
    await ana.save('p_home', 'Sample house', {})
    const link = await ana.share('p_home', { comments })
    return { s, ana, link }
  }

  it('sends a comment pinned on the plan, keeps a token in this browser only once one is sent, and sees it again', async () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    const { s, ana, link } = await sharedLink('own')
    setCommentsApi(createCommentsApi({ fetch: s.browser() }))
    await commentActions.startViewer(link.token, 'Ana')
    expect(useComments.getState()).toMatchObject({ side: 'viewer', mode: 'own', seen: [] })
    // Opening the link keeps nothing here.
    expect(storage.map.size).toBe(0)
    commentActions.startPlacing()
    commentActions.place(spotAt([1, 2], 'level_ground', placed().placement))
    expect(await commentActions.send('  Move this wall back a metre?  ', ' Sam ')).toBe(true)
    const st = useComments.getState()
    expect(st.draft).toBeNull()
    expect(st.sent).toBe(1)
    expect(st.seen).toEqual([expect.objectContaining({ text: 'Move this wall back a metre?', name: 'Sam', x: 5007, y: 8006, mine: true, resolved: false })])
    expect(commenterToken()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect([...storage.map.keys()]).toEqual(['bhp-commenter'])

    // The page again: the same browser sees its comment; another doesn't.
    commentActions.reset()
    await commentActions.startViewer(link.token, 'Ana')
    expect(useComments.getState().seen.map(c => c.text)).toEqual(['Move this wall back a metre?'])
    vi.stubGlobal('localStorage', memoryStorage())
    commentActions.reset()
    await commentActions.startViewer(link.token, 'Ana')
    expect(useComments.getState().seen).toEqual([])
    // The owner has it.
    const list = await createCommentsApi({ fetch: ana.fetch }).list('p_home')
    expect(list.comments.map(c => [c.text, c.name])).toEqual([['Move this wall back a metre?', 'Sam']])
  })

  it('says what is wrong before sending, and sends nothing', async () => {
    const { s, link } = await sharedLink('own')
    setCommentsApi(createCommentsApi({ fetch: s.browser() }))
    await commentActions.startViewer(link.token, 'Ana')
    commentActions.place({ floor: 'level_ground', x: 5007, y: 8006 })
    expect(await commentActions.send('   ', '')).toBe(false)
    expect(useComments.getState().problem).toBe('Write a comment first.')
    expect(await commentActions.send('a'.repeat(TEXT_MAX + 1), '')).toBe(false)
    expect(useComments.getState().problem).toBe('A comment can be up to 500 characters.')
    expect(useComments.getState().draft).not.toBeNull()
    expect(s.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM share_comments').get()).toEqual({ n: 0 })
  })

  it('stops taking a comment once the owner turns comments off, and says so', async () => {
    const { s, ana, link } = await sharedLink('own')
    setCommentsApi(createCommentsApi({ fetch: s.browser() }))
    await commentActions.startViewer(link.token, 'Ana')
    commentActions.place({ floor: 'level_ground', x: 5007, y: 8006 })
    await createCommentsApi({ fetch: ana.fetch }).setMode('p_home', link.id, 'off')
    expect(await commentActions.send('Too late?', '')).toBe(false)
    expect(useComments.getState()).toMatchObject({ mode: 'off', problem: 'Comments are turned off for this link.' })
  })
})

describe('the owner’s comments (against the Worker)', () => {
  async function withComments() {
    const s = server()
    const ana = await person(s, 'Ana')
    await ana.save('p_home', 'Sample house', {})
    const link = await ana.share('p_home', { comments: 'own' })
    for (const [i, text] of ['First', 'Second', 'Third'].entries()) {
      expect((await commenter(s, link.token, { ip: `203.0.113.${i + 1}` }).add(pin(text, { name: i === 0 ? 'Sam' : null }))).status).toBe(201)
      s.clock.now += 1000
    }
    setCommentsApi(createCommentsApi({ fetch: ana.fetch }))
    await commentActions.loadOwner('p_home')
    return { s, ana, link }
  }

  it('reads the open project’s comments with each link’s counts', async () => {
    const { link } = await withComments()
    const st = useComments.getState()
    expect(st.side).toBe('owner')
    expect(st.comments?.map(c => c.text)).toEqual(['Third', 'Second', 'First'])
    expect(st.counts[link.id]).toMatchObject({ total: 3, new: 3 })
    expect(newCount(st.counts)).toBe(3)
  })

  it('resolves one at once and says so to the Worker, and makes it new again', async () => {
    const { ana, link } = await withComments()
    const first = useComments.getState().comments!.find(c => c.text === 'First')!
    await commentActions.resolve(first.id, true)
    expect(useComments.getState().counts[link.id]).toMatchObject({ total: 3, new: 2 })
    expect(useComments.getState().comments!.find(c => c.id === first.id)!.resolved).toEqual(expect.any(Number))
    const there = await createCommentsApi({ fetch: ana.fetch }).list('p_home')
    expect(there.links[link.id]).toMatchObject({ new: 2 })
    await commentActions.resolve(first.id, false)
    expect(useComments.getState().counts[link.id]).toMatchObject({ new: 3 })
  })

  it('deletes one at once with Undo, and for good only once the toast goes', async () => {
    const { s, link } = await withComments()
    const second = useComments.getState().comments!.find(c => c.text === 'Second')!
    commentActions.remove(second.id)
    expect(useComments.getState().comments!.map(c => c.text)).toEqual(['Third', 'First'])
    expect(useComments.getState().counts[link.id]).toMatchObject({ total: 2, new: 2 })
    const toast = useSafety.getState().toast!
    expect(toast.text).toBe('Comment deleted.')
    // Still on the Worker until the toast goes; reading again meanwhile keeps it out.
    expect(s.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM share_comments').get()).toEqual({ n: 3 })
    await commentActions.loadOwner('p_home')
    expect(useComments.getState().comments!.map(c => c.text)).toEqual(['Third', 'First'])
    await undoToast(toast.id)
    expect(useComments.getState().comments!.map(c => c.text)).toEqual(['Third', 'Second', 'First'])
    expect(useComments.getState().counts[link.id]).toMatchObject({ total: 3, new: 3 })

    commentActions.remove(second.id)
    dismissToast(useSafety.getState().toast!.id)
    await vi.waitFor(() => expect(s.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM share_comments').get()).toEqual({ n: 2 }))
    await commentActions.loadOwner('p_home')
    expect(useComments.getState().comments!.map(c => c.text)).toEqual(['Third', 'First'])
  })

  it('changes a link’s setting, and shows it in the list of links', async () => {
    const { ana, link } = await withComments()
    useShareLinks.setState({ projectId: 'p_home', links: [{ id: link.id, created: 1, lastOpened: null, expires: null, comments: 'own' }] })
    await commentActions.setMode('p_home', link.id, 'all')
    expect(useShareLinks.getState().links![0].comments).toBe('all')
    const listed = await (await ana.fetch('/api/projects/p_home/shares')).json()
    expect(listed.links[0].comments).toBe('all')
  })
})

describe('Share › Send’s comments', () => {
  const none: ShareLinksState = { projectId: 'p1', links: [], making: null, problem: null, fresh: null, days: 30, extending: null }
  const body = (state: ShareLinksState) => {
    serve()
    return renderToStaticMarkup(<ShareLinksBody phase="signed-in" projectId="p1" inCloud state={state} now={NOW} />)
  }
  const section = (projectId: string) => {
    serve()
    return renderToStaticMarkup(<CommentsSection projectId={projectId} />)
  }

  it('offers to let people comment on the next link, off unless ticked, and who sees them once it is', () => {
    const off = body(none)
    expect(words(off)).toContain('New links: let people comment')
    expect(off).not.toMatch(/<input type="checkbox" checked=""/)
    expect(words(off)).not.toContain('They see each other’s comments')
    const own = body({ ...none, comments: 'own' })
    expect(words(own)).toContain('They see each other’s comments')
    expect(own.match(/<input type="checkbox" checked=""/g)).toHaveLength(1)
    expect(body({ ...none, comments: 'all' }).match(/<input type="checkbox" checked=""/g)).toHaveLength(2)
  })

  it('shows each link’s setting and how many comments it has', () => {
    useComments.setState({ side: 'owner', projectId: 'p1', comments: [], counts: { h1: { created: NOW - DAY, expires: NOW + DAY, total: 3, new: 1 } } })
    const html = body({ ...none, links: [{ id: 'h1', created: NOW - DAY, lastOpened: null, expires: NOW + 29 * DAY, comments: 'own' }, { id: 'h2', created: NOW - 2 * DAY, lastOpened: null, expires: NOW + 28 * DAY }] })
    expect(words(html)).toContain('not opened yet · 3 comments 1 new')
    // "1 new" is a badge, not words that look like a link; each link's own tick says it's that link's.
    expect(html).toContain('<b class="cm-new">1 new</b>')
    expect(words(html)).toContain('This link: comments on')
    // The new link's ticks (off), the first link's (on, own), the second's (off: a link from before comments).
    expect([...html.matchAll(/<input type="checkbox"( checked="")?/g)].map(m => !!m[1])).toEqual([false, true, false, false])
  })

  it('lists the comments, new first, each with who, when, which link, Show on plan, Resolve and Delete', () => {
    usePlan.getState().load(two())
    useComments.setState({
      side: 'owner',
      projectId: 'p1',
      counts: { h1: { created: Date.UTC(2026, 10, 3, 1), expires: NOW + DAY, total: 3, new: 2 } },
      comments: [
        owned('c3', { created: NOW - 60_000, text: 'Bigger deck <please>', floor: 'level_first' }),
        owned('c2', { created: NOW - DAY, resolved: NOW - 3_600_000, text: 'Done one' }),
        owned('c1', { created: NOW - 2 * DAY, name: 'Sam', text: 'Move this wall' }),
      ],
    })
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    const html = section('p1')
    const text = words(html)
    expect(text).toContain('Comments from share links 2 new')
    expect(text).toContain('1 Move this wall Sam ·')
    const made = onDay(Date.UTC(2026, 10, 3, 1), NOW)
    expect(text).toContain(`from the link made ${made} · Ground floor`)
    expect(text).toContain(`3 Bigger deck <please> Someone with the link · 1 minute ago · from the link made ${made} · First floor`)
    expect(html).toContain('Bigger deck &lt;please&gt;')
    expect(text.indexOf('Move this wall')).toBeLessThan(text.indexOf('Bigger deck'))
    expect(text.indexOf('Bigger deck')).toBeLessThan(text.indexOf('Done one'))
    expect(text).toContain(`Done one Someone with the link · yesterday · from the link made ${made} · Ground floor · resolved`)
    expect(buttons(html)).toEqual(['Show on plan', 'Resolve', 'Delete', 'Show on plan', 'Resolve', 'Delete', 'Show on plan', 'Reopen', 'Delete'])
    // Another project's, or none: nothing.
    expect(section('p2')).toBe('')
    useComments.setState({ comments: [] })
    expect(section('p1')).toBe('')
  })

  it('“Show on plan” turns the pins on and brings that one into view, open', () => {
    useComments.setState({ side: 'owner', projectId: 'p1', comments: [owned('a')], pins: false })
    commentActions.show('a')
    expect(useComments.getState()).toMatchObject({ pins: true, open: 'a', focus: { id: 'a', n: 1 } })
    commentActions.show('a')
    expect(useComments.getState().focus).toEqual({ id: 'a', n: 2 })
  })
})

describe('a reply missing a part', () => {
  const answer = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch

  it('reads as no comments, rather than breaking the panels that list them', async () => {
    expect(await createCommentsApi({ fetch: answer({ comments: [] }) }).list('p1')).toEqual({ comments: [], links: {} })
    expect(await createCommentsApi({ fetch: answer({}) }).list('p1')).toEqual({ comments: [], links: {} })
    expect(await createCommentsApi({ fetch: answer({ mode: 'own' }) }).seen('t', null)).toEqual({ mode: 'own', comments: [] })
    expect(await createCommentsApi({ fetch: answer(null) }).seen('t', null)).toEqual({ mode: 'off', comments: [] })
  })

  it('leaves the owner’s list empty and its counts readable', async () => {
    setCommentsApi(createCommentsApi({ fetch: answer({ comments: [] }) }))
    await commentActions.loadOwner('p_missing')
    expect(useComments.getState()).toMatchObject({ comments: [], counts: {} })
    // The Send panel's line for a link reads its counts.
    expect(countWords(useComments.getState().counts['h1'])).toBeNull()
  })
})
