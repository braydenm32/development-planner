// The pages about the app say what they should, work with no project, and the one caveat is on
// everything that leaves the app.

import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { PAGE_IDS, formatHash, parseHash } from '../../nav/route'
import { Caveat } from '../Caveat'
import { ACCURACY_TITLE, ACCURACY_UPDATED, CAVEAT, CAVEAT_LINE, CONTACT_EMAIL, LAST_UPDATED } from '../caveat'
import { LegalFooter } from '../LegalFooter'
import { LegalPage } from '../LegalPage'
import { councilsSoFar } from '../pages'
import { COUNCILS } from '../../checks/councils'
import { startAtTop } from '../startAtTop'
import { PAGE_TITLES } from '../titles'
import { planSetPdf } from '../../share/plans'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { garageFloor } from '../../plan/__tests__/fixtures'

const html = (page: (typeof PAGE_IDS)[number]) => renderToStaticMarkup(createElement(LegalPage, { page, onBack: () => {} }))
const textOf = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, '’').replace(/\s+/g, ' ')

describe('routes to the pages', () => {
  it('round-trips each page through the address bar', () => {
    for (const page of PAGE_IDS) {
      expect(formatHash({ kind: 'page', page })).toBe(`#/${page}`)
      expect(parseHash(`#/${page}`)).toEqual({ kind: 'page', page })
    }
    expect(parseHash('#/about/extra')).toBeNull()
  })
})

describe('the pages', () => {
  it('the brand is a link into the app, for a page opened on its own', () => {
    expect(html('terms')).toMatch(/<a class="lg-brand" href="#\/projects"/)
  })

  it('a new page starts at its top with focus on its heading', () => {
    // The pages scroll inside .lg-page: a footer link used to open the next page at the same depth.
    const scroller = { scrollTop: 1532 }
    const focused: unknown[] = []
    startAtTop(scroller, { focus: o => focused.push(o) })
    expect(scroller.scrollTop).toBe(0)
    // preventScroll: focusing the heading must not scroll it under the sticky header.
    expect(focused).toEqual([{ preventScroll: true }])
    // The heading can take that focus without being a tab stop.
    expect(html('privacy')).toContain('<h1 tabindex="-1">')
  })

  it('each has a heading, a way home and the contact address', () => {
    for (const page of PAGE_IDS) {
      const h = html(page)
      expect(h).toContain(`<h1 tabindex="-1">${PAGE_TITLES[page].replace('?', '?')}</h1>`)
      expect(h).toContain('Back')
      expect(h).toContain(`mailto:${CONTACT_EMAIL}`)
    }
  })

  it('date the three that are documents', () => {
    for (const page of ['privacy', 'terms'] as const) expect(textOf(html(page))).toContain(`Last updated ${LAST_UPDATED}`)
    expect(LAST_UPDATED).toBe('9 November 2026')
    // How accurate is this? changes with what the checks cover, so it has its own date.
    expect(textOf(html('accuracy'))).toContain(`Last updated ${ACCURACY_UPDATED}`)
  })

  it('name every council the checks know, on About and on How accurate is this?', () => {
    // Both pages said "one council (Wollongong so far)" while the picker offered four.
    expect(COUNCILS.length).toBeGreaterThan(1)
    expect(councilsSoFar(['Kiama'])).toBe('one council so far (Kiama)')
    expect(councilsSoFar(['Kiama', 'Wollongong'])).toBe('two councils so far (Kiama and Wollongong)')
    expect(councilsSoFar()).toBe('four councils so far (Blue Mountains, Central Coast, Kiama and Wollongong)')
    for (const page of ['about', 'accuracy'] as const) {
      const t = textOf(html(page))
      expect(t, page).toContain(councilsSoFar())
      for (const c of COUNCILS) expect(t, `${page}: ${c.name}`).toContain(c.name)
      expect(t, page).not.toMatch(/one council/)
    }
  })

  it('say what the surveyor’s file can be, and don’t list as missing what the checks now cover', () => {
    const about = textOf(html('about'))
    for (const s of ['DXF', 'LandXML', 'CSV']) expect(about, s).toContain(s)
    const t = textOf(html('accuracy'))
    const [good, limits] = t.slice(t.indexOf('Planning checks')).split('What they don’t cover')
    // The checks have driveway rows and a shadow-on-the-neighbours row; the page lists them as covered.
    for (const s of ['the driveway and its crossing', 'winter sun to your living rooms', 'where your shadow falls on the neighbours']) expect(good, s).toContain(s)
    expect(limits).not.toContain('garages and parking')
    expect(limits).not.toContain('sun to neighbours')
    // What is still left out stays said.
    for (const s of ['private open space', 'garage doors and parking spaces', 'where the neighbours’ windows and open space are', 'section 10.7 planning certificate']) expect(limits, s).toContain(s)
  })

  it('say what is kept, and what is not', () => {
    const t = textOf(html('privacy'))
    for (const s of ['IndexedDB', 'Cloudflare', 'passkey', 'recovery code', 'no analytics', 'no tracking cookies', 'one session cookie', '30 days', 'Australian Privacy Principles', 'Resend']) expect(t.toLowerCase(), s).toContain(s.toLowerCase())
  })

  it('say what email sign-in keeps, where it goes and how it goes away', () => {
    const t = textOf(html('privacy'))
    for (const s of ['the email address you add for sign-in', 'only to send you 6-digit sign-in codes', 'Resend, a US company', 'United States', 'only as a hash', '10 minutes', 'Remove the email from your account', 'Resend (to email your sign-in codes']) expect(t, s).toContain(s)
    expect(t).not.toContain('is on its way')
  })

  it('keep the terms to a planning aid, estimates, a storage limit and NSW law', () => {
    const t = textOf(html('terms'))
    for (const s of ['not professional advice', 'surveyor, engineer, certifier, architect or building designer', '50 MB', 'Australian Consumer Law', 'New South Wales', 'suspend', 'by invite']) expect(t, s).toContain(s)
  })

  it('cover each result on How accurate is this?', () => {
    const t = textOf(html('accuracy'))
    for (const s of ['Cut and fill', 'Retaining walls', 'over 600 mm', 'Planning checks', 'Housing Code', '20%', '3D prints', 'PDF plans']) expect(t, s).toContain(s)
  })

  it('say how rough the state’s ground levels are, and what reading them sends', () => {
    const a = textOf(html('accuracy'))
    for (const s of ['NSW 5 m elevation model', '±0.9 m', 'don’t use them for design', 'registered surveyor']) expect(a, s).toContain(s)
    const p = textOf(html('privacy'))
    for (const s of ['NSW Spatial Services elevation service', 'longitude and latitude', 'Nothing is sent until you ask', 'never in a view-only link']) expect(p, s).toContain(s)
  })

  it('name no person', () => {
    for (const page of PAGE_IDS) expect(html(page)).not.toMatch(/\b(Brayden|Mr|Mrs)\b/)
  })
})

