export default {
  id: 'cs-077',
  category: 'case-studies',
  title: 'Fashion Group Preparing Supply Chain Data Flows for EU Digital Product Passports',
  level: 'EXPERT',
  tags: ['retail', 'supply-chain', 'compliance', 'traceability', 'master-data', 'partners', 'governance', 'events'],
  estMinutes: 60,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Where should the passport data for each product be assembled?',
      options: [
        'In the PIM, with merchandisers typing supplier data into new fields',
        'In a dedicated service that combines all sources and records each value’s source',
        'In each sales channel, built from its own data when the QR code is scanned',
        'In SAP, as extra fields on the material master that buyers fill in',
      ],
      answer: 1,
      explain: 'Passport data comes from many owners and must be traceable to its source. A dedicated service with provenance per attribute keeps one record per product, rather than manual typing or copies in every channel.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which three are good ways to collect data from 1,100 tier-1 and tier-2 suppliers?',
      options: [
        'A supplier API for large suppliers whose systems can send the data',
        'A supplier portal with forms and file upload for smaller suppliers',
        'Feeds from traceability platforms suppliers already use, mapped to one model',
        'A shared mailbox where small suppliers send a template spreadsheet for the team to load',
        'Database accounts so large suppliers can write straight into a passport staging table',
      ],
      answer: [0, 1, 2],
      explain: 'Offer channels that fit each supplier, all mapped to one model and validated. Emailed spreadsheets do not scale or keep provenance, and direct database access bypasses validation and security.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A supplier corrects the cotton origin for a fabric used in 340 products that are already on sale. What should happen?',
      options: [
        'Apply the corrected origin only to passports of products launched from now on',
        'Publish the correction as an event and add a new version of each passport',
        'Update the origin in place on the 340 passports, with a change log entry for each',
        'Rebuild the 340 passports from scratch and replace the old records',
      ],
      answer: 1,
      explain: 'Passport data changes over time and the regulator expects history. Event-driven versioning updates every affected product and keeps the old version for audit. An in-place update with a log keeps a note of the change but not the passport as it was published, so nobody can show what a customer saw last month. Replacing records loses the history, and applying the fix only to new products leaves 340 wrong passports on sale.',
    },
    {
      type: 'match',
      prompt: 'Match each passport concern to its design response.',
      pairs: [
        ['Consumers scan a QR code on the label', 'Public read API with a persistent product identifier and caching'],
        ['Recyclers need fibre composition but not supplier names', 'Access levels per audience in the passport API'],
        ['Auditors ask who supplied a value and when', 'Provenance recorded on every attribute'],
        ['Data formats change as the rules are finalised', 'Versioned canonical model and mappings'],
      ],
      explain: 'The passport is public, multi-audience, auditable and subject to changing rules, so the API, access model, data model and versioning must each be designed for that.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of the programme.',
      items: [
        'Agree the passport data model and the owner of each attribute',
        'Map where each attribute lives today and the gaps by supplier and product line',
        'Build the passport service, the canonical model and the supplier channels',
        'Pilot one product line with its suppliers and a public QR code',
        'Roll out by product line, measuring data completeness per supplier',
      ],
      explain: 'Without an agreed model and owners there is nothing to map or build. A pilot proves the end-to-end flow before rolling out across 30,000 new products a year.',
    },
    {
      type: 'single',
      prompt: 'The sustainability director wants every passport to show live data from the supplier systems at scan time. What is the best answer?',
      options: [
        'Agree, and call each supplier’s system when a label is scanned',
        'Collect and validate data ahead of time, version it, and serve it from the service',
        'Agree, and fall back to the last stored value when a supplier system does not answer',
        'Refresh each passport from the supplier systems every night with a full reload',
      ],
      answer: 1,
      explain: 'Calling suppliers at scan time makes every scan depend on many systems with no SLA and skips validation; a fallback hides the outages but still shows unvalidated data whenever the supplier does answer. A nightly full reload avoids scan-time calls, but it overwrites without validation or versions, so a bad supplier feed reaches every passport by morning. Passports should be assembled, validated and versioned in advance.',
    },
  ],
  description: `
**Context.** A European fashion group (4 brands, 1,800 stores, online in 30 countries) launches about 30,000 new products a year. EU rules on sustainable products will require a Digital Product Passport (DPP) for textiles: a record per product, reached by a QR code on the label, with data such as:
- fibre composition and the origin of key materials
- factories for the main production steps
- chemicals and certifications
- care, repair and recycling instructions

Exact data fields are still being finalised; the group wants to be ready 18 months before the date applies.

**Where the data is today**
| Data | Where |
|---|---|
| Product, style, colour, size, care | Centric PLM and a Salsify PIM |
| Purchase orders and suppliers | SAP S/4HANA |
| Factories and materials | 1,100 tier-1 and tier-2 suppliers; about 15% use traceability platforms; many use spreadsheets |
| Certificates (organic, recycled content) | PDFs in a shared drive, renewed yearly |

**Expected use**
- Consumers scanning labels: up to 2 million scans a month, peaks after marketing campaigns.
- Recyclers and repairers: fibre and material data, no commercial detail.
- Market surveillance authorities and auditors: full data with history.

**Constraints**
- Suppliers are independent companies; many are small and in Asia.
- Some supplier data is commercially sensitive (factory names) and must be shown only to authorised audiences.
- A passport must remain available for the product's expected life (at least 10 years).
- The sustainability team is 9 people; integration has a team of 14.

**Your task.** Answer the design questions for the passport data flows.
`,
  answerTemplate: `## Passport data model and ownership

## Collecting data from suppliers

## The passport service: assembly, versioning, provenance

## Public and restricted access

## Changes, corrections and long-term availability

## Programme plan and governance
`,
  keyPoints: [
    'Agree a passport data model with an owner per attribute, and keep it versioned because the rules are still changing.',
    'Collect supplier data through an API, a portal and traceability platform feeds, all mapped to one canonical model and validated.',
    'A passport service assembles each product from PLM, PIM, SAP and supplier data, with provenance per attribute and versions over time.',
    'Serve passports through a public read API with access levels per audience and caching, never by calling suppliers at scan time.',
    'Corrections flow as events that produce new passport versions; governance covers data completeness per supplier and long-term retention.',
  ],
  solution: `
**Model and ownership.** A canonical passport per product (and per batch where needed): identity, composition, materials and origins, factories per step, certificates, care and end of life. Each attribute has an owner: product team, supplier, sustainability team or certification body. The model and mappings are versioned.

**Supplier channels.**
- \`exp-supplier-traceability-api\` for large suppliers.
- A supplier portal with forms and upload for small ones.
- Adapters for the main traceability platforms.

All go through \`prc-supplier-product-data\`, which validates, links data to SAP purchase orders and products, and records provenance (who, when, which document).

**Passport service.** \`prc-product-passport\` combines PLM and PIM product data, SAP purchase order links and supplier data. It publishes \`passport-updated\` when anything changes. Each change makes a new version; old versions stay.

**Access.** \`exp-product-passport-api\` resolves the QR code identifier. Public data is cached at the edge for scan peaks. Recyclers and authorities use client credentials with wider scopes. Factory names are shown only to authorised audiences.

**Long term.** Passports are stored in durable storage with a 10 year retention policy and a stable identifier that does not depend on a brand website.

**Governance.** A passport data council (sustainability, product, legal, integration). Completeness dashboards per supplier and product line. Supplier onboarding targets in buying contracts.
`,
  followUps: [
    { q: 'Why keep provenance on every attribute?', a: 'Auditors and authorities ask who supplied a value and when. Provenance also shows which supplier to contact when a value is wrong.' },
    { q: 'How do you deal with rules that are not final yet?', a: 'Version the canonical model and mappings, and keep extra fields optional until the rules settle. Pilot with one product line to learn early.' },
    { q: 'How do you protect commercially sensitive supplier data?', a: 'Give the passport API access levels per audience. Public scans see consumer data only, while authorities and auditors use credentials with wider scopes.' },
    { q: 'How do you get small suppliers to provide data?', a: 'Offer a simple portal with upload, set data requirements in buying contracts, and show each supplier its completeness score.' },
  ],
}
