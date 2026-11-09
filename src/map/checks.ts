// Rows for Design › Checks from the NSW planning maps, once the block is placed: is the land one a
// CDC can be used on, and what extra rules come with it. These are flags, not a planning
// certificate: the council's section 10.7 certificate is the final word, and every row says so.

import type { CheckResult, CheckStatus, Confidence, Pathway } from '../checks/types'
import type { PlanningFacts } from './planning'

/** The zones the Housing Code covers (other rural and large-lot zones have the Rural Housing Code). */
const HOUSING_CODE_ZONES = ['R1', 'R2', 'R3', 'R4', 'RU5']

const day = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

export function mapChecks(f: PlanningFacts, pathway: Pathway): CheckResult[] {
  const asAt = `NSW planning maps, read ${day(f.at)}`
  const row = (id: string, title: string, status: CheckStatus, value: string, note: string, clause: string, confidence: Confidence): CheckResult => ({
    id: `map:${id}`,
    title,
    status,
    value,
    note,
    source: { clause, confidence, asAt },
  })
  const failed = (k: PlanningFacts['failed'][number]) => f.failed.includes(k)
  const out: CheckResult[] = []
  const cdc = pathway === 'cdc'

  // Zone
  if (failed('zone')) out.push(row('zone', 'Zone', 'unknown', 'The zoning map didn’t answer', 'Read the planning layers again under Site › Map.', 'LEP land zoning map', 'read'))
  else if (!f.zones.length) out.push(row('zone', 'Zone', 'unknown', 'No zone found', 'The zoning map has nothing at this lot. The planning certificate says what applies.', 'LEP land zoning map', 'read'))
  else {
    const main = f.zones.find(z => z.middle) ?? f.zones[0]
    const others = f.zones.filter(z => z !== main)
    const part = others.length ? ` Part of the lot is also in ${list(others.map(z => z.name))}.` : ''
    if (cdc) {
      const ok = HOUSING_CODE_ZONES.includes(main.code)
      out.push(
        row(
          'zone',
          'Zone',
          ok && !others.length ? 'pass' : 'warn',
          main.name,
          ok ? `The Housing Code covers houses in this zone.${part}` : `The Housing Code covers zones ${list(HOUSING_CODE_ZONES)}, so a CDC for a house here may need another code, or a DA.${part}`,
          'Housing Code, land it applies to',
          'secondary',
        ),
      )
    } else {
      const residential = /^R[1-5]$|^RU/.test(main.code)
      out.push(
        row(
          'zone',
          'Zone',
          residential && !others.length ? 'pass' : 'warn',
          main.name,
          `${residential ? 'Houses are usually permitted with consent in this zone.' : 'Check the LEP’s land use table permits a house in this zone.'}${part}`,
          `${f.lep ?? 'LEP'}, land use table`,
          'unverified',
        ),
      )
    }
  }

  // Heritage
  if (failed('heritage')) out.push(row('heritage', 'Heritage', 'unknown', 'The heritage map didn’t answer', 'Read the planning layers again under Site › Map.', 'LEP heritage map', 'read'))
  else {
    const items = f.heritage.filter(h => /item/i.test(h.kind))
    const areas = f.heritage.filter(h => !/item/i.test(h.kind))
    if (!f.heritage.length) out.push(row('heritage', 'Heritage', 'pass', 'No heritage item or conservation area', 'Nothing on the LEP heritage map at this lot.', 'LEP heritage map', 'read'))
    else if (items.length) {
      const names = list(items.map(h => `${h.name}${h.item ? ` (item ${h.item})` : ''}`))
      out.push(
        row(
          'heritage',
          'Heritage item',
          cdc ? 'fail' : 'warn',
          names,
          cdc
            ? 'A CDC can’t be used on land with a heritage item. A DA is needed, with a heritage impact statement.'
            : 'A DA on a heritage item needs a heritage impact statement, and council weighs the item’s significance.',
          cdc ? 'Codes SEPP cl 1.17A, heritage items' : 'LEP cl 5.10',
          cdc ? 'secondary' : 'read',
        ),
      )
    }
    if (areas.length)
      out.push(
        row(
          'heritage-area',
          'Heritage conservation area',
          'warn',
          list(areas.map(h => h.name)),
          cdc
            ? 'Some Housing Code rules change in a heritage conservation area, and a new house may need a DA. Check the planning certificate.'
            : 'Council looks at how the house fits the conservation area’s character.',
          cdc ? 'Codes SEPP, heritage conservation areas' : 'LEP cl 5.10',
          'unverified',
        ),
      )
  }

  // Bushfire
  if (failed('bushfire')) out.push(row('bushfire', 'Bushfire prone land', 'unknown', 'The bushfire map didn’t answer', 'Read the planning layers again under Site › Map.', 'Bushfire prone land map', 'read'))
  else if (!f.bushfire.length) out.push(row('bushfire', 'Bushfire prone land', 'pass', 'Not mapped as bushfire prone', 'Nothing on the bushfire prone land map at this lot.', 'Bushfire prone land map', 'read'))
  else
    out.push(
      row(
        'bushfire',
        'Bushfire prone land',
        'warn',
        `${list(f.bushfire.map(h => h.name))}${f.bushfire.some(h => h.middle) ? '' : ', over part of the lot'}`,
        cdc
          ? 'You’ll need a bushfire attack level (BAL) from a bushfire consultant. A CDC can’t be used at BAL-40 or BAL-FZ; below that the house is built to AS 3959.'
          : 'The DA needs a bushfire assessment under Planning for Bush Fire Protection 2019, with a bushfire attack level (BAL), and goes to the RFS if it doesn’t comply.',
        cdc ? 'Codes SEPP, bush fire prone land' : 'EP&A Act s 4.14; Planning for Bush Fire Protection 2019',
        'unverified',
      ),
    )

  // Flood. Some councils (Wollongong among them, LEP cl 5.21) define flood planning land by their
  // own studies rather than an LEP map, so an empty map there isn't a clear answer.
  const unmappedFlood = (f.lga ?? '').toUpperCase() === 'WOLLONGONG'
  if (failed('flood')) out.push(row('flood', 'Flood planning', 'unknown', 'The flood map didn’t answer', 'Read the planning layers again under Site › Map.', 'LEP flood planning map', 'read'))
  else if (f.flood.length)
    out.push(
      row(
        'flood',
        'Flood planning',
        'warn',
        `${list(f.flood.map(h => h.name))}${f.flood.some(h => h.middle) ? '' : ', over part of the lot'}`,
        cdc
          ? 'A flood control lot: a CDC needs the council’s flood certificate, and can’t be used in a floodway or high hazard area. Floor levels are set above the flood planning level.'
          : 'Council needs the house to suit the flood behaviour, not make flooding worse elsewhere, and allow safe evacuation.',
        cdc ? 'Codes SEPP, flood control lots' : 'LEP cl 5.21',
        cdc ? 'unverified' : 'read',
      ),
    )
  else if (unmappedFlood)
    out.push(
      row(
        'flood',
        'Flood planning',
        'unknown',
        'Not on a flood map here',
        'Wollongong works out flood planning land from its flood studies, not an LEP map, so ask the council for a flood certificate or check the planning certificate.',
        'Wollongong LEP 2009 cl 5.21',
        'read',
      ),
    )
  else out.push(row('flood', 'Flood planning', 'pass', 'Not on the flood planning map', 'Nothing on the LEP flood planning map at this lot. The planning certificate is the final word.', 'LEP flood planning map', 'read'))

  // Landslide
  if (failed('landslide')) out.push(row('landslide', 'Landslide risk', 'unknown', 'The landslide map didn’t answer', 'Read the planning layers again under Site › Map.', 'LEP landslide risk map', 'read'))
  else if (f.landslide.length)
    out.push(
      row(
        'landslide',
        'Landslide risk',
        cdc ? 'fail' : 'warn',
        `${list(f.landslide.map(h => h.name))}${f.landslide.some(h => h.middle) ? '' : ', over part of the lot'}`,
        cdc ? 'The Housing Code doesn’t cover land mapped as landslide risk, so a DA is needed.' : 'Expect council to ask for a geotechnical report.',
        cdc ? 'Housing Code cl 3.2(1)(h)' : `${f.lep ?? 'LEP'}, landslide risk`,
        'secondary',
      ),
    )
  else out.push(row('landslide', 'Landslide risk', 'pass', 'Not mapped as landslide risk', 'Nothing on the landslide risk map at this lot.', 'LEP landslide risk map', 'read'))

  return out
}
