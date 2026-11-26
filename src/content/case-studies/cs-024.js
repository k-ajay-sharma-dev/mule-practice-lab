export default {
  id: 'cs-024',
  category: 'case-studies',
  title: 'Integrating Two Companies After an Acquisition',
  level: 'EXPERT',
  tags: ['m-and-a', 'integration-strategy', 'platform-consolidation', 'identity', 'governance'],
  estMinutes: 60,
  quiz: [
    {
      type: 'match',
      needsScenario: true,
      prompt: 'Match each phase to the work that belongs in it.',
      pairs: [
        ['Before close', 'Inventory, target architecture and master-data mapping design, with no production data exchange'],
        ['Day 1', 'GL/trial balance feed into group consolidation and identity federation'],
        ['First 6 months', 'B products on A’s B2B portal and orders routed to B’s ERP'],
        ['24-month end state', 'B’s ERP/CRM migrated to SAP/Salesforce and B’s iPaaS decommissioned'],
      ],
      explain: 'The sequence follows business priorities and legal limits: plan before close, deliver the Day 1 essentials, then cross-sell, then consolidate.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Why wrap B’s ERP and inventory with System APIs (b-products-sapi, b-orders-sapi) instead of connecting A’s processes to them directly?',
      options: [
        'When B moves to SAP, only the System API changes, not A’s processes',
        'System APIs make B’s ERP faster, so the portal can show live stock',
        'System APIs let A copy all of B’s data into SAP on Day 1',
        'System APIs let B’s iPaaS be switched off before the deal closes',
      ],
      answer: 0,
      explain: 'The System APIs act as an anti-corruption layer. They hide B’s internals from A-side consumers, so the 24-month ERP/CRM swap is invisible upstream. Direct coupling would force rework of every consumer when B’s systems are retired. A wrapper does not make the ERP faster, a Day 1 copy into SAP breaks the data restrictions, and nothing may change in production before close.',
    },
    {
      type: 'single',
      prompt: 'What may the integration team do before the deal closes?',
      options: [
        'Inventory and design work within the clean-team rules, with no live data',
        'A trial sync of B’s customer data into Salesforce, to test the mappings',
        'Building the VPN and the Day 1 finance feed, and running it on live data',
        'Nothing at all, because any work before close breaks the clean-team rules',
      ],
      answer: 0,
      explain: 'Planning, architecture and mapping design can be done within clean-team limits, which makes Day 1 possible. Syncing customer data or running a live feed exchanges production data before close and breaks the restrictions. Doing nothing wastes three months.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'What is the platform decision for B’s iPaaS?',
      options: [
        'Move to Anypoint over time, retiring or migrating B’s flows by value',
        'Migrate every B flow to Mule before Day 1, so there is one platform',
        'Keep both platforms for good, each serving its own company',
        'Move A’s 150 APIs onto B’s iPaaS, since B’s team knows it best',
      ],
      answer: 0,
      explain: 'One platform is the end state, reached gradually: B’s iPaaS runs alongside while its flows are retired, migrated or replaced by value. A big-bang migration endangers Day 1 and cross-sell priorities. Keeping two platforms doubles cost forever, and moving 150 APIs onto the smaller platform is far more work.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which actions address the people and governance side?',
      options: [
        'Bring B’s integration team into a joint C4E and train them on Mule',
        'Let B’s team own the B-side System APIs, using their system knowledge',
        'Apply A’s API Manager policies and security standards to all new cross-company APIs',
        'Keep a separate Exchange catalogue per company until B’s ERP is retired',
        'Replace B’s integration team with A’s Mule contractors after Day 1',
        'Let B build new cross-company APIs on its own iPaaS and standards, so the cross-sell is not slowed',
      ],
      answer: [0, 1, 2],
      explain: 'B’s team knows B’s systems intimately and is key to the migration, so bring them into a joint C4E and let them own the B-side System APIs. A’s policies and security standards on every new cross-company API keep one level of protection. Separate catalogues for two years hide the B-side APIs from A’s teams, so they get built twice; one Exchange works from the start. Replacing B’s team risks losing exactly the knowledge you need. New APIs on B’s iPaaS create more to migrate later and leave the cross-company APIs without A’s governance.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Some B customers’ contracts require their data to stay with B’s legal entity. How do cross-sell orders work?',
      options: [
        'A’s orders Process API routes them to b-orders-sapi, so B’s ERP fulfils them',
        'A’s orders Process API books them in SAP, with A as the legal seller',
        'B’s products are left off the portal for those customers until month 24',
        'A’s sales team forwards those orders to B’s order desk by email',
      ],
      answer: 0,
      explain: 'Routing to B’s systems keeps the data with B’s legal entity, so B remains the legal seller, while still delivering cross-sell. Legal sign-off is still needed per data flow. Booking in SAP moves the data to A and breaks the contracts. Leaving products off the portal or emailing orders gives up the 6-month goal.',
    },
  ],
  description: `
**Context.** A consumer-goods company (Company A) has acquired Company B. The deal closes in 3 months.
- **Company A:** 12,000 staff, mature Anypoint Platform practice with ~150 APIs, SAP ERP, Salesforce.
- **Company B:** 3,000 staff, uses a different iPaaS, Microsoft Dynamics, its own e-commerce stack and warehouse system.

**Business priorities**
- Day 1 (close): finance must see consolidated revenue; staff must email and find each other.
- Within 6 months: cross-sell: A's sales team sells B's products, and B's products appear on A's B2B portal.
- Within 24 months: B's ERP and CRM retired onto A's platforms; one integration platform.

**Constraints**
- Until close, data sharing is restricted (clean-team rules); keep legal rules generic.
- B's integration team (4 people) is worried about their jobs and knows B's systems intimately.
- Different identity providers, security standards and network setups.
- Some B customers have contracts that require their data to stay with B's legal entity for now.

**Your task.** Propose the integration strategy, including platform, organisation and governance decisions, across:
- Day 1
- the first 6 months
- the 24-month end state
`,
  answerTemplate: `## Guiding principles

## Day 1 (close)

## First 6 months: enabling cross-sell

## 24-month end state and migration path

## Platform, identity and network decisions

## People and governance

## Risks and how you measure progress
`,
  keyPoints: [
    'A phased plan tied to business outcomes: Day 1 essentials (financial consolidation, identity/collaboration), 6-month cross-sell, 24-month consolidation.',
    'Use the API-led layer as an anti-corruption layer: B systems are wrapped by System APIs so A-side processes do not depend on B internals, and later ERP/CRM swaps are hidden from consumers.',
    'Pre-close work only uses non-sensitive design and planning; data flows start after close and respect legal-entity and contractual data restrictions.',
    'Explicit decision on the integration platform: consolidate onto Anypoint, but run B\'s iPaaS in coexistence and migrate its flows by value/retirement, not big bang.',
    'Identity and network: federate identity (trust between IdPs) and establish secure connectivity before deep integration; apply A\'s security policies to any API exposed across companies.',
    'People: retain and upskill B\'s integration team, bring them into a joint C4E; track progress with business-linked KPIs.',
  ],
  solution: `
**Principles.** Business outcomes drive sequence; wrap, don't rewrite, early; one platform eventually, coexistence in between; respect legal and contractual data boundaries; keep B's people.

**Before close (3 months).** Application and integration inventory for B (with clean-team limits), target-state architecture, network/identity design, master-data mapping for chart of accounts, products and customers. No production data is exchanged.

**Day 1.**
- **Finance**: B's ERP exports trial balance/GL data mapped to A's group chart of accounts (batch file or API into A's consolidation tool). Simple, robust, reconciled.
- **Collaboration/identity**: directory sync or federation between IdPs so people can find each other and access a few shared tools.
- Secure network connectivity between the companies (VPN/peering) with tight firewalling.

**First 6 months: cross-sell.**
- \`b-products-sapi\` and \`b-inventory-sapi\` (over B's ERP/WMS, possibly calling B's existing iPaaS flows) feed A's \`products-papi\` so B's products appear on A's B2B portal.
- Orders for B's products: A's \`orders-papi\` routes them to \`b-orders-sapi\` → B's ERP for fulfilment (B remains the legal seller where contracts require).
- Customer master: cross-reference service linking A and B customer IDs; Salesforce gets B product data and opportunity visibility.
- Policies from A's API Manager applied to all new APIs; B's iPaaS untouched except where needed.

**24-month end state.**
- B's ERP and CRM migrate to SAP and Salesforce in waves (by business unit or legal entity). Because consumers use A's Process APIs, switching the System API implementation from B's ERP to SAP is invisible upstream.
- B's iPaaS flows inventoried: retire, migrate to Mule, or replace with A's existing APIs; decommission by month ~20 with buffer.

**People and governance.** Joint C4E; B's team trained on Mule and owns the B-side System APIs (their system knowledge is critical for migration). Shared standards, Exchange as the single catalogue, architecture review for cross-company integrations.

**Risks and KPIs.**
- Data quality in master-data mapping (dedicated data stewards).
- Key-person attrition from B (retention plans, involvement).
- Security gaps at the network boundary (A's standards from day one).
- Contractual data restrictions (legal sign-off per data flow).

KPIs: consolidated close on time, cross-sell revenue through the portal, number of B integrations retired/migrated, licence costs removed.
`,
  followUps: [
    { q: 'Why not migrate B straight onto SAP and Salesforce and skip the wrapping?', a: 'Because cross-sell value is needed in months, while ERP migration takes years. Wrapping B systems delivers value now and turns the later ERP swap into a System API implementation change that consumers do not notice.' },
    { q: 'How do you decide what happens to B\'s iPaaS flows?', a: 'Inventory with runtime data, then classify by value and fate of the connected systems: flows tied to systems being retired die with them; the rest are migrated in waves before the iPaaS licence ends.' },
    { q: 'What is your biggest risk?', a: 'Losing B\'s integration knowledge through attrition. Their system knowledge is needed for every migration, so retention, early involvement and clear future roles are as important as the technical plan.' },
    { q: 'How do you prioritise across so many demands?', a: 'Tie each integration to a business milestone (Day 1, cross-sell, consolidation) and its value; anything not linked to a milestone waits or is handled with a manual workaround.' },
  ],
}
