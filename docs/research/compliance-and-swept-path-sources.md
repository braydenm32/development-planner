# Sources for the compliance checker and swept path analysis

Research notes for two features parked until after the calm redesign:

1. **A compliance checker** that tests a design against NSW planning and building rules (local LEP and DCP, the Codes SEPP and other SEPPs, the EP&A Act, the Home Building Act, the building practitioner laws and the NCC).
2. **AutoTURN-style swept path analysis** for the driveway, garage and turning areas.

Checked on **8 November 2026**. Nothing here is legal advice, and every number should be checked against the primary text before the app relies on it.

Companion notes:

- [councils/wollongong.md](councils/wollongong.md): Wollongong LEP 2009 and DCP 2009 rules for the block, and how they compare with the Housing Code. [councils/README.md](councils/README.md) explains how to add more councils.
- [map-placement.md](map-placement.md): placing the survey on a satellite image of the block, which unlocks the planning lookups.

## How sure each fact is

| Mark | Meaning |
| --- | --- |
| **read** | Read from the official source (the legislation, the agency page or the standard itself). |
| **secondary** | From an official explainer, fact sheet, law firm or industry body summary, not the legal text. |
| **unverified** | Commonly quoted or from memory, not confirmed in this pass. Check before use. |

A note on access from this research session: legislation.nsw.gov.au, the RFS site and parts of the NCC site refused automated fetches, so the Codes SEPP clauses below come from AustLII's consolidation and department fact sheets rather than the official site. A later thread working from a normal browser should re-check them there.

## What the app needs before anything is checkable

Most rules depend on facts about the block that the app doesn't hold yet:

| Input | Why it's needed | Where it comes from |
| --- | --- | --- |
| Council (LGA) and LEP | Height, FSR, minimum lot size, zone and local clauses all come from the LEP. DCP rules are council specific. | **Wollongong** first (Wollongong LEP 2009, DCP 2009). In general, from the Planning Portal lookup once the block is on the map. |
| Zone (for example R2) | Decides whether a dwelling house is permitted and whether the Housing Code can be used (R1, R2, R3, R4 and RU5 only). | LEP Land Zoning map layer. |
| Lot and DP | The key for the cadastre, planning certificate and spatial lookups. | Title or rates notice. NSW cadastre service below. |
| Georeference of the survey | The survey is in local coordinates (E/N about 1000), so the app can't place the block on the state maps. One known MGA point and the grid bearing would do. | Fit the survey boundary to the cadastre lot, or place it by hand on NSW imagery. See [map-placement.md](map-placement.md). |
| Lot area, access handle, easements and trees | Floor area, landscaped area, site coverage and the setback bands are all keyed to lot area, and the Housing Code leaves a battle-axe access handle out of it. Battle-axe lots also get their own setback and lot-shape rules. Easements and protected trees take land out of the buildable area. | The title and the survey plan. On a battle-axe lot the title area includes the access handle and a DXF boundary often doesn't, so the two areas differ. See [councils/wollongong.md](councils/wollongong.md#battle-axe-lots). |
| Which boundary is the street | Front setbacks, building line, landscaped area forward of the building line, garage rules and the driveway crossover all key off the primary road boundary. Corner lots also have a secondary road. | New input on the boundary edges. |
| Neighbouring dwelling setbacks | The Housing Code front setback is the average of the two nearest dwellings within 40 m on the same side of the road. | New input, or measured from aerial imagery. |
| Hazard overlays | Bushfire prone land, flood planning, landslide, acid sulfate soils, heritage, biodiversity. These can rule out complying development or add rules. | ePlanning hazard and protection layers below, and the council's section 10.7 planning certificate. |

## Which rules apply depends on the approval pathway

A new house in NSW goes one of three ways, and the checker should be able to run both of the last two:

- **Exempt development** (no approval): only for minor works such as small retaining walls and earthworks under 600 mm. Codes SEPP Part 2.
- **Complying development certificate (CDC)**: fast track if the design meets every numeric standard in the Housing Code (Codes SEPP Part 3) and the land isn't excluded. Pass or fail, no discretion.
- **Development application (DA)**: assessed by council against the LEP, the DCP and section 4.15 of the EP&A Act. Standards can be varied with justification (LEP clause 4.6 for LEP standards; DCP controls are guidelines).

Council DCPs belong to the DA route (s 4.15(1)(a)(iii)); a CDC is checked only against the Codes SEPP standards, so a DCP control such as Wollongong's one-storey default for battle-axe lots doesn't bind a CDC (**unverified** in this pass: no page read says it outright).

So a useful first output is "can this design go through a CDC, and if not, which standards fail", then a DA check against the LEP and DCP.

## Source register

### State planning law

