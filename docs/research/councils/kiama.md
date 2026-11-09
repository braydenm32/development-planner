# Kiama Municipal Council

First pass, checked 9 November 2026. Marks (**read**, **secondary**, **unverified**) mean the same as in [../compliance-and-swept-path-sources.md](../compliance-and-swept-path-sources.md). Section numbers are the DCP's or LEP's own. Every value below was read from the council's or NSW legislation's own PDF through the research session's web reader, which quotes the text; nothing was filled in from memory. Nothing here is legal advice; confirm with council before relying on it.

The app's table is [src/checks/councils/kiama.ts](../../../src/checks/councils/kiama.ts).

## Instruments

| Instrument | Where | Version read | Notes |
| --- | --- | --- | --- |
| Kiama Local Environmental Plan 2011 | [PDF, version of 15 Dec 2023](https://legislation.nsw.gov.au/view/whole/pdf/inforce/2023-12-15/epi-2011-0680) | "Historical version for 15 December 2023 to 10 July 2025" (**read**: cl 4.3, 4.4, 4.5(3)(a)) | The current version (from 11 Jul 2025) couldn't be opened: the legislation site's current views fail for the research session, and only dated PDFs that turn up in a search can be read. The clauses the app uses are the standard ones that send height and FSR to the maps, so a later amendment is unlikely to change them, but check. |
| Kiama Development Control Plan 2020 | [DCP 2020 page](https://www.kiama.nsw.gov.au/Plan-and-build/Plans-maps-and-controls/Development-Control-Plan-2020) | Chapters below (**read**) | Adopted 17 Mar 2020 (resolution 20/071OC), effective 4 Apr 2020. No amendment history is shown on the page or the chapters; only Chapter 10 says "updated August 2024". The running page headers of Chapter 6 still say "Kiama DCP 2012". |

### DCP chapters that apply to a new house on a sloping lot

| Chapter | Date | When it matters |
| --- | --- | --- |
| [Chapter 2 Site considerations](https://www.kiama.nsw.gov.au/files/sharedassets/public/development-control-plans/kiama-development-control-plan-2020-chapter-2.-site-considerations.pdf), including Topic 2.4 [Tree preservation and vegetation management](https://www.kiama.nsw.gov.au/files/sharedassets/public/v/2/chapter-2-tree-preservation-and-vegetation-management.pdf) | Effective 4 Apr 2020 | Trees, flood, other site constraints |
| [Chapter 3 Common requirements](https://www.kiama.nsw.gov.au/files/sharedassets/public/development-control-plans/kiama-development-control-plan-2020-chapter-3.-common-requirements.pdf) | Effective 4 Apr 2020 | **Cut and fill, retaining walls** (Topic 3.3), parking (3.6), landscaping |
| [Chapter 6 Residential accommodation](https://www.kiama.nsw.gov.au/files/sharedassets/public/development-control-plans/kiama-development-control-plan-2020-chapter-6-residential-accommodation.pdf) | Effective 4 Apr 2020 | Always: Topic 6.1 is dwelling houses |

## Battle-axe lots

Chapter 6 has no front setback of its own for a house on a battle-axe lot (**read**: it uses "battle axe" only for dual occupancies, secondary dwellings and letterboxes, in 6.1.80, 6.2.15 and 6.4.15, and "access handles" only for density in R5, 6.1.9). So the app doesn't check the front setback on a battle-axe lot and asks you to check with council which boundary it treats as the front. The Housing Code's battle-axe rules are state-wide (see [wollongong.md](wollongong.md#battle-axe-lots)).

## LEP rules (version of 15 Dec 2023)

All **read** from the PDF above.

### Part 4: development standards

| Clause | Rule | Mark |
| --- | --- | --- |
| 4.3(2) | "The height of a building on any land is not to exceed the maximum height shown for the land on the Height of Buildings Map." No 4.3A in the text read. | read |
| 4.4(2) | FSR must not exceed the Floor Space Ratio Map. No 4.4A or 4.4B in the text read. | read |
| 4.5(3)(a) | For one lot, the site area is "the area of that lot". | read |

Clause 6.2 Earthworks is in the contents but its text was past what the reader returned (**not read**). The zone tables, Part 5 and the other local provisions weren't read.

## DCP Chapter 6, Topic 6.1: dwelling houses

Topic 6.1 applies to DAs "for both new dwellings and additions and alterations to existing dwellings", in the residential, rural and E3 zones. All **read** from Chapter 6 (effective 4 Apr 2020).

### Height and form

| Section | Rule | Mark |
| --- | --- | --- |
| 6.1.1 | Comply with "all Principal development standards as set by LEP 2011" (so the LEP map height). | read |
| 6.1.15 | Building height plane: no part of the structure (eaves, fascia and gutter up to 600 mm excepted) may exceed a plane at **45°** from **5 m** above existing ground at any boundary. | read |
| — | **No storey limit** for dwelling houses; only single storey forward of the foreshore building line at Minnamurra and Werri Lagoon (6.1.35, 6.1.49, 6.1.58). | read |

The app checks the LEP map height once it's entered, and lists the height plane as not checked yet.

### Setbacks

| Section | Rule | Mark |
| --- | --- | --- |
| 6.1.16 | Front building lines follow the building line maps (or other chapters). | read |
| 6.1.17 | Where not mapped: **4.5 m or the average setback from the primary road of the 2 nearest dwelling houses on the same side of the road, whichever is the greater**. | read |
| 6.1.18, 6.1.19 | Secondary building lines: 3.5 m (6.1.18) and 3 m (6.1.19); which applies where wasn't read. | read |
| 6.1.20 | Rear: **6 m** "unless otherwise identified on the Building Line Maps". | read |
| 6.1.21 | On lots with a 6 m front building line, houses generally on the neighbours' established rear line or 6 m, whichever is greater. | read |
| 6.1.22 | Single-storey non-habitable structures (garages, pools, pergolas, barbecue areas) may be closer to the rear if council agrees. | read |
| 6.1.23 | Side: **900 mm** to a vertical member; **675 mm** to the edge of the gutter, eaves or fascia. | read |
| 6.1.25 | Where the front building line is under 6 m, garages and carports **6 m** from the street boundary. | read |
| 6.1.26 | Rural areas: 15 m from a public road. | read |

### Site coverage, landscaping, open space

| Section | Rule | Mark |
| --- | --- | --- |
| 6.1.60 | Building footprint at most **60%** for a single dwelling house in the urban zones (and in Elambra Estate, West Kiama and Cedar Grove); Gerringong Headland by its masterplan. | read |
| — | **No landscaped area figure** for a house: only objective O:6.1.32 ("sufficient space for private open space and landscaping") and 6.1.14 (landscape ancillary development). | read |
| 6.1.70 | Private open space at least **24 m²**, at least **6 × 4 m**. | read |
| 6.1.71 | Directly off the main living area. | read |
| 6.1.72 | No steeper than **1:4** finished. | read |
| 6.1.64 | Storage: 8 m³ (2 bedrooms), 10 m³ (3 or more). | read |

### Sun and privacy

| Section | Rule | Mark |
| --- | --- | --- |
| 6.1.73 | At least half of the private open space gets **3 hours** of sun between 9 am and 3 pm on 22 June. | read |
| 6.1.75 | Balconies on the side of a building need privacy measures. | read |

### Cut and fill, retaining walls

From Chapter 3 Topic 3.3 Earthworks and Retaining Walls (effective 4 Apr 2020, **read**):

| Section | Rule | Mark |
| --- | --- | --- |
| 3.3.1 | "Cutting and filling on site is limited to **900mm**." No separate fill limit. | read |
| 3.3.2 | Terracing only with engineer-designed walls stepped at least 1 m apart horizontally. | read |
| 3.3.4 | No dwelling on slopes steeper than **20%** unless an approved, registered building envelope applies. | read |
| 3.3.6 | Council **may require** a geotechnical report (no trigger given; the sentence is garbled in the PDF). | read |
| 3.3.7 | Excavation for a building no more than 1 m below existing ground; external retaining walls no more than **1 m** above existing ground; batters no steeper than **1:4** "(absolute)", "preferably 1:6". | read |
| 3.3.10 | Batter revegetation in the landscape plan. | read |
| Ch 3 landscaping (before 3.2.59) | "Retaining walls over 600mm high require Engineer's documentation." | read |
| 6.1 building line list | A fence or retaining wall up to 1.2 m (5 m² at most) may sit forward of the building line. | read |

3.3.1's 900 mm and 3.3.7's 1 m for excavation under a building disagree; the app holds cut and fill to the stricter 900 mm everywhere. Chapter 3 has no erosion and sediment control area thresholds (**read**: only 3.3.10).

### Parking, garages and driveways

| Section | Rule | Mark |
| --- | --- | --- |
| 6.1.24, 6.1.66 | Parking behind the building line; at least one space behind it. | read |
| 6.1.65 | Garages at most **50%** of the front or street elevation. | read |
| 6.1.68, 6.1.69 | No double garage next to another; garaging set back at least **6 m** for stacked parking. | read |
| 6.1.3 | Forward entry and exit where the site fronts a main or arterial road. | read |

Chapter 3 Topic 3.6 (transport, access and parking) wasn't read.

### Fences and pools

Not read.

### Trees (Chapter 2 Topic 2.4)

From [Topic 2.4](https://www.kiama.nsw.gov.au/files/sharedassets/public/v/2/chapter-2-tree-preservation-and-vegetation-management.pdf) (effective 4 Apr 2020, **read**):

| Section | Rule | Mark |
| --- | --- | --- |
| Application | A **prescribed tree** (non-rural, not exempt) is 5 m or taller, or 200 mm across at 1 m above the ground, or spreads 3 m or more. | read |
| 2.4.1(b); Appendix 6 | Trees on development sites are assessed to AS 4970-2009; the arborist's report shows the tree protection zone and structural root zone. | read |
| Exemptions | A tree approved for removal under an earlier valid consent. | read |
| — | **No removal distance** from an approved building (like Wollongong's 3 m) and **no encroachment limit** of its own. | read |

The app doesn't run tree checks for Kiama yet: the DCP's own rule for what can be removed and how much of a protection zone can be built over wasn't found, so it's listed as not checked.

## Housing Code (CDC) or Kiama DCP (DA)?

The Housing Code column is state-wide (see [wollongong.md](wollongong.md#housing-code-cdc-or-wollongong-dcp-da)).

| Control | Housing Code (CDC) | Kiama DCP 2020 (DA) |
| --- | --- | --- |
| Height | 8.5 m, 2 storeys | LEP map; 45° plane from 5 m at the boundaries; no storey limit |
| Front setback | Average of the two nearest houses within 40 m, else 4.5 m (lot size bands) | 4.5 m or the two nearest houses' average, whichever is greater (or the building line map) |
| Side setback | 0.9 to 2.5 m plus a quarter of the height over 4.5 m, by lot width | 900 mm (675 mm to the eaves) |
| Rear setback | 3 m up to 4.5 m high, more above | 6 m (or the building line map) |
| Site coverage | None | 60% footprint |
| Landscaped area | By lot size | None |
| Cut and fill | By distance to the boundary | 900 mm; batters 1:4 (1:6 preferred); walls 1 m |
| Private open space | 24 m², 3 × 3 m | 24 m², 6 × 4 m, 1:4 at most |

## Gaps for Kiama

1. The **current LEP** (from 11 Jul 2025) and the zone tables; the version read is 15 Dec 2023.
2. The **LEP map values** and the **building line maps** for the lot (front and rear lines, foreshore building lines).
3. **Erosion and sediment control**: no area thresholds in Chapter 3; where Kiama puts them wasn't found.
4. **Trees**: no removal distance or encroachment limit of the DCP's own.
5. Clause 6.2 Earthworks of the LEP (past the part the reader returned).
6. Chapter 3 Topic 3.6 parking and driveway grades, fences and pools.
7. How secondary building lines 6.1.18 (3.5 m) and 6.1.19 (3 m) split.
