export default {
  id: 'cs-061',
  category: 'case-studies',
  title: 'Supermarket Group Merging Two Supply Chains After Acquiring a Regional Chain',
  level: 'EXPERT',
  tags: ['retail', 'supply-chain', 'm-and-a', 'master-data', 'sap', 'oracle', 'migration', 'governance'],
  estMinutes: 60,
  quiz: [
    {
      type: 'single',
      prompt: 'On day one after completion, the acquired chain must keep trading while the group starts integrating. Which first integration step gives the most value with the least risk?',
      options: [
        'Migrate the acquired chain\'s stores onto the group SAP system in the first month so there is one system of record',
        'Build an item and supplier cross-reference (acquired IDs ↔ group IDs) and a consolidated sales and stock feed into the group data platform, leaving operational systems untouched',
        'Connect the acquired chain\'s Oracle database to the group Oracle merchandising database with DB links so reports can join across both',
        'Replace the acquired chain\'s ActiveMQ broker with the group\'s Anypoint MQ before any business flows change',
      ],
      answer: 1,
      explain: 'A cross-reference plus a read-only consolidated feed gives leadership one view of sales and stock and prepares every later step, without touching store operations. A one-month ERP migration is the classic high-risk move; DB links recreate the tight coupling the programme should remove.',
    },
    {
      type: 'order',
      prompt: 'Put the supply chain integration phases in a sensible order.',
      items: [
        'Day-one stabilisation: keep both estates running, secure the network and access, consolidated reporting feed',
        'Master data: item, supplier and site cross-reference with a single owner for each new record',
        'Buying: shared supplier ordering (POs and invoices) for common suppliers through group Process APIs',
        'Distribution: move acquired stores onto group DCs region by region, routing replenishment by cross-reference',
        'Store systems: migrate acquired stores to group POS and pricing in waves',
        'Decommission: retire the acquired ERP, WMS and broker once no flows depend on them',
      ],
      explain: 'Master data comes before any shared process, because buying and replenishment depend on knowing that two item codes are the same product. Distribution and store systems move in regional waves, and decommissioning only happens when the last dependent flow has moved.',
    },
    {
      type: 'single',
      prompt: 'Both chains buy from the same 300 national suppliers, each with its own EDI setup. What is the best approach for purchase orders during coexistence?',
      options: [
        'Ask every supplier to accept POs from both ERPs indefinitely',
        'Route POs from both ERPs through one purchase-order Process API that maps to the group supplier profile, so each supplier moves to the group trading relationship once, with a cut-over date per supplier',
        'Stop ordering from common suppliers through the acquired ERP from day one',
        'Let the acquired chain\'s buyers log into the group SAP system and re-key their orders',
      ],
      answer: 1,
      explain: 'A single Process API in front of supplier connectivity lets each supplier be cut over once while either ERP can still raise orders. Re-keying or an immediate stop disrupts trading; running two relationships forever doubles cost.',
    },
    {
      type: 'multi',
      prompt: 'Which controls reduce the risk of moving acquired stores to group distribution centres? (choose all that apply)',
      options: [
        'Move stores in regional waves, each with a rollback plan to the old DC',
        'Run replenishment for a pilot region in shadow mode and compare proposed orders with what the old system would have ordered',
        'Validate the item cross-reference for every item a wave\'s stores sell before the wave starts',
        'Switch all stores in one weekend to minimise the dual-running period',
        'Track availability, waste and store complaints per wave against agreed go/no-go thresholds',
      ],
      answer: [0, 1, 2, 4],
      explain: 'Waves, shadow runs, data validation and measured go/no-go criteria contain the impact of mistakes. A single big-bang weekend for food retail risks empty shelves and waste across the whole estate.',
    },
    {
      type: 'match',
      prompt: 'Match each acquired-chain asset to the most sensible decision during the programme.',
      pairs: [
        ['Acquired chain\'s Oracle-based ERP', 'Keep running behind System APIs until its stores move, then retire'],
        ['Acquired chain\'s ActiveMQ point-to-point queues', 'Bridge needed flows into group events, then remove'],
        ['Acquired chain\'s fresh-food forecasting tool, better than the group\'s', 'Evaluate adopting it group-wide'],
        ['Item and supplier codes', 'Cross-reference now, single group code for new items'],
      ],
      explain: 'Not everything acquired is retired: a better capability may become the group standard. Systems that will be retired are wrapped by System APIs so group processes do not depend on their internals.',
    },
    {
      type: 'single',
      prompt: 'Halfway through, the board asks to accelerate by six months. Which response best reflects good architectural governance?',
      options: [
        'Agree, and skip the shadow-mode replenishment runs in the remaining waves',
        'Show the risk and cost of each acceleration option (larger waves, parallel waves, extra teams) against the wave metrics, and agree which risks the business accepts',
        'Refuse, because the original plan was approved',
        'Agree, and move the remaining stores in a single big-bang weekend',
      ],
      answer: 1,
      explain: 'Architects make trade-offs visible and let the business decide with evidence from earlier waves. Removing the controls that caught problems, or a flat refusal, are both poor governance.',
    },
  ],
  description: `
**Context.** A national supermarket group (600 stores, 8 DCs, SAP S/4HANA, SAP EWM, ActiveMQ and API-led integration on Anypoint) has acquired a regional chain (140 stores, 2 DCs). The acquired chain runs an Oracle-based retail ERP, its own WMS, a different POS vendor and about 80 point-to-point integrations on an ActiveMQ Classic broker. Item codes, supplier IDs and store IDs are different in each company, and about 60% of products are the same.

**Goals**
- Realise purchasing savings from common suppliers within 12 months.
- Supply acquired stores from group DCs where it is cheaper.
- One view of sales and stock for the combined business from day one.
- Retire the acquired chain's ERP, WMS and broker within three years.

**Constraints**
| Item | Detail |
|---|---|
| Trading | No disruption to fresh-food availability; waste targets must be met |
| Regulation | Competition authority conditions require some stores to be sold; scope may change |
| People | The acquired IT team (12 people) knows the legacy estate; retention is uncertain |
| Budget | Funded in yearly tranches, each requiring measurable benefits |

**Your task.** Propose the integration strategy, the phasing, how master data is handled, and the governance for the programme.
`,
  answerTemplate: `## Day-one priorities

## Master data: items, suppliers, sites

## Buying and supplier connectivity

## Distribution and replenishment

## Store systems

## Decommissioning

## Governance, people and benefits tracking
`,
  keyPoints: [
    'Day one: stabilise, secure and consolidate reporting through read-only feeds; do not start with an ERP migration.',
    'Master data comes first: an item, supplier and site cross-reference with clear ownership, used by every later integration.',
    'Coexistence is designed deliberately: group Process APIs sit in front of both estates, and the acquired systems are wrapped by System APIs until retired.',
    'Shared processes (supplier ordering, replenishment from group DCs) move in waves with shadow runs, go/no-go metrics and rollback.',
    'Governance links each tranche to measurable benefits, retains legacy knowledge, and keeps scope flexible for divestment conditions.',
  ],
  solution: `
**Phases**
1. **Day one (months 0–3).** Network and identity connectivity, access controls, and a consolidated sales and stock feed from the acquired Oracle ERP into the group data platform (System API over Oracle; nightly at first, then intraday).
2. **Master data (months 2–8).** Item, supplier and site cross-reference service with fuzzy matching (GTIN first, then supplier item code, then manual review). New items are created only in the group MDM and pushed to both estates.
3. **Buying (months 6–14).** \`prc-purchase-orders\` accepts POs from either ERP, maps to the group supplier profile and sends through the group B2B channel. Suppliers are cut over one by one.
4. **Distribution (months 10–24).** Acquired stores move to group DCs region by region. Store orders from the acquired chain are translated via the cross-reference and routed to EWM; shadow replenishment runs for each region first.
5. **Store systems (months 18–32).** POS and pricing migration in waves, reusing the group store integration.
6. **Decommission (months 30–36).** Retire flows on the acquired broker as their consumers move; archive data required for retention; switch off the ERP and WMS.

**Architecture.** Group Process APIs and canonical events stay as the stable layer; acquired systems get System APIs (\`sys-acq-erp-api\`, \`sys-acq-wms-api\`) so group processes never depend on their schemas. A bridge republishes needed events from the acquired ActiveMQ into group topics.

**Governance.** Integration management office with business owners per phase, benefits tracked per tranche, wave go/no-go criteria (availability, waste, complaints), retention plan and knowledge capture for the acquired IT team, and a scope register for stores that must be divested (their flows stay on the acquired estate and are carved out).

**Risks.** Wrong cross-references causing wrong deliveries (validation per wave), loss of legacy knowledge, scope changes from regulators, and benefits arriving later than the board expects.
`,
  followUps: [
    { q: 'Why not migrate the acquired stores straight onto the group SAP system?', a: 'It bundles master data, process, store and DC changes into one high-risk event. Staging the change by capability, with master data first, delivers benefits earlier and contains failures.' },
    { q: 'How does the API-led approach help if some stores must be sold?', a: 'Divested stores stay on acquired systems behind their System APIs, so carving them out means changing routing rather than untangling direct connections.' },
    { q: 'What do you measure to prove the programme is working?', a: 'Purchasing savings by supplier cut-over, availability and waste per migrated region, number of flows retired from the acquired broker, and run costs of the legacy estate.' },
  ],
}
