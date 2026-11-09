// Kiama Municipal Council: the LEP and DCP rules for a dwelling house, as data. Every value and
// clause is from docs/research/councils/kiama.md, read from the council's and NSW legislation's
// own PDFs on 9 Nov 2026. What the research couldn't read is left out and listed there as a gap.

import type { Council } from './types'

export const KIAMA: Council = {
  id: 'kiama',
  name: 'Kiama',
  lga: 'Kiama Municipal Council',
  lep: 'Kiama Local Environmental Plan 2011',
  rules: 'Kiama LEP 2011 and DCP 2020',
  covers: 'Dwelling houses in the urban zones',
  research: 'docs/research/councils/kiama.md',
  checked: '9 Nov 2026',

  instruments: {
    lep: {
      name: 'Kiama Local Environmental Plan 2011',
      cite: 'Kiama LEP 2011',
      // The newest copy the research could open; the clauses read are the standard ones that send height and FSR to the maps.
      version: 'version of 15 Dec 2023 (later versions not read)',
      url: 'https://legislation.nsw.gov.au/view/whole/pdf/inforce/2023-12-15/epi-2011-0680',
    },
    ch6: {
      name: 'Kiama Development Control Plan 2020, Chapter 6 Residential Accommodation',
      cite: 'Kiama DCP 2020',
      version: 'chapter 6, in force 4 Apr 2020',
      url: 'https://www.kiama.nsw.gov.au/files/sharedassets/public/development-control-plans/kiama-development-control-plan-2020-chapter-6-residential-accommodation.pdf',
    },
    ch3: {
      name: 'Kiama Development Control Plan 2020, Chapter 3 Common Requirements',
      cite: 'Kiama DCP 2020',
      version: 'chapter 3, in force 4 Apr 2020',
      url: 'https://www.kiama.nsw.gov.au/files/sharedassets/public/development-control-plans/kiama-development-control-plan-2020-chapter-3.-common-requirements.pdf',
    },
  },

  // The DCP has a building height plane instead of a height of its own (6.1.15, listed as not checked).
  height: { source: { in: 'lep', clause: 'cl 4.3(2)', sure: 'read' } },
  fsr: { source: { in: 'lep', clause: 'cl 4.4(2), 4.5(3)', sure: 'read' } },
  front: {
    bands: [{ value: { min: 4.5, average: 'or-greater' } }],
    to: 'to the primary road',
    neighbours: 'the average of the two nearest houses on the same side of the road',
    garage: 'garages and carports 6 m from the street where the building line is under 6 m',
    note: 'Where the building line maps show a front line for the lot, that applies instead (6.1.16).',
    battleAxe: { note: 'Chapter 6 has no front setback of its own for a house on a battle-axe lot, so ask council which boundary it treats as the front.' },
    source: { in: 'ch6', clause: '6.1.16, 6.1.17, 6.1.25', sure: 'read' },
  },
  side: {
    min: 0.9,
    note: 'Measured to the wall; eaves, gutters and fascias can come to 675 mm.',
    source: { in: 'ch6', clause: '6.1.23', sure: 'read' },
  },
  rear: {
    min: 6,
    note: 'Unless the building line maps show another rear line. Single-storey garages, pools and pergolas may be closer if council agrees (6.1.22).',
    source: { in: 'ch6', clause: '6.1.20', sure: 'read' },
  },
  coverage: { bands: [{ value: 0.6 }], source: { in: 'ch6', clause: '6.1.60', sure: 'read' } },
  batters: { run: 4, prefer: 6, source: { in: 'ch3', clause: '3.3.7', sure: 'read' } },
  cutFill: { cut: 0.9, fill: 0.9, source: { in: 'ch3', clause: '3.3.1', sure: 'read' } },
  retaining: { max: 1, source: { in: 'ch3', clause: '3.3.7', sure: 'read' } },

  // Read and not there: chapter 6 sets no storey limit, upper-floor rear rule or landscaped area for a
  // house, and chapter 3 sets no trigger for a geotechnical report (council "may require" one, 3.3.6).
  absent: ['storeys', 'rearUpper', 'landscaped', 'geotech'],

  notChecked: [
    'Zone and the LEP map values (height, floor space ratio, overlays)',
    'The building height plane: 45° in from 5 m above the ground at each boundary (6.1.15)',
    'Building line maps, secondary frontages and foreshore building lines (6.1.16 to 6.1.19)',
    'Private open space: 24 m², at least 6 × 4 m, no steeper than 1 in 4 (6.1.70, 6.1.72)',
    'Garages: at most half the street elevation, set back 6 m (6.1.65, 6.1.69)',
    'Land steeper than 20%: no house without a registered building envelope (3.3.4)',
    'Retaining walls over 600 mm need an engineer’s documentation (chapter 3, landscaping)',
    'Geotechnical report: council may ask for one (3.3.6)',
  ],
}