describe('the footer and the caveat', () => {
  it('link the four pages and the contact address', () => {
    const h = renderToStaticMarkup(createElement(LegalFooter))
    for (const page of PAGE_IDS) expect(h).toContain(`href="#/${page}"`)
    expect(h).toContain(`mailto:${CONTACT_EMAIL}`)
    expect(h).toContain(ACCURACY_TITLE)
  })

  it('show the caveat with its link', () => {
    const h = renderToStaticMarkup(createElement(Caveat))
    expect(h).toContain(CAVEAT)
    expect(h).toContain('href="#/accuracy"')
  })
})

describe('the caveat leaves the app on every file', () => {
  const doc = parseDxf(planeSurvey())
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  const terrain = buildTerrain(survey)
  const plan = { ...garageFloor(), placement: { e: 1006, n: 1006, rotation: 0, ffl: 84 } }
  const latin1 = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

  it('is on every PDF plan sheet', () => {
    for (const paper of ['A3', 'A4'] as const) {
      const pdf = latin1(planSetPdf({ plan, survey, siteArea: terrain.stats.area, earthworks: null, up: 'house', paper, title: 'Test', date: '9 November 2026' }))
      const sheets = pdf.match(/\/Type \/Page /g)!.length
      expect(sheets).toBeGreaterThan(0)
      expect(pdf.split(`(${CAVEAT_LINE})`).length - 1, paper).toBe(sheets)
    }
  })
})
