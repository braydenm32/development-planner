// The "Which column is which?" step for spot levels in a text file. A reader that isn't sure
// throws NeedColumns; the file flow asks here and waits for the answer (like the review sheet).

import { create } from 'zustand'
import type { ColumnRole, NeedColumns } from '../lib/pointsCsv'

export interface ColumnsAnswer {
  roles: ColumnRole[]
  header: boolean
}

export interface ColumnsAsk {
  fileName: string
  rows: string[][]
  header: boolean
  roles: ColumnRole[]
  answer: (a: ColumnsAnswer | null) => void
}

export const useColumns = create<{ ask: ColumnsAsk | null }>(() => ({ ask: null }))

/** Show the step and wait. Throws a plain message if the person backs out. */
export function confirmColumns(need: NeedColumns): Promise<ColumnsAnswer> {
  useColumns.getState().ask?.answer(null)
  return new Promise((resolve, reject) => {
    const answer = (a: ColumnsAnswer | null) => {
      if (useColumns.getState().ask?.answer === answer) useColumns.setState({ ask: null })
      if (a) resolve(a)
      else reject(new Error(`${need.fileName} wasn’t imported: the columns weren’t confirmed.`))
    }
    useColumns.setState({ ask: { fileName: need.fileName, rows: need.table.rows, header: need.table.header, roles: need.guess, answer } })
  })
}
