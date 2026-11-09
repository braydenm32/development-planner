# Blue Mountains City Council

First pass, checked 9 November 2026. Marks (**read**, **secondary**, **unverified**) mean the same as in [../compliance-and-swept-path-sources.md](../compliance-and-swept-path-sources.md). Section numbers are the DCP's or LEP's own. Every value below was read from the council's or NSW legislation's own PDF through the research session's web reader, which quotes the text; nothing was filled in from memory. Nothing here is legal advice; confirm with council before relying on it.

The app's table is [src/checks/councils/blueMountains.ts](../../../src/checks/councils/blueMountains.ts).

## Instruments

| Instrument | Where | Version read | Notes |
| --- | --- | --- | --- |
| Blue Mountains Local Environmental Plan 2015 | [PDF as made](https://legislation.nsw.gov.au/view/pdf/asmade/epi-2015-829) | As made: "Published LW 21 December 2015 (2015 No 829)", commencing 8 weeks after publication (cl 1.1AA) (**read**: cl 4.3, 4.3A, 4.4, 4.4A, 4.4B, 4.5(3)(a); the text read ends at cl 5.4) | Later versions weren't read: the legislation site's consolidated views fail for the research session. The as-made text uses the old zone names E3 and E4 (the DCP now says C3 and C4). |
| Blue Mountains Development Control Plan 2015 | [DCP 2015 page](https://www.bmcc.nsw.gov.au/development/planning-rules/development-controls-for-land-zoned-under-LEP-2015/DCP-2015) | Parts below, each "Revision: Amendment 8 (November 2025)" on its cover (**read**) | The page lists Parts A to L; Part H "is repealed effective November 2025". |

### DCP parts that apply to a new house on a sloping lot

| Part | Date | When it matters |
| --- | --- | --- |
| [Part B Context, Site Analysis and Design](https://www.bmcc.nsw.gov.au/sites/default/files/docs/DCP%202015_Amendment%208_Part%20B.pdf) | Amendment 8 (Nov 2025) | Always: height, setbacks, site cover, cut and fill |
| Part C Environmental Management | not read | Bushfire, vegetation, water |
| [Part E Site Development and Management](https://www.bmcc.nsw.gov.au/sites/default/files/docs/DCP%202015_Amendment%208_Part%20E.pdf) | Amendment 8 (Nov 2025) | Parking, driveways, erosion and sediment control |
| Part F Development Types, Part G Locality Management | not read | Other development types; precinct rules |

## Battle-axe lots

Part B calls them hatchet lots: "the building setback from the rear boundary of the lot in front is to be a minimum of **9m**" (B2.3 C3(d), **read**), and "Garages, car ports and the like are permitted within the building setback prescribed by C3(d)" (note to C3, **read**). The app uses this in place of the front setback when the lot is marked battle-axe. Part E says forward entry and exit generally isn't needed for a single house, except on classified roads, busy areas or with poor sight distance (E2.2.3 C2, **read**). The Housing Code's battle-axe rules are state-wide (see [wollongong.md](wollongong.md#battle-axe-lots)).

## LEP rules (as made)

All **read** from the as-made PDF.

### Part 4: development standards

| Clause | Rule | Mark |
| --- | --- | --- |
| 4.3(2) | "The height of a building on any land is not to exceed the maximum height shown for the land on the Height of Buildings Map." | read |
| 4.3A | Exceptions: Protected Area—Escarpment (including "a height of no more than 8 metres"), period housing, Zone E4, and Katoomba precincts. | read in part |
| 4.4(2) | FSR must not exceed the Floor Space Ratio Map. | read |
| 4.4A | Site coverage in zones E3 and E4 (now C3 and C4): **30% or 160 m², whichever is greater**, on lots under 1,000 m²; larger lots by formula; in E4 at least 60% landscaped. | read (the larger-lot formulas only in part) |
| 4.4B | Principal development area on E3 and E4 lots of 4,000 m² or more. | read in part |
| 4.5(3)(a) | For one lot, the site area is "the area of that lot". | read |

No LEP setback, site cover or landscaped area rule for zone R2 in the text read (up to cl 5.4). The zone tables weren't read.

## DCP Part B: dwelling houses in zone R2

B2.3 C3 and B2.4 C3 open "For land within Zone R2 Low Density Residential". Lots in C3 and C4 under 4,000 m² use the same setbacks (B2.3 C14), but their site cover comes from LEP cl 4.4A. All **read** from Part B, Amendment 8 (Nov 2025).

### Height and form

| Section | Rule | Mark |
| --- | --- | --- |
| B2.1 C1 | "The height of a building is not to exceed the maximum height of a building set by LEP 2015 clause 4.3 (Height of buildings) and the Height of Buildings Map." | read |
| — | **No storey limit** (only "single storey" and "2-storey" elements for setbacks; neither is defined). | read |
| B2.3 C3(a) | Buildings at most **80%** of the lot's width at any point (lots with a street frontage). | read |

### Setbacks

| Section | Rule | Mark |
| --- | --- | --- |
| B2.3 C3(b) | Front: "within 20% of the average setback of buildings on immediately adjoining allotments in established areas", or where there are none, at least **8 m** from the primary road frontage. | read |
| B2.3 C3(c) | Secondary frontage (corner lots): at least 3 m. | read |
| B2.3 C3(d) | Hatchet lots: at least **9 m** from the rear boundary of the lot in front. | read |
| B2.3 C3(e) | Parallel road: within 20% of the neighbours' average, else at least 3 m. | read |
| B2.3 C3(f) | Side: at least **1 m** for any single-storey element and **1.5 m** for any two-storey element. | read |
| B2.3 C3(g) | Rear: at least **4 m** for the single-storey element and **6 m** for the two-storey element. | read |
| B2.3.4 C4 | Side and rear setbacks don't apply to eaves, awnings, flues and the like at least **450 mm** from the boundary, or to fences, fascias, gutters, driveways, paths and paving. | read |

The app measures the two-storey element's setback from the upper floor's walls.

### Site coverage, landscaping, open space

| Section | Rule | Mark |
| --- | --- | --- |
| B2.4 C3(a) | Site cover, buildings and ancillary buildings: **40%** of the lot or **160 m²**, whichever is greater. | read |
| B2.4 C3(b) | At least **40%** of the lot kept as **pervious area**. | read |
| — | No landscaped area figure for R2 beyond the pervious area; no private open space figure (B2.4 objective only). | read |

The app checks the pervious area with its landscaped area measure (everything outside the house, slabs, driveways and decks).

### Sun and privacy

Part B's sun and privacy controls weren't read.

### Cut and fill, retaining walls

| Section | Rule | Mark |
| --- | --- | --- |
| B3.2.2 C7 | "Cut and fill is to be minimised as far as possible and be contained within the building footprint where conditions allow", **generally** at most **1 m** in height and depth unless contained within or retained by the building's walls. | read |
| Part E | No retaining wall heights, batter slopes or geotechnical report trigger in Part E (**read**); E2.3.3 C3 asks driveway cut and fill batters to be minimised with retaining walls. | read |

The app checks the cut and fill outside the house's footprint and, because the DCP says "generally", warns rather than fails.

From Part E (Amendment 8, Nov 2025, **read**), erosion and sediment control:

| Section | Rule | Mark |
| --- | --- | --- |
| E4.3 C1 | Soil disturbance under **2,500 m²**: an **erosion and sediment control plan** with the application (minor additions and works under 50 m² excepted). | read |
| E4.3 C2 | Over 2,500 m²: a **soil and water management plan**. | read |
| E4.3 C3(c) | The plan shows the location, extent and depth of any cut or fill. | read |

### Parking, garages and driveways

| Section | Rule | Mark |
| --- | --- | --- |
| E2.2.2 Table 1 | 1 space per dwelling. | read |
| E2.3.3 C3 | No driveway on a slope over 33% unless there's no alternative; then no steeper than 25%. | read |
| E2.3.3 C4 | Generally no steeper than **5%** across the verge and **25%** within the property. | read |
| E2.3.3 C5 | Transitions at least 2 m where the grade changes by more than 12.5%. | read |
| E2.3.3 C6 to C8 | Reinforced concrete at least 150 mm in the road reserve; no access from classified or collector roads where there's an alternative; set back from the side boundary for landscaping. | read |

### Fences and pools

Not read.

### Trees

Part C wasn't read, so the app has no tree checks for Blue Mountains.

## Housing Code (CDC) or Blue Mountains DCP (DA)?

The Housing Code column is state-wide (see [wollongong.md](wollongong.md#housing-code-cdc-or-wollongong-dcp-da)).

| Control | Housing Code (CDC) | Blue Mountains DCP 2015 (DA), zone R2 |
| --- | --- | --- |
| Height | 8.5 m, 2 storeys | LEP map; no storey limit |
| Front setback | Battle-axe: 3 m from the lot in front; otherwise the average of the two nearest houses within 40 m, else 4.5 m (lot size bands) | Within 20% of the neighbours' average, else 8 m; hatchet lots 9 m from the lot in front |
| Side setback | By lot width, plus a quarter of the height over 4.5 m | 1 m single storey, 1.5 m two storey |
| Rear setback | 3 m up to 4.5 m high, more above | 4 m single storey, 6 m two storey |
| Site coverage | None | 40% or 160 m², whichever is greater |
| Landscaped area | By lot size | 40% pervious |
| Cut and fill | By distance to the boundary; fill 1 m | Generally 1 m outside the footprint |

## Gaps for Blue Mountains

1. The **current LEP** (later than the 2015 as-made text) and the zone tables.
2. The **LEP map values** for the lot, and the scenic, escarpment and period housing maps that bring in cl 4.3A.
3. **Retaining walls**, **batter slopes** and **geotechnical reports**: not in Parts B or E; Part C or council may set them.
4. **Trees** (Part C, not read).
5. Part B's sun, privacy and character controls (B3, B5), Part F and the precinct rules in Part G.
6. How "single storey element" and "2-storey element" are measured (not defined in Part B).
