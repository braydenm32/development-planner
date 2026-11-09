// Blue Mountains City Council: the LEP and DCP rules for a dwelling house in zone R2, as data. Every
// value and clause is from docs/research/councils/blue-mountains.md, read from the council's and NSW
// legislation's own PDFs on 9 Nov 2026. What the research couldn't read is left out and listed there.

import type { Council } from './types'

export const BLUE_MOUNTAINS: Council = {
  id: 'blue-mountains',
  name: 'Blue Mountains',
  lga: 'Blue Mountains City Council',
  lep: 'Blue Mountains Local Environmental Plan 2015',
  rules: 'Blue Mountains LEP 2015 and DCP 2015',
  covers: 'Dwelling houses, zone R2',
  research: 'docs/research/councils/blue-mountains.md',
  checked: '9 Nov 2026',

  instruments: {
    lep: {
      name: 'Blue Mountains Local Environmental Plan 2015',
      cite: 'Blue Mountains LEP 2015',
      // The newest copy the research could open; the clauses read are the standard ones that send height and FSR to the maps.
      version: 'as made, 21 Dec 2015 (later versions not read)',
      url: 'https://legislation.nsw.gov.au/view/pdf/asmade/epi-2015-829',
    },
    b: {
      name: 'Blue Mountains Development Control Plan 2015, Part B Context, Site Analysis and Design',
      cite: 'Blue Mountains DCP 2015',
      version: 'Part B, Amendment 8 (Nov 2025)',
      url: 'https://www.bmcc.nsw.gov.au/sites/default/files/docs/DCP%202015_Amendment%208_Part%20B.pdf',
    },
    e: {
      name: 'Blue Mountains Development Control Plan 2015, Part E Site Development and Management',
      cite: 'Blue Mountains DCP 2015',
      version: 'Part E, Amendment 8 (Nov 2025)',
      url: 'https://www.bmcc.nsw.gov.au/sites/default/files/docs/DCP%202015_Amendment%208_Part%20E.pdf',
    },
  },

  // B2.1 C1 sends the height to the LEP and its map; the DCP has no figure of its own.
  height: { source: { in: 'lep', also: ['b'], clause: 'cl 4.3(2)', sure: 'read' } },
  fsr: { source: { in: 'lep', clause: 'cl 4.4(2), 4.5(3)', sure: 'read' } },
  front: {
    bands: [{ value: { min: 8, average: 'instead' } }],
    to: 'to the primary road',
    neighbours: 'within 20% of the average setback of the buildings on the adjoining lots',
    battleAxe: { min: 9, note: 'Garages, carports and the like may sit within it.', source: { in: 'b', clause: 'B2.3 C3(d)', sure: 'read' } },
    source: { in: 'b', clause: 'B2.3 C3(b)', sure: 'read' },
  },
  side: {
    min: 1,
    upper: 1.5,
    note: 'Eaves and the like may sit in it if they’re at least 450 mm from the boundary (B2.3.4 C4).',
    source: { in: 'b', clause: 'B2.3 C3(f)', sure: 'read' },
  },
  rear: { min: 4, upper: 6, source: { in: 'b', clause: 'B2.3 C3(g)', sure: 'read' } },
  coverage: { bands: [{ value: 0.4 }], atLeast: 160, source: { in: 'b', clause: 'B2.4 C3(a)', sure: 'read' } },
  landscaped: { name: 'Pervious area', bands: [{ value: { base: 0, share: 0.4, over: 0 } }], source: { in: 'b', clause: 'B2.4 C3(b)', sure: 'read' } },
  cutFill: { cut: 1, fill: 1, outsideHouse: true, generally: true, source: { in: 'b', clause: 'B3.2.2 C7', sure: 'read' } },
  erosion: {
    bands: [{ below: 2500, value: 'An erosion and sediment control plan (under 2,500 m²)' }, { value: 'A soil and water management plan (over 2,500 m²)' }],
    source: { in: 'e', clause: 'E4.3 C1, C2', sure: 'read' },
  },

  // Read and not there: Part B sets no storey limit and no upper-floor rear rule beyond the two-storey setbacks.
  absent: ['storeys', 'rearUpper'],

  notChecked: [
    'Zone and the LEP map values (height, floor space ratio, overlays)',
    'Building width: at most 80% of the lot’s width (B2.3 C3(a))',
    'Secondary frontage on a corner lot: 3 m (B2.3 C3(c))',
    'Driveways: no steeper than 25% in the lot and 5% across the verge (E2.3.3)',
    'Zones C3 and C4: the LEP’s own site cover (cl 4.4A) instead of the R2 figures here',
  ],
}
