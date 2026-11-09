// The pages about the app say what they should, work with no project, and the one caveat is on
// everything that leaves the app.

import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { PAGE_IDS, formatHash, parseHash } from '../../nav/route'
import { Caveat } from '../Caveat'
import { ACCURACY_TITLE, CAVEAT, CAVEAT_LINE, CONTACT_EMAIL, LAST_UPDATED } from '../caveat'
import { LegalFooter } from '../LegalFooter'
import { LegalPage } from '../LegalPage'
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
  it('each has a heading, a way home and the contact address', () => {
    for (const page of PAGE_IDS) {
      const h = html(page)
      expect(h).toContain(`<h1>${PAGE_TITLES[page].replace('?', '?')}</h1>`)
      expect(h).toContain('Back')
      expect(h).toContain(`mailto:${CONTACT_EMAIL}`)
    }
  })

  it('date the three that are documents', () => {
    for (const page of ['privacy', 'terms', 'accuracy'] as const) expect(textOf(html(page))).toContain(`Last updated ${LAST_UPDATED}`)
    expect(LAST_UPDATED).toBe('9 November 2026')
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
    for (const s of ['Cut and fill', 'Retaining walls', 'over 1.0 m', 'Planning checks', 'Housing Code', '20%', '3D prints', 'PDF plans']) expect(t, s).toContain(s)
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