| Source | Official URL | Version checked | Checkable rules | Machine access | Licence |
| --- | --- | --- | --- | --- | --- |
| Environmental Planning and Assessment Act 1979 | [act-1979-203](https://legislation.nsw.gov.au/view/html/inforce/current/act-1979-203) | Current consolidation (not opened, site refused fetch) | Process: approval pathways, s 4.15 matters for consideration, s 4.14 bushfire, s 10.7 planning certificates. No dimensions. | NSW legislation XML export (below) | See licences section |
| EP&A Regulation 2021 | [sl-2021-0759](https://legislation.nsw.gov.au/view/html/inforce/current/sl-2021-0759) | Current (not opened) | Process: what a DA and CDC must include (site plan, survey, plans, elevations, sections, shadow diagrams where required), BASIX certificate requirement. | XML export | See licences |
| SEPP (Exempt and Complying Development Codes) 2008 ("Codes SEPP") | [epi-2008-0572](https://legislation.nsw.gov.au/view/html/inforce/current/epi-2008-0572); AustLII copy [seppacdc2008721](https://www5.austlii.edu.au/au/legis/nsw/consol_reg/seppacdc2008721/) | See the Housing Code section | **Most checkable source.** Part 3 Housing Code: lot size and width, height, storeys, floor area, landscaped area, setbacks, garage width, privacy, earthworks, retaining walls. Part 2: exempt earthworks and retaining walls. | XML export; planning portal explainer [Housing Code](https://www.planningportal.nsw.gov.au/development-assessment/codes-sepp/housing-code) (last updated 14 Sep 2022) | See licences |
| 2026 proposed Codes SEPP changes | [EIE: variations and changes to complying development](https://www.planningportal.nsw.gov.au/draftplans/under-consideration/variations-and-changes-complying-development-explanation-intended-effect); [summary PDF](https://www.planningportal.nsw.gov.au/sites/default/files/documents/2026/_Summary%20of%20EIE%20Variations%20and%20changes%20to%20complying%20development.pdf) | Exhibited 14 May to 24 June 2026; expected to commence Q3 2026, status not confirmed on 8 Nov 2026 (**read**) | Proposes a CDC "variation certificate" (height 8.5 to 9 m where the LEP allows, GFA up to +10%, setback and garage variations) and permanent tweaks (front setback can align with one of the two nearest dwellings within 40 m; garage wall height from FFL over a drop edge beam; privacy screen relief; tanks up to 1.8 m within 450 mm of a side boundary). | PDF only | |
| SEPP (Housing) 2021 | [epi-2021-0714](https://legislation.nsw.gov.au/view/html/inforce/current/epi-2021-0714) | Current (not opened) | Secondary dwellings (granny flats): permitted R1 to R5, CDC needs a lot of at least 450 m², no extra parking, standards in Schedule 1 (**secondary**, [planning.nsw secondary dwellings](https://www.planning.nsw.gov.au/the-planning-system/housing/housing-sepp/secondary-dwellings), updated 17 Jul 2025). The often-quoted 60 m² cap is **unverified**. Low and mid-rise housing: dual occupancy permitted in R2 state-wide; in low and mid-rise areas, non-refusal standards of 450 m² lot, 12 m width, FSR 0.65:1, height 9.5 m, 1 space per dwelling (**secondary**, [summary of key provisions](https://www.planning.nsw.gov.au/the-planning-system/housing/low-and-mid-rise-housing-policy/summary-of-key-provisions), updated 21 Mar 2025). | XML export | |
| SEPP (Sustainable Buildings) 2022 and BASIX | [epi-2022-0521](https://legislation.nsw.gov.au/view/html/inforce/current/epi-2022-0521); [BASIX standards](https://www.planningportal.nsw.gov.au/BASIX-standards) | BASIX standards in force from 1 Oct 2023 (page updated 10 Mar 2025) (**read**) | A BASIX certificate is needed for a new home, renovations of $50,000 or more, or a pool or spa over 40,000 L. New detached houses need thermal performance equal to 7 NatHERS stars (climate zones 9, 10 and 11 excluded from the increase) plus heating and cooling caps, an energy target (a % cut on a 3,292 kg CO2-e per person per year benchmark, by climate zone and floor area) and a water target. The app could estimate glazing ratios and orientation but not issue a certificate. | **No API.** The BASIX tool is a login-only web form. A [BASIX datasets](https://www.planningportal.nsw.gov.au/basix/about-basix/basix-datasets) page exists and wasn't checked. | |
| SEPP (Resilience and Hazards) 2021 | [epi-2021-0730](https://legislation.nsw.gov.au/view/html/inforce/current/epi-2021-0730) | Not opened | Coastal management areas and contaminated land. Mostly flags, not dimensions. | XML export; coastal layers on the ePlanning SEPP service | |
| SEPP (Transport and Infrastructure) 2021 | [epi-2021-0732](https://legislation.nsw.gov.au/view/html/inforce/current/epi-2021-0732) | Not opened | Development with frontage to a classified road (driveway access needs TfNSW concurrence), development near electricity infrastructure. Flags. | XML export | |
| SEPP (Biodiversity and Conservation) 2021 | [epi-2021-0722](https://legislation.nsw.gov.au/view/html/inforce/current/epi-2021-0722) | Not opened | Vegetation clearing in non-rural areas, koala habitat. Flags; tree removal usually goes to the DCP. | XML export | |
| Standard Instrument (Local Environmental Plans) Order 2006 | [epi-2006-0155](https://legislation.nsw.gov.au/view/html/inforce/current/epi-2006-0155); [about the Standard Instrument](https://legislation.nsw.gov.au/information/standard-instrument-lep) | Not opened | The template every LEP follows, so clause numbers are the same across councils: 2.x zones and land use tables, 4.1 minimum subdivision lot size, 4.3 height of buildings, 4.4 floor space ratio, 4.6 exceptions, 5.10 heritage, 5.21 flood planning. Local earthworks clauses usually sit in Part 6 or 7 (**unverified** numbering). | XML export | |
| Planning for Bush Fire Protection 2019 (RFS) | [RFS PBP page](https://www.rfs.nsw.gov.au/plan-and-prepare/building-on-bush-fire-prone-land/planning-for-bush-fire-protection); [PBP 2019 PDF](https://www.rfs.nsw.gov.au/__data/assets/pdf_file/0005/174272/Planning-for-Bush-Fire-Protection-2019.pdf) | PBP 2019 adopted 1 Mar 2020, amended by 2022 and 2025 addenda. A draft PBP 2026 was exhibited to 3 Sep 2026, with finalisation expected Dec 2026 (**secondary**, [The Good Builder, 1 Sep 2026](https://thegoodbuilder.com.au/a-draft-rewrite-of-nsw-bush-fire-planning-adds-a-1-5-metre-firebreak-around-buildings-consultation-closes-thursday/)) | Only if the lot is bushfire prone. Asset protection zones, BAL from vegetation, effective slope and distance (method in PBP Appendix 1 and AS 3959), and **property access rules for fire trucks**, which matter for the driveway checker (see the swept path section). | PDF only. The bushfire prone land map is open data (layer below). | |

### Building law

| Source | Official URL | Version checked | What it covers | Checkable by the app? |
| --- | --- | --- | --- | --- |
| Home Building Act 1989 | [act-1989-147](https://legislation.nsw.gov.au/view/html/inforce/current/act-1989-147); Home Building Regulation 2014 [sl-2014-0811](https://legislation.nsw.gov.au/view/html/inforce/current/sl-2014-0811) | Not opened. Rules below from NSW Government pages modified 11 Sep 2025 (**read**) | Licensing, contracts, home building compensation (HBC) insurance, statutory warranties, owner-builder permits. | Process only. Useful as a checklist, not a geometry check. |
| Design and Building Practitioners Act 2020 | [act-2020-007](https://legislation.nsw.gov.au/view/html/inforce/current/act-2020-007); Regulation [sl-2021-0152](https://legislation.nsw.gov.au/view/html/inforce/current/sl-2021-0152) | Not opened | Registered designers and builders and declared designs for "regulated buildings" (Class 2, and since July 2023 Class 3 and 9c, per [NSW building classes and roles](https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/professionals-working-on-regulated-buildings/building-classes-and-roles), **unverified** in this pass). Class 1 houses are not regulated buildings, but the Part 4 statutory duty of care covers construction work on any building, houses included (**unverified**). To be repealed when the 2026 Act commences. | No. |
| Building and Development Certifiers Act 2018 | [act-2018-063](https://legislation.nsw.gov.au/view/html/inforce/current/act-2018-063) | Not opened | Certifier registration and conduct. To be repealed when the 2026 Act commences. | No. |
| Building (Approvals and Practitioners) Act 2026 | [Bill page](https://www.parliament.nsw.gov.au/bills/Pages/bill-details.aspx?pk=18895); [first print](https://www.parliament.nsw.gov.au/bill/files/18895/First%20Print.pdf) | Passed both Houses 4 Aug 2026; assent 14 Aug 2026 (one source); Act number not found; commences by proclamation, no date set; regulations not released (**secondary**: [MinterEllison](https://www.minterellison.com/articles/nsw-parliament-passed-building-approvals-and-practitioners-bill-2026), [Hall & Wilcox](https://hallandwilcox.com.au/news/nsw-construction-reforms-what-the-new-building-act-means-for-developers-and-building-practitioners/), [Swaab](https://www.swaab.com.au/publication/nsw-building-approvals-and-practitioners-bill-2026-passes-parliament), [The Good Builder](https://thegoodbuilder.com.au/nsw-has-passed-its-new-building-act-construction-certificates-are-on-the-way-out/)) | Repeals the DBP Act 2020, the Building and Development Certifiers Act 2018 and the EP&A (Development Certification and Fire Safety) Regulation 2021, and rewrites EP&A Act Part 6. For a house: the construction certificate becomes a **building approval** and the occupation certificate a **completion approval**, issued by an "approval authority"; staged approvals allowed; the statutory duty of care is re-enacted (Part 8) for designers, builders, supervisors and manufacturers; 10-year limit on defect claims. | No dimensional rules; it requires BCA (NCC) compliance by reference. Affects wording in the app (for example "building approval" instead of "CC") once it commences. |

Home Building Act points for an owner-builder (**read**, [Working as an owner-builder](https://www.nsw.gov.au/housing-and-construction/building-or-renovating-a-home/owner-builder/working) and [When a permit is needed](https://www.nsw.gov.au/housing-and-construction/building-or-renovating-a-home/owner-builder/when-a-permit-needed), both modified 11 Sep 2025; [SIRA insurance obligations](https://www.sira.nsw.gov.au/resources-library/home-building-compensation-resources/publications/insurance-obligations-for-residential-building-works)):

- An owner-builder permit is needed for work over $10,000 (market cost including GST) on a single dwelling that needs a DA or CDC. For work over $20,000 the owner must complete set units of competency (the two pages differ on whether exactly $20,000 counts). One permit per 5 years. Licensed trades are still needed for electrical, plumbing, gas and air conditioning work.
- Selling within 7 years 6 months of the permit means the sale contract must carry the owner-builder consumer warning.
- The owner-builder can't buy HBC insurance for their own work. Each licensed contractor engaged directly must insure if the contract is over $20,000.
- Statutory warranties: 6 years for major defects and 2 years for other defects, from completion. These pass to the next owner.

### National Construction Code and Australian Standards

| Source | URL | Status on 8 Nov 2026 | Checkable rules for a house | Access |
| --- | --- | --- | --- | --- |
| NCC 2022 Volume Two and the ABCB Housing Provisions Standard | [NCC online](https://ncc.abcb.gov.au/); [NCC 2022 Vol Two copyright notice](https://cpd.nccb.gov.au/editions/ncc-2022/adopted/volume-two/preface/copyright-and-licence-notice) | **In force in NSW** until NCC 2025 is adopted (**secondary**, [MBA NSW](https://www.mbansw.asn.au/media/industry-news/residential-rules-frozen-until-mid-2029-builders-get-35-years-certainty)) | Stair risers and goings, balustrades where a fall exceeds 1 m, ceiling heights, light and ventilation as a share of floor area, 7-star energy (in NSW, delivered through BASIX), footings and site classification, earthworks and drainage near footings, bushfire construction via AS 3959. The specific numbers were **not read** in this pass. The app already limits stair risers to 190 mm and checks 2R + G of 550 to 700 mm, which match the Housing Provisions **(unverified)**. | Free online with an account (**unverified**). The NCC site appears to have moved to nccb.gov.au. Copyright terms: see licences. A data.gov.au listing for [NCC 2022](https://data.gov.au/data/dataset/national-construction-code-ncc-2022) exists. |
| NCC 2025 | [NSW media release](https://www.nsw.gov.au/ministerial-releases/nsw-to-adopt-new-national-construction-code-may-2027); [HIA](https://hia.com.au/our-industry/newsroom/building-and-renovation/2026/03/nsw-government-delays-adoption-of-ncc-2025-until-1-may-2027) | Published 1 May 2026; **NSW adopts it on 1 May 2027** with a 12-month transition and NSW variations (**read**, release of 25 Mar 2026). Building ministers agreed no further residential changes except essential safety until mid-2029. | Volume Two changes include condensation (vented cavities, vapour-permeable wraps, roof ventilation) and waterproofing (**secondary**, [MBA NSW May 2026](https://www.mbansw.asn.au/media/industry-news/building-regulation-update-may-2026)). | As above. |
| Australian Standards called up for houses | Standards Australia store | Paid | AS 2870 residential slabs and footings, AS 3600 concrete, AS 1684 timber framing, AS 4678 earth-retaining structures, AS 3959 bushfire construction, AS 3740 waterproofing, AS 1926.1 pool barriers, AS/NZS 2890.1 off-street car parking. | **Paid.** The Commonwealth has committed to removing the paywall on NCC-referenced standards, but how and when is not settled (**secondary**, MBA NSW May 2026). Don't copy their text or tables into the repo. |

### Local planning

The Wollongong rules are in [councils/wollongong.md](councils/wollongong.md). For any council, these are the sources:

| Source | What to collect | Notes |
| --- | --- | --- |
| The council's LEP | Zone, height of buildings, FSR, minimum lot size, heritage, local clauses on earthworks, flood, landslide and acid sulfate soils. | Map values come from the ePlanning layers below. Clause text from the NSW legislation export. |
| The council's DCP | Front, side and rear setbacks for DAs, site coverage, landscaped and deep soil area, private open space, solar access to neighbours, privacy, cut and fill limits, retaining wall heights and boundary setbacks, **driveway grades, widths, crossover profiles, garage widths and parking**. | DCPs aren't on legislation.nsw.gov.au and rarely have structured data. They're PDFs or web pages on the council's site, plus the council's engineering standard drawings for vehicle crossings (for example [Bellingen RD003 standard driveway profile](https://www.bellingen.nsw.gov.au/files/sharedassets/public/v/1/files/planning/engineering-standards/rd003_standard_driveway_profile.pdf), [Willoughby vehicle crossing guidelines](https://www.willoughby.nsw.gov.au/files/sharedassets/public/ecm/willoughby-council-website/forms-forms-and-form-related-documents-including-terms-of-reference-and-guidelines/forms-forms-and-form-related-documents-including-terms-of-reference-and-guidelines/1-vehicle_crossing_guidelines.docx.pdf)). |
| Section 10.7 planning certificate | Which EPIs apply, zone, hazards, bushfire, flood, contamination, whether complying development can be carried out on the land. | Ordered from council for a fee. The Planning Portal has a transactional Section 10.7 API for councils, not the public. |

## Housing Code numbers (Codes SEPP Part 3)

This is the rule set most worth encoding first: it's state-wide, numeric and pass or fail. Two kinds of source were used, and they don't carry the same weight:

- **Official consolidation "as at 29 August 2025"**, an RTF export from the NSW legislation site obtained on 8 Nov 2026. The clause text is complete but the export drops the tables, so the tables in cl 3.9, 3.10, 3.13 and 3.16 still come from the 2024 copy below. Marked **read (Aug 2025)**.
- **AustLII consolidation "as at 5 July 2024"** ([index](https://www5.austlii.edu.au/au/legis/nsw/consol_reg/seppacdc2008721/)). This is the legal text, but two years old, so amendments since July 2024 are missing. Marked **read (Jul 2024)**.
- **Department information sheets dated January 2015**, which describe the earlier General Housing Code. The Housing Code was remade around 2017, so treat their numbers as a starting point only. Marked **secondary (2015)**.

Still to summarise from the August 2025 text: 3.12 and 3.15 (privacy, balconies and decks) and 3.14 (building design and articulation). Still to confirm from a newer source: the tables in 3.9, 3.10, 3.13 and 3.16. The department's fact sheet on the "essential Codes SEPP updates" made after the July 2024 copy (October 2024, **read**) lists the Housing Code changes as drainage in certain easements, deck rules for lots up to 300 m², pool pump noise, alterations in heritage conservation areas, lanes not being primary roads, and pier depth. It mentions no change to the floor area, setback, landscaping or parking tables, so the July 2024 tables are probably still current (**secondary**). The 2015 sheets disagree with the 2024 text wherever both were read (for example landscaping over 1,500 m² is 35% in the sheet and 45% in cl 3.13, and floor area on a 600 to 740 m² lot is 380 m² in the sheet and 335 m² in cl 3.9), so don't trust the sheets for anything else.

### Definitions that drive the geometry (cl 1.5, read Jul 2024)

- **Building line**: the external wall of the house (not ancillary, attached or detached development) closest to the primary road boundary. **Setback** is the horizontal distance from the boundary to the building line.
- **Primary road**: the road the front of the dwelling faces. **Corner lot**: two road boundaries meeting at 135° or less.
- **Gross floor area**: measured to the internal face of external walls at 1.4 m above the floor; excludes one car space per dwelling (up to 18 m²), basement storage and services, terraces and balconies with outer walls under 1.4 m, voids, stairwells and lift shafts.
- **Site coverage**: share of the site covered by buildings, excluding eaves, driveways, paths, pools and unenclosed decks and balconies (walls under 1.4 m).
- **Boundary wall**: a wall 150 mm or less from a side or rear boundary (the 2015 sheet says 450 mm; the current definition wins).
- **Principal private open space**: outdoor area directly reached from a habitable room other than a bedroom.
- **Privacy screen**: no opening over 30 mm wide and openings no more than 30% of its area, or fixed translucent glazing.
- **Ground level (existing)** is "the existing level of a site at any point" (Standard Instrument wording, **read** in the Wollongong LEP Dictionary, 2 Oct 2026 version). Height is measured from it, not from finished ground.

### Lot and height

| Rule | Value | Source |
| --- | --- | --- |
| Zones where the Housing Code applies | R1, R2, R3, R4, RU5 | read, [planning portal Housing Code](https://www.planningportal.nsw.gov.au/development-assessment/codes-sepp/housing-code) (updated 14 Sep 2022) |
| Minimum lot area, width at building line | 200 m², 6 m | read, planning portal |
| What the code covers | A new 1 or 2 storey dwelling house and attached development, alterations and additions, and detached development (cl 3.1(1)) | read (Aug 2025) |
| Battle-axe lots | "if the development is on a battle-axe lot—the lot must be at least 12m by 12m (not including the access laneway) and must have an access laneway that is at least 3m wide" (cl 3.1(3)(f)): a test of the lot's shape, not a building envelope. The laneway is left out of the lot area for floor area (cl 3.9(2)). A battle-axe lot "has 3 side boundaries and a rear boundary", the rear being opposite the boundary the house faces (cl 3.3(2)). | read (Aug 2025) |
| Not complying development | A building over a **registered easement** (cl 3.2(1)(d)), except gutters, eaves, downpipes or underground drainage over a maintenance easement that allows them (3.2(2)); land identified as susceptible to **landslide risk** in an environmental planning instrument (3.2(1)(h)); a roof terrace; a common wall; a basement over the area limits. | read (Aug 2025) |
| Maximum building height | 8.5 m above ground level (existing) for the house and attached development (cl 3.8); 4.5 m for detached development (cl 3.18) | read (Aug 2025) |
| Storeys | No more than 2 storeys at any point, counted on a vertical line; stepped forms on slopes are fine unless three storeys overlap | secondary (2015) |
| Basement | "Any basement (including a garage) is to be counted as a storey" (cl 3.1(2)); area limits in a table in cl 3.2(1)(e) (25 m² on lots up to 10 m wide, 45 m² on wider lots per the 2015 sheet) | read (Aug 2025); limits secondary (2015) |

### Floor area, site coverage and landscaping

Landscaped area (cl 3.13, **read Jul 2024**):

| Lot area | Minimum landscaped area |
| --- | --- |
| 200 to 300 m² | 10% |
| over 300 to 450 m² | 15% |
| over 450 to 600 m² | 20% |
| over 600 to 900 m² | 30% |
| over 900 to 1,500 m² | 40% |
| over 1,500 m² | 45% |

- Each landscaped strip is at least 1.5 m wide and long. At least 50% of the required area is behind the building line. Forward of the building line, 25% must be landscaped if the lot is 18 m wide or less at the building line, 50% if wider.
- For example, on a 650 m² lot (handle left out), 30% is **195 m²**.
- Principal private open space: 16 m² on lots 6 to 10 m wide, 24 m² on lots over 10 m; at least 3 m × 3 m and no steeper than 1 in 50.

Maximum gross floor area of all buildings on the lot (cl 3.9, **read Jul 2024**; battle-axe handles are left out of the lot area):

| Lot area | Maximum GFA |
| --- | --- |
| 200 to 250 m² | 78% of lot area |
| over 250 to 300 m² | 75% of lot area |
| over 300 to 350 m² | 235 m² |
| over 350 to 450 m² | 25% of lot area + 150 m² |
| over 450 to 560 m² | 290 m² |
| over 560 to 600 m² | 25% of lot area + 150 m² |
| over 600 to 740 m² | 335 m² |
| over 740 to 900 m² | 25% of lot area + 150 m² |
| over 900 to 920 m² | 380 m² |
| over 920 to 1,000 m² | 25% of lot area + 150 m² |
| over 1,000 m² | 400 m² |

The jump from 262.5 m² to 290 m² at 450 m² looks odd and the table came through a fetch tool, so check the official text before encoding it. For a lot of 600 to 740 m² the limit is **335 m²**. Clause 3.9 has no site coverage standard; the 2015 sheet's coverage table (50% on a lot of that size) belongs to the older code, though a DCP may still set one for DAs.

### Setbacks

Clause 3.10, **read Jul 2024**, unless marked. Side and rear setbacks apply to the house, garages and carports, decks, patios, pergolas, terraces and verandahs, and sheds.

**Primary road**: at least the average setback of the two nearest dwelling houses on the same side of the road (battle-axe dwellings and articulation zone elements don't count). If there aren't two within 40 m:

| Lot area | Minimum primary road setback |
| --- | --- |
| 200 to 300 m² | 3 m |
| over 300 to 900 m² | 4.5 m |
| over 900 to 1,500 m² | 6.5 m |
| over 1,500 m² | 10 m |

**Side**, by lot width at the building line, where H is the building height at that point:

| Lot width | Height | Minimum side setback |
| --- | --- | --- |
| 6 to 10 m | up to 5.5 m | 0.9 m |
| 6 to 10 m | over 5.5 to 8.5 m | 0.9 m + (H − 5.5) / 4 |
| over 10 to 18 m | up to 4.5 m | 0.9 m |
| over 10 to 18 m | over 4.5 to 8.5 m | 0.9 m + (H − 4.5) / 4 |
| over 18 to 24 m | up to 4.5 m | 1.5 m |
| over 18 to 24 m | over 4.5 to 8.5 m | 1.5 m + (H − 4.5) / 4 |
| over 24 m | up to 8.5 m | 2.5 m |

**Rear**, by lot area (not for lots with only three boundaries):

| Lot area | Up to 4.5 m high | Over 4.5 to 8.5 m high |
| --- | --- | --- |
| 200 to 300 m² | 3 m | 10 m, or the average rear setback of the two adjoining dwellings measured 4.5 m above existing ground, whichever is less |
| over 300 to 900 m² | 3 m | 8 m |
| over 900 to 1,500 m² | 5 m | 12 m |
| over 1,500 m² | 10 m | 15 m |

| Other setback rules | Value | Source |
| --- | --- | --- |
| Secondary road (corner lots) | 2 m (200 to 600 m²), 3 m (over 600 to 1,500 m²), 5 m (over 1,500 m²) | read Jul 2024 |
| Parallel road, public reserve | 3 m each | read Jul 2024 |
| Classified road | The setback in another applicable EPI, or 9 m | read Jul 2024 |
| Battle-axe lot | At least 3 m from the rear boundary of the lot in front | read Jul 2024 |
| Walls within 900 mm of a side boundary | Up to 3.3 m above existing ground (higher only to match an adjoining wall, max 8.5 m). Length up to 20 m or half the lot depth on 6 to 10 m lots, 10 m on lots over 10 to 12.5 m. Building to one or both side boundaries is allowed on narrow lots under conditions (masonry, no openings within 900 mm). | read Jul 2024 |
| Articulation zone | Entries, porches, balconies and similar can sit 1.5 m into the primary road setback, covering at most 25% of the zone (the 2026 EIE proposes 50% of the building width) | secondary (2015) |
| Exceptions (cl 3.11) | Side and rear setbacks don't apply to downpipes, driveways, meters, gutters, paving, ramps and fences; eaves, flues and awnings may encroach if 450 mm or more from the boundary; road setbacks ignore eaves within 1 m of the dwelling | read Jul 2024 |

On a battle-axe lot of 300 to 900 m², that's 3 m from the rear boundary of the lot in front instead of a street setback (cl 3.10(15), re-read 8 Nov 2026), 3 m to the rear up to 4.5 m high and 8 m above, and a side setback that depends on which side is read as the lot width (1.5 m base for 18 to 24 m, 2.5 m over 24 m).

### Garages and parking (cl 3.16, read Jul 2024)

- One off-street space unless the lot is under 8 m wide at the building line.
- Garage, carport or space off a primary road: set back 5.5 m if the house is less than 4.5 m from the road, otherwise 1 m behind the building line.
- Maximum garage door opening facing a road: 3.2 m on lots 8 to 12 m wide, 6 m on lots over 12 m.
- **Parking must comply with AS/NZS 2890.1:2004** (cl 3.16(2)). This ties the swept path feature to the Housing Code: a CDC design has to show a car can get in and out.
- On a **battle-axe lot**, the space "must be constructed so that vehicles can leave the lot in a forward direction" (cl 3.16(3), read Aug 2025). So a battle-axe lot needs a turning area, which is exactly what the swept path check tests.

### Earthworks, retaining walls and structural support (cl 3.30, read Jul 2024)

| Rule | Value |
| --- | --- |
| Max excavation below existing ground | 1 m within 1 m of a boundary; 2 m from 1 m to 1.5 m; 3 m beyond 1.5 m. Limited to 1 m on class 3 or 4 acid sulfate soils or within 40 m of a natural waterbody. Piers in a pier and beam footing can go deeper if a professional engineer certifies the depth (cl 3.30(1A)). Re-read Aug 2025. |
| Max fill above existing ground | 1 m for a dwelling house (600 mm for other purposes). No limit inside the building footprint or behind a drop edge beam. |
| Fill outside the footprint | Fill more than 150 mm above existing ground can cover at most 50% of the landscaped area. |
| Height measurement | Finished ground on fill can't be used to measure building height. |
| Retaining walls and supports | Over 600 mm high needs a professional engineer's certificate; total height can't exceed the cut or fill it supports; walls at least 2 m apart; embankment toe or top more than 1 m from side and rear boundaries. |

The 2015 sheet adds that fill must be held by a retaining wall within 1.5 m of the house or a batter within 3 m whose toe is more than 1 m from a side or rear boundary (**secondary (2015)**, check against cl 3.30). Exempt earthworks (no approval) are limited to 600 mm and kept 1 m from boundaries ([planning portal earthworks page](https://www.planningportal.nsw.gov.au/development-and-assessment/planning-approval-pathways/complying-development/earthworks-and-structural-supports), updated 30 Apr 2025, which points to Schedule 9 of the SEPP for the detail).

### Trees (cl 3.33, read Aug 2025)

- **Removal under a CDC** (3.33(1)): the certificate covers removing or pruning a tree on the lot only if it isn't on council's significant tree register, is within 3 m of a building over 25 m², and is **less than 8 m tall** for a new dwelling house (6 m in other cases) and not required to be kept by a consent. Anything else needs council's own approval.
- **Setback from protected trees** (3.33(2)): "Development under this code must be at least 3m from each protected tree on the lot and an adjoining lot (measured from the base of the trunk of the tree)."
- **Exceptions** (3.33(3)): access ramps, driveways, paths and paving, awnings, and pool fences can be within 3 m if they don't excavate or fill more than 150 mm.

"Protected tree" isn't defined in the parts read; it reads as a tree that would need a council permit or consent (in Wollongong, a declared tree under DCP E17).

## Open data and APIs

### NSW legislation

- **Export**: per-title XML at `https://legislation.nsw.gov.au/view/html/inforce/current/<id>/xml`, and any point in time at `.../inforce/YYYY-MM-DD/<id>/xml`. Change queries at `/export/day` and `/export/week`, and custom queries at `/export/custom/"Field"=value` (fields include Type, Year, Number, Title, Repealed, LastUpdated, `PitValid=@PointInTime(YYYYMMDDhhmmss)`); add `?format=json` for JSON results. Schema is ExchangeXml.dtd version 3. The site asks for scripts to run outside NSW business hours. (**read**, [export help](https://legislation.nsw.gov.au/help/export), updated 18 Aug 2021.) No formal API beyond this; RSS alerts exist.
- **Use in the app**: the checker shouldn't parse legislation live. Encode each rule by hand as data (clause, version date, numbers) and use the export's `LastUpdated` to flag when a source rule changed since it was encoded. CORS from a browser is unknown, so do that check in CI or a script, not the app.

### NSW planning spatial data (ePlanning ArcGIS services)

All on `https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning/`. Capabilities "Map, Query, Data", query formats JSON, GeoJSON and PBF, max 2000 records, spatial reference GDA94 geographic (wkid 4283). Metadata reads without a token. Point queries and CORS headers were **not tested**. (**read**, service metadata.)

| Layer | Service | Layer id |
| --- | --- | --- |
| Local Environmental Plan (boundary, gives LEP name) | Planning_Portal_Principal_Planning | 8 |
| Land zoning | Planning_Portal_Principal_Planning | 19 |
| Height of buildings | Planning_Portal_Principal_Planning | 14 |
| Floor space ratio | Planning_Portal_Principal_Planning | 11 |
| Minimum lot size | Planning_Portal_Principal_Planning | 22 |
| Heritage (EPI) | Planning_Portal_Principal_Planning | 16 |
| Bushfire prone land | Planning_Portal_Hazard | 229 |
| Flood planning | Planning_Portal_Hazard | 230 |
| Landslide risk land | Planning_Portal_Hazard | 232 |
| Acid sulfate soils | Planning_Portal_Protection | 234 |
| Terrestrial biodiversity | Planning_Portal_Protection | 243 |
| Scenic protection, salinity, groundwater, drinking water catchment, airport noise | Planning_Portal_Protection | 242, 241, 237, 236, 235 |

A query would look like `.../Planning_Portal_Principal_Planning/MapServer/14/query?geometry=<lon>,<lat>&geometryType=esriGeometryPoint&inSR=4283&spatialRel=esriSpatialRelIntersects&outFields=*&f=json` (**unverified**, standard ArcGIS REST form). Other services in the folder (Development_Control, SEPP, Planning_Portal_Local_Provisions) weren't opened.

### Cadastre (NSW Spatial Services)

`https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer`, lot layer id **9**. Fields include `lotnumber`, `sectionnumber`, `plannumber`, `planlabel` (display field, for example "DP12345"), `lotidstring` and `planlotarea`. Web Mercator (wkid 3857), max 1000 records, JSON and GeoJSON. The exact `lotidstring` format wasn't tested. (**read**, service metadata.) This is the way to georeference the survey: find the lot by Lot/DP, then fit the survey's boundary to the cadastre polygon.

### Planning Portal APIs

[planningportal.nsw.gov.au/API](https://www.planningportal.nsw.gov.au/API) lists only transactional APIs (Online DA, CDC, certificates, referrals, Section 10.7, Section 68 and others). They need a subscription key issued by the department and are meant for councils, certifiers and software vendors. None returns zoning or controls for a property, and a key can't go in a static site. (**read**, including the [25 Sep 2026 release notes](https://www.planningportal.nsw.gov.au/sites/default/files/documents/2026/NSW%20Planning%20Portal%20-%20API%20release%20notes_25%20September%202026.pdf).) The [Spatial Viewer](https://www.planningportal.nsw.gov.au/spatialviewer) is the human-facing version of the layers above, and its undocumented backend (address search and a per-property controls lookup that returns zone, height, FSR and the LGA) does work without a key; see [map-placement.md](map-placement.md).

### Elevation

[ELVIS](https://elevation.fsdf.org.au/) gives LiDAR and DEMs for NSW. Licence terms weren't confirmed. Useful later to fill terrain outside the survey (neighbouring ground for overshadowing, the street for the driveway crossover).

## Licences and copying limits

The repo is public and has no LICENSE file yet. The safe pattern for all of these is to encode the values the checker needs with a citation (clause and version date) and link out for the text, rather than copying text or tables in.

| Source | Licence found | Notes |
| --- | --- | --- |
| NSW legislation | Creative Commons Attribution 4.0, per the export help page's note on the XML DTD (**read**) | The [copyright page](https://legislation.nsw.gov.au/copyright) wasn't read, so confirm the attribution wording there. |
| NCC 2022 | CC BY 4.0 since Amendment 1, per the [ABCB copyright FAQ](https://www.nccb.gov.au/faq/copyright) (**read**). Suggested attribution: "The National Construction Code 2022 was provided by the Australian Building Codes Board under the CC BY licence." | The edition's own [copyright notice](https://cpd.nccb.gov.au/editions/ncc-2022/adopted/volume-two/preface/copyright-and-licence-notice) still says CC BY-ND 4.0 (no derivatives), so confirm before restructuring NCC text. Logos excluded. NCC 2022 Volumes One to Three are published as **XML** on [data.gov.au](https://data.gov.au/data/dataset/national-construction-code-ncc-2022) under CC BY 4.0 (file names not captured). Only NCC 2022 is in that format so far. |
| ePlanning spatial layers | Not confirmed | The zoning layer asks users to contact the department's data broker for shapefiles. Data.NSW (likely CC BY 4.0) refused automated access, so check a dataset page by hand. |
| NSW cadastre | Service shows "© Department of Finance, Services & Innovation 2018" | The Spatial Services copyright page redirects to the [NSW Government copyright statement](https://www.nsw.gov.au/nsw-government/about-website/copyright) (not read). |
| Planning for Bush Fire Protection 2019 | © State of NSW through the NSW RFS 2019; free for personal, in-house or non-commercial use; other uses need RFS permission (**read**) | Cite clause and table numbers only. |
| Australian Standards (AS/NZS 2890.1, AS 2870, AS 4678, AS 3959 and so on) | Paid, all rights reserved | Don't reproduce tables or templates. Values the app needs would come from a licensed copy, or from a council DCP that restates them. |
| Austroads guides | Free download with registration | Terms not checked. |

## Swept path analysis

### Which standard applies

- **AS/NZS 2890.1:2004 (Parking facilities, Part 1: Off-street car parking, incl. Amendment 1) is still the current edition.** A revision with a larger B99 car and bigger spaces went to public comment in Australia (closed 9 Nov 2023) and New Zealand (DR AS/NZS 2890.1:2024, 8 Oct to 22 Nov 2024), but Standards Australia said on 24 March 2026 that the changes "will be reconsidered and will no longer move forward in their current format" (**read**, [Standards Australia news](https://www.standards.org.au/news/revised-standard-recommends-larger-parking-bays-across-the-country); [NZ consultation page](https://consultations.standards.govt.nz/draft-standards/as-nzs-2890-1-parking-facilities-off-street-car-pa)).
- The Housing Code (cl 3.16) names AS/NZS 2890.1:2004 directly, and council DCPs normally call it up for DAs. Councils' own engineering drawings set the footpath crossing and kerb profile.
- The 2004 text is paid ([Standards Australia store](https://store.standards.org.au/product/as-nzs-2890-1-2004)); a free [7-page preview](https://www.saiglobal.com/PDFTemp/Previews/OSH/as/as2000/2800/2890.1-2004(+A1).pdf) gives the contents (driveway rules are in section 2.6: 2.6.1 width, 2.6.2 gradients; design vehicles and templates are in the appendices). The free [2024 public comment draft](https://consultations.standards.govt.nz/draft-standards/as-nzs-2890-1-parking-facilities-off-street-car-pa/user_uploads/105480-asnzs-2890.1-working-draft.pdf) is useful for the method but its numbers aren't law.

### Design vehicles

AS/NZS 2890.1 uses two cars: **B85** (85th percentile, the default for most checks) and **B99** (99.8th percentile, used for ramps, ground clearance and tight turns).

| Value | B85 | B99 | Source |
| --- | --- | --- | --- |
| Overall length × width | 4.9 m × 1.9 m | larger than B85 (draft increases it) | draft 2024 Appendix A.3, secondary (model summary of the draft) |
| Front / rear overhang | 820 mm / 1,100 mm | not read | draft 2024 Table 2.6 note, read |
| Wheelbase | about 2.98 m (4.9 − 0.82 − 1.10) | not read | worked out from the two rows above |
| Turning circle | 11.5 m kerb to kerb at 40° max inner front wheel angle | not read | draft 2024 A.3, secondary |
| Wheel radius | 225 mm | | draft 2024, read |
| Commonly quoted 2004 values | 4.91 × 1.87 m, wheelbase 2.80 m | 5.20 × 1.94 m, wheelbase 3.05 m | **unverified**, from memory; check a licensed copy |

The 2004 foreword says the minimum vehicle ground clearance was raised from 100 mm to 120 mm (**read**, preview).

### Driveway and parking rules (domestic)

All from the 2024 draft via a model summary (**secondary**), and consistent with what councils commonly restate from the 2004 edition. Check them against the 2004 text or the council's DCP before encoding:

- Maximum grade of a domestic driveway **1 in 4 (25%)**. Grades steeper than 1 in 5 may need a high-friction surface.
- A change of grade needs a transition if it exceeds **1 in 8 (12.5%) at a summit** or **1 in 6.7 (15%) at a sag**. Transitions about 2.0 to 2.5 m long (up to an 18% change), 3 m beyond that.
- Across the footpath (council land) about **1 in 33**; the council's crossing drawing decides.
- Minimum domestic driveway width **3.0 m**.
- Residential (user class 1) 90° space **2.4 m × 5.6 m** in the draft (2.4 × 5.4 m is the figure usually quoted from 2004, **unverified**). Enclosed single garage about 3.0 m wide inside, door at least 2.5 m.
- Clearances in the draft's swept path appendix: 300 mm to obstructions over 150 mm high, 500 mm on the outside of curves, 300 mm on the inside. The draft limits manoeuvres into an enclosed space to three for B85 and five for B99.
- The **ground clearance template** (2004 Appendix C) checks that a B99 doesn't scrape at grade changes. [This explainer](https://vivek-rajagopal.pages.dev/blog/2019/Mar/vehicle-clearance) describes the template's six parameters (front overhang, wheelbase, rear overhang, clearance height, approach and departure angles) and notes the standard uses a knife-edge wheel.

If the lot is bushfire prone, PBP 2019 adds fire truck access rules (Table 7.4a for infill, Appendix 3 for turning heads, passing bays and widths). A model summary of the subdivision table gave a 4 m carriageway, 4 m vertical clearance, 6 m inner curve radius, crossfall up to 10° and grade up to 15° sealed; none of this was read verbatim and the infill rules may differ.

### How to compute it

These are standard vehicle kinematics, written up here as the method to implement rather than quoted from the standard:

1. **Bicycle model.** Track the centre of the rear axle (x, y) and heading θ. For a wheelbase L and front steer angle δ, moving a distance ds: dx = cos θ ds, dy = sin θ ds, dθ = (tan δ / L) ds. The tightest radius at the rear axle is R = L / tan δmax; the outer front corner, with width W and front overhang F, sweeps √((R + W/2)² + (L + F)²), which is what the kerb-to-kerb turning circle measures. Fit δmax so the model reproduces the standard's turning circle.
2. **Path following (the AutoTURN way).** The user draws the path of the front axle. The rear axle then "chases" it: it moves along the car's heading towards the front axle, which makes the rear wheels cut inside the curve (a tractrix when the front runs in a straight line; [Wikipedia: Tractrix](https://en.wikipedia.org/wiki/Tractrix)). Limit how fast steering can change (lock-to-lock time at a set speed), or the car will turn on the spot.
3. **Envelope.** Sweep the body outline (with overhangs and mirrors) and each wheel along the path and take the union. Grow obstacles (walls, retaining walls, fences, the boundary, a parked second car) by the clearance and test for overlap. Check that wheel paths stay on the driveway.
4. **Vertical check.** Run the car along the driveway's long section, taken from the app's finished ground, and check the gap under the front overhang, between the axles and under the rear overhang never drops below the clearance.
5. **Reversing and multi-point turns.** For "can the car get out of the garage and leave forwards", search over forward and reverse arcs. Reeds–Shepp curves (Reeds and Shepp, *Optimal paths for a car that goes both forwards and backwards*, Pacific Journal of Mathematics 145(2), 1990) give the shortest paths with a minimum turning radius, and Hybrid A* (Dolgov, Thrun, Montemerlo and Diebel, *Path planning for autonomous vehicles in unknown semi-structured environments*, IJRR 2010) handles obstacles. Both references are from memory, not checked in this pass.

### Existing tools

| Tool | Licence | Use to us |
| --- | --- | --- |
| AutoTURN (Transoft) | Commercial | The benchmark for behaviour and output. [Product page](https://www.transoftsolutions.com/au/landing/autoturn-the-industrys-leading-swept-path-analysis-software/). |
| Autodesk Vehicle Tracking | Commercial | Same. |
| [freecad.turns](https://github.com/joelgraff/freecad.turns) | LGPL-2.1, Python, alpha | Reference only; algorithm not documented. |
| [QuickTurn2](https://github.com/RFLTools/QuickTurn2) | No licence (all rights reserved), AutoLISP | Don't copy code. Its method (short straight steps, heading updated from the previous step, trailers follow the hitch) cites *Mathematical and Computer Modelling* 49(9–10), 2049–2060 (2009). |
| [Austroads AP-G34-13](https://austroads.gov.au/publications/road-design/ap-g34-13), Design Vehicles and Turning Path Templates | Free with registration; marked superseded (edition 3.0, 2013) | Larger vehicles (5.2 m passenger car, 8.8 m service vehicle, 12.5 m single unit truck). Only needed for a removalist truck or fire truck check. |

### What the driveway crossing check uses (Nov 2026)

The first two steps of the build order below are in the app: Earthworks › Driveway draws the long section from the garage floor to the gutter, and Design › Checks lists five driveway rows (`src/checks/crossing.ts`, geometry in `src/plan/crossing.ts`). Council numbers come first, from the council tables in `src/checks/councils/` (Wollongong's drawings 7000-C30, C31 and C33; Blue Mountains DCP E2.3.3), and AS/NZS 2890.1 fills the rest. Nothing new was read for it: the network was closed to this session, so everything below is from the notes above, and what the app had to assume is said as such.

| What | Value the app uses | Mark |
| --- | --- | --- |
| Steepest grade on the property | 25%, or the council's (Wollongong C33, Blue Mountains E2.3.3 C4 "generally") | secondary (AS), read (councils) |
| Non-slip finish | Over 1 in 5 (20%) warns | secondary |
| Changes of grade | A transition over 12.5% at a summit or 15% at a sag (Blue Mountains: 12.5% either way); about 2 m long up to an 18% change, 3 m beyond (Wollongong and Blue Mountains: at least 2 m). Fails when the stretch either side is too short to hold them. | secondary (AS), read (councils) |
| Footpath crossing | Wollongong: 2.5% from the layback to the boundary (C30, C33), a warning outside it since C33 allows a 2 m curve to the boundary; Blue Mountains: up to 5% (C4, "generally"); otherwise about 1 in 33, within 50 mm of that level at the boundary. Falling into the lot fails. | read (councils), secondary (AS) |
| Layback | Wollongong C30: a 450 mm kerb break (taken as level, its rise isn't on the drawing) then 1.52 m at 1 in 8. Used as the typical layback for councils without a drawing in the app. | read (Wollongong), **assumed** elsewhere |
| Footpath width | 3.5 m (the footpath on Wollongong's C30) until the person types theirs | **assumed** |
| Kerb level | Typed; else the survey's level at the boundary, down the standard crossing; else the state's 5 m elevation model at the kerb point (±0.9 m), read only when asked; else "Needs a fact" | |
| Ground clearance template | B99, 120 mm clearance (2004 foreword, read), wheelbase 3.05 m and length 5.20 m (unverified), overhangs 0.92 and 1.23 m (the remaining 2.15 m split in the B85's 0.82 : 1.10 proportion, worked out), knife-edge wheels. The template's approach and departure angles weren't read: the app takes 10° each, lower than most cars, so it errs towards a scrape. Run both ways round in 50 mm steps, from the garage floor (flat behind) to the road (rising 3% from the gutter, **assumed**). | unverified |
| Turning in | B85 4.9 × 1.9 m, overhang 0.82 m, wheelbase 2.98 m, 11.5 m turning circle (draft, secondary); the rear axle's full-lock radius follows from the turning circle (method above). It comes along the near side of the road 0.5 m off the kerb (**assumed**) and turns in at full lock; the inner rear wheel has to stay on the crossing at the kerb (Wollongong 5.6 m, else the drive's width plus Wollongong's 1.3 m splays, **assumed**) and the drive at the boundary. Garage door at least 2.5 m (secondary), and narrower than the car plus 300 mm fails. Never a pass: a full swept path, bends, reversing out and obstacles aren't checked, so the best it says is "Check with the designer". | secondary |

Still wanted from a licensed copy of AS/NZS 2890.1:2004 (or a council that restates it): the B99's overhangs and the template's approach and departure angles, the first-metres-inside-the-boundary grade for domestic driveways if there is one, and the B85's 2004 turning figures. And each council's crossing drawing, for its layback, footpath fall and crossing widths.

### A possible build order

1. Static checks with what the app already has: driveway grade (already flagged at over 25%), width, grade changes along the centreline, garage door width against cl 3.16, space size.
2. The vertical scrape check on the driveway long section.
3. Swept path along a drawn path for B85 and B99, shown as an envelope in plan and 3D, with clearance breaches marked.
4. Automatic "in and out forwards" search with Reeds–Shepp or Hybrid A*.

## What the app can already check, and what it's missing

Mapped against the plan model in `src/plan/model.ts` and the existing calculations (`boundaryClearances` in `src/plan/placement.ts`, `steepestGrade` in `src/lib/drape.ts`, cut and fill in `src/lib/earthworks.ts`, retaining walls in `src/plan/retaining.ts`).

| Rule | Source | The app has | Missing |
| --- | --- | --- | --- |
| Building height 8.5 m (or LEP height map) | Housing Code; LEP cl 4.3 | Roof top RL and height above natural ground; the survey terrain | Confirm the height is measured vertically at each point of the roof down to **existing** ground, as the definition requires; the LEP map value. |
| Storeys (2 at any point) | Housing Code | Levels with elevations and heights | Count overlapping levels on vertical lines; treat a mostly-below-ground lowest level as a basement. |
| Floor area (GFA) and FSR | Housing Code cl 3.9; LEP cl 4.4 | Room areas measured on inside faces; floor area to outside of walls | A room type so a garage can be excluded (one car space up to 18 m²); which lot area counts (a battle-axe lot's DXF boundary may leave out the handle that the title includes). |
| Site coverage | DCP (the current Housing Code has none) | Footprint and coverage on the PDF site plan | Exclusions per the definition (eaves, driveways, paths, open decks). |
| Landscaped area | Housing Code cl 3.13; DCP | Garden areas, slabs, driveways, decks | "Landscaped" as lot minus buildings minus paving, the 1.5 m minimum width, and the split forward of and behind the building line. |
| Principal private open space | Housing Code cl 3.13 | Areas, terrain grade | Which room opens onto it; the 3 m × 3 m and 1 in 50 tests. |
| Front, side and rear setbacks | Housing Code cl 3.10; DCP | Distance from the house to each boundary edge | Boundary roles (primary road, secondary road, side, rear), height-dependent side and rear setbacks (wall height above ground along each wall), eave encroachments, neighbours' setbacks. |
| Garage door width and garage setback | Housing Code cl 3.16 | Openings with widths on walls | Mark a room or opening as the garage; know the lot width at the building line. |
| Excavation and fill limits by distance to boundary | Housing Code cl 3.30 | Cut and fill depths on a 0.25 m grid, batters, retaining walls, warning when a batter meets a boundary | Test each cell's cut depth against its distance to the nearest boundary (1, 2, 3 m bands); fill over 1 m outside the footprint; the 50% fill-outside-footprint cap; retaining walls 2 m apart; toe or top of batter more than 1 m from side and rear boundaries; flag supports over 600 mm for an engineer. |
| Driveway grade | AS/NZS 2890.1; DCP | Steepest grade, the footpath crossing, changes of grade and transitions, the B99 ground clearance template and a full-lock B85 turn in (see above) | A full swept path; the template's real angles; bends in the drive; each council's crossing drawing. |
| Stairs | NCC Housing Provisions | Risers capped at 190 mm, 2R + G of 550 to 700 mm | Confirm the NCC figures and add goings, handrails and landings. |
| Balustrades | NCC Housing Provisions | Deck and slab tops, terrain | Flag edges where the fall to the ground is over 1 m. |
| Privacy | Housing Code cl 3.12; DCP | Windows with sill heights on walls; floor levels; boundary distances | Floor level above ground at each window and its distance to the side or rear boundary. |
| Sun to neighbours | Wollongong DCP B1 4.7 (3 hours, 9 am to 3 pm, 21 June) | The 3D model, terrain and north | The block's latitude (from map placement), and where the neighbours' living windows and open space are (an input, or a conservative assumption at the boundary). |
| Batter slope | Wollongong DCP E19 4.3 (no steeper than 1 in 4) | Batter slope setting, default 1 in 2 | A council preset or a warning when the batter is steeper than the council allows. |
| Easements and trees | The title's easement terms; Wollongong DCP E17; AS 4970 (2009 cited by council, superseded by AS 4970-2025) | Nothing yet (the DXF has the boundary only) | Easement outlines as no-build or restricted areas, tree positions with their protection zones, and a warning when the house, a wall, a batter or the driveway enters one. |
| BASIX | Sustainable Buildings SEPP | Window sizes and wall orientations; north | Only an estimate is possible (glazing by orientation). The certificate needs the BASIX tool. |
| Zone, hazards, LEP maps | LEP maps; ePlanning layers | Nothing yet | Georeference the survey, then query the layers. |

## Gaps and next steps

1. **Wollongong.** The rules are in [councils/wollongong.md](councils/wollongong.md), with the current LEP, Chapters B1, E3, E12, E17 and E19 read. Its own gaps list covers the lot's map values and overlays, the crossing drawings and the title documents.
2. **Housing Code tables**: the August 2025 text is read but its export dropped the tables, so check the tables in cl 3.9, 3.10, 3.13 and 3.16 against a copy newer than July 2024 (a PDF from legislation.nsw.gov.au would do). Summarise cl 3.12, 3.14 and 3.15. Check whether the 2026 complying development variations were made.
3. **AS/NZS 2890.1:2004** design vehicle dimensions, turning circles, the driveway grade clauses and the ground clearance template need a licensed copy, or a council document that restates them.
4. **Georeferencing** the survey to MGA unlocks every spatial lookup. The method and services are in [map-placement.md](map-placement.md).
5. **Bushfire**, only if the lot is mapped: PBP 2019 chapter 7 and appendices 1 and 3, and the outcome of the draft PBP 2026.
6. **Licences**: confirm the NSW legislation attribution, the NCC CC BY versus CC BY-ND question, and the ePlanning layer licence before shipping any encoded data.
7. **How to encode rules**: one data file per source (clause, version date, values, a link), tests that load the real survey, and a CI job that uses the legislation export's `LastUpdated` to flag when a source changed.
