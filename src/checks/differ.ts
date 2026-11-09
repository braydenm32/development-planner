// Why CDC and DA can say different things about the same wall, tree or setback. A row whose
// counterpart on the other route has another verdict gets one line saying what each route
// allows, so switching the route and seeing a Fix turn into an OK isn't a mystery.

import type { Council } from './councils'
import { CDC_TREE_SETBACK, runChecks } from './rules'
import type { Measures } from './measure'
import { WORD_OF, WORD_TEXT, type Word } from './topics'
import type { CheckResult, Pathway } from './types'

/** Each Housing Code row's counterparts among a council's rows. */
const PAIRS: [string, string[]][] = [
  ['hc-height', ['da-height']],
  ['hc-storeys', ['da-storeys']],
  ['hc-front', ['da-front']],
  ['hc-side', ['da-side', 'da-side-rear']],
  ['hc-rear', ['da-rear', 'da-side-rear']],
  ['hc-landscaped', ['da-landscaped']],
  ['hc-cut', ['da-cut-fill']],
  ['hc-retaining', ['da-retaining']],
]

/** The verdicts worth explaining: a fact still missing or a part not drawn isn't a difference in the rules. */
const DECIDED: Word[] = ['fix', 'confirm', 'ok']

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function counterpart(id: string, pathway: Pathway, other: CheckResult[]): CheckResult | undefined {
  if (id.startsWith('tree:')) return other.find(r => r.id === id)
  const ids = pathway === 'cdc' ? PAIRS.find(p => p[0] === id)?.[1] : PAIRS.filter(p => p[1].includes(id)).map(p => p[0])
  return ids ? other.find(r => ids.includes(r.id)) : undefined
}

/** What each route allows, in a few words. */
function says(r: CheckResult, route: Pathway, council: Council): string {
  if (route === 'cdc') {
    if (r.id === 'hc-retaining') return 'the Housing Code allows walls over 600 mm with an engineer’s certificate'
    if (r.tree) return `the Housing Code only asks for ${CDC_TREE_SETBACK} m between the house and the trunk`
    return r.limit ? `the Housing Code allows ${lower(r.limit)}` : 'the Housing Code measures it differently'
  }
  if (r.tree) return `${council.name} holds its protection zone to ${lower(r.limit ?? 'a minor encroachment')}`
  return r.limit ? `${council.name} allows ${lower(r.limit)}` : `${council.name} measures it differently`
}

/**
 * One line for each row whose verdict differs on the other route, by row id: "On a CDC this is OK:
 * the Housing Code allows walls over 600 mm with an engineer’s certificate; Wollongong allows up to 1 m."
 * Empty without a council, since there's no other route to compare with.
 */
export function routeDifferences(results: CheckResult[], ms: Measures, pathway: Pathway, council: Council | null, other?: CheckResult[]): Map<string, string> {
  const out = new Map<string, string>()
  if (!council) return out
  const theirs = other ?? runChecks(ms, pathway === 'cdc' ? 'da' : 'cdc', council.id)
  const otherName = pathway === 'cdc' ? 'DA' : 'CDC'
  for (const r of results) {
    const o = counterpart(r.id, pathway, theirs)
    if (!o) continue
    const mine = WORD_OF[r.status]
    const their = WORD_OF[o.status]
    if (mine === their || !DECIDED.includes(mine) || !DECIDED.includes(their)) continue
    const [cdc, da] = pathway === 'cdc' ? [r, o] : [o, r]
    out.set(r.id, `On a ${otherName} this is ${WORD_TEXT[their]}: ${says(cdc, 'cdc', council)}; ${says(da, 'da', council)}.`)
  }
  return out
}
