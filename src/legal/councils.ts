// How About and How accurate is this? name the councils whose rules the checks know.

import { COUNCILS } from '../checks/councils'

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/**
 * "four councils so far (Blue Mountains, Central Coast, Kiama and Wollongong)", built from the
 * councils the checks know, so these pages can't fall behind the council picker again.
 */
export function councilsSoFar(names: string[] = COUNCILS.map(c => c.name)): string {
  const n = names.length
  const list = n > 1 ? `${names.slice(0, -1).join(', ')} and ${names[n - 1]}` : names[0]
  return `${NUMBER_WORDS[n] ?? n} council${n === 1 ? '' : 's'} so far (${list})`
}
