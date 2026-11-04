export default {
  id: 'cs-052',
  category: 'case-studies',
  title: 'Three Business Units, Three Copies of Every System API: Federated Governance and Consolidation',
  level: 'EXPERT',
  tags: ['api-led', 'federated-governance', 'domain-ownership', 'consolidation', 'c4e', 'exchange'],
  estMinutes: 60,
  quiz: [
    {
      type: 'multi',
      prompt: 'Which responsibilities belong to the thin **central** core of the federated model?',
      options: [
        'Platform foundations: org structure, environments, CI/CD templates, IdP integration, monitoring',
        'A short list of mandatory standards (security baseline, naming, versioning, error format, correlation IDs), enforced by automation',
        'Exchange as the single catalogue with a reuse-before-build check',
        'The domain map and ownership register, plus arbitration on overlaps',
        'Building and running all domain APIs for the three BUs',
        'Deciding each BU\'s delivery cadence and internal designs',
      ],
      answer: [0, 1, 2, 3],
      explain: 'A 4-person central team cannot build everything; BUs keep delivery and design choices. The centre owns only what must be common — and automates it so it does not become a review bottleneck.',
    },
    {
      type: 'single',
      prompt: 'Who should own the consolidated SAP customer-master System API?',
      options: [
        'Whichever BU calls it most',
        'The central architecture team, since it is shared',
        'The team closest to the system of record with the skills and capacity to run it (here Spare Parts), backed by joint funding and an SLA',
        'All three BUs jointly, with each able to change it',
      ],
      answer: 2,
      explain: 'Ownership follows the business domain and system of record, with accountability for contract and operation. Shared ownership by everyone is ownership by no one, and the central team lacks capacity.',
    },
    {
      type: 'order',
      prompt: 'Order the method for consolidating the three customer System APIs.',
      items: [
        'Inventory with runtime data: consumers, traffic, incidents, operations used',
        'Compare behaviour (filters, mappings, rules) and agree the group rule with data owners',
        'Choose the survivor — or design a canonical v2 if none is good enough',
        'Turn the losing APIs into facades that route to the survivor',
        'Move each consumer to the canonical contract within a deprecation window',
        'Retire the facades',
      ],
      explain: 'Decide on evidence and business rules first; facades let consumers switch with no change on day one, and the deprecation window gives them time to move before the facades go.',
    },
    {
      type: 'single',
      prompt: 'Why do the losing duplicates become **facades** instead of being switched off?',
      options: [
        'Facades are cheaper to run than normal APIs',
        'Existing consumers keep their old contract while the implementation already uses the survivor, so they migrate on their own schedule without a big-bang cut-over',
        'API Manager cannot delete an API that has contracts',
        'Facades permanently hide the canonical model from consumers',
      ],
      answer: 1,
      explain: 'The facade decouples the switch of implementation from the consumer migration. It is temporary — it is retired after the deprecation window, not kept forever.',
    },
    {
      type: 'single',
      prompt: 'Which domain do you consolidate first, and why?',
      options: [
        'Workday, because it is the smallest and lowest risk',
        'Customer, because it unblocks the cross-BU portal and customer 360 that group IT wants',
        'All domains at once, to finish quickly',
        'Whichever domain the most vocal BU prefers',
      ],
      answer: 1,
      explain: 'Prioritise by value: the customer domain blocks the group\'s new journeys and causes the unreconcilable reports. Consolidating everything at once would stall BU delivery.',
    },
    {
      type: 'single',
      prompt: 'One duplicate filters out inactive customers, the others do not. What do you do?',
      options: [
        'Keep the behaviour of the API with the most consumers',
        'Surface the difference to the business data owners and agree a group rule; if both are valid, make it explicit in the canonical API (e.g. a status filter parameter)',
        'Let each BU keep its own copy for that operation',
        'Remove the filter everywhere, since less logic is better',
      ],
      answer: 1,
      explain: 'Hidden rule differences caused the unreconcilable reports. The rule is a business decision; once agreed, the canonical contract states it openly instead of burying it in implementations.',
    },
    {
      type: 'multi',
      prompt: 'Which success measures would you report?',
      options: [
        'Duplicate System APIs retired (customer domain: 0 duplicates by month 9)',
        'Percentage of APIs compliant with the security baseline',
        'vCore / capacity cost trend',
        'APIs consumed by two or more BUs',
        'Number of assets published in Exchange',
        'Number of governance meetings held',
      ],
      answer: [0, 1, 2, 3],
      explain: 'These track the actual goals: less duplication, closed security gaps, lower cost and real cross-BU reuse. Asset counts and meeting counts measure activity, and can even reward more duplication.',
    },
  ],
  description: `
**Context.** An industrial group has three business units — **Industrial Equipment**, **Services**, and **Spare Parts** — that each adopted Anypoint Platform independently over 4 years, in separate business groups of one organisation.
- Together they run **~260 APIs**. An inventory finds **3 different System APIs over the same SAP S/4HANA customer master** (\`sys-sap-customer-api\`, \`ie-customer-sapi\`, \`parts-sap-customers\`), 2 over Salesforce accounts, 3 over the same Workday instance, and 4 different "customer" data models.
- Each BU has its own naming, security policies, CI/CD and error formats. One BU uses OAuth via the corporate IdP; another uses only Client ID Enforcement; a third has some APIs with no policies.
- Group IT now wants **cross-BU journeys**: one customer portal across all three BUs, group-wide customer 360 and consolidated reporting.
- BU leaders resist central control: "a central team will slow us down"; the central architecture team has 4 people.
- Duplicate APIs sometimes behave differently (e.g. one filters inactive customers, the others don't) — reports don't reconcile.
- vCore/capacity costs grew 3x in two years.

**Your task.** Propose a federated governance model, domain ownership, and a consolidation roadmap for duplicated System APIs — while BUs keep delivering. Include how you decide which duplicate survives, how consumers migrate, and how you measure success.
`,
  answerTemplate: `## Diagnosis

## Governance model: what is central, what is federated

## Domain ownership model

## Consolidation approach for duplicated APIs

## Roadmap (phases)

## Security and platform standardisation

## Change management and success measures
`,
  keyPoints: [
    'Diagnoses why duplication happened (independent adoption, no shared catalogue/ownership, BU-funded projects) and its costs: inconsistent data, triple maintenance, security gaps, higher capacity cost, and blocked cross-BU journeys.',
    'Proposes federated governance: a small central platform/architecture team owns minimal mandatory standards (security, naming, contracts, Exchange, observability) and shared platform services; BU C4E members deliver and own domain APIs.',
    'Assigns ownership by business domain (system of record), not by BU — e.g. one owner for SAP customer master System APIs serving all BUs — with clear funding and support obligations.',
    'Consolidation method: inventory with runtime consumers, compare behaviour, choose a survivor (or new canonical v2) by contract quality, consumers, operational health and fit; use facades/routing so consumers migrate gradually; retire with deprecation windows.',
    'Phased roadmap that unblocks the cross-BU portal first (customer domain), standardises security quickly, and consolidates other domains by value.',
    'Change management and metrics: BU involvement, incentives (shared platform services and funding), and KPIs like duplicates retired, consumers migrated, policy compliance, capacity cost and cross-BU delivery time.',
  ],
  solution: `
**Diagnosis.** Three independent adoptions produced three application networks in one organisation. Causes: no shared catalogue or discovery across business groups, BU-funded projects that only paid for their own needs, no domain ownership, and no minimum standards. Consequences: inconsistent business logic in duplicates (unreconcilable reports), triple maintenance and capacity cost, uneven security (a real risk), and cross-BU journeys that would have to integrate with three versions of everything.

**Governance model — federated, with a thin mandatory core.**

| Central (group platform team + architecture board) | Federated (BU and domain teams) |
|---|---|
| Platform: org structure, environments, CI/CD templates, monitoring, IdP integration | Building and running their APIs |
| Mandatory standards: security policy baseline, naming, versioning, error format, logging/correlation IDs | Choice of internal design and delivery cadence |
| Exchange as the single catalogue; reuse-before-build check | Publishing assets and documentation to Exchange |
| Domain map and ownership register; arbitration on overlap | Owning domain APIs assigned to them |
| Metrics and reporting | Contributing to C4E community (patterns, templates) |

Keep the mandatory list short and **automate** it (pipeline checks, API Manager policy automation, spec linting) so governance doesn't depend on a 4-person team reviewing everything. A federated C4E: each BU nominates architects who form the design authority with the central team.

**Domain ownership.** Own APIs by **business domain and system of record**, not by BU:
- *Customer* (SAP customer master, Salesforce accounts) — owned by the Spare Parts team (largest customer volume and best SAP skills), funded jointly.
- *Workforce* (Workday) — owned by group HR IT.
- *Product/asset*, *service contracts*, *orders* — mapped to the BU that owns the system of record.
Owners commit to: a published contract, versioning policy, SLA/support, capacity, and accepting change requests from other BUs through a transparent backlog.

**Consolidating duplicates — method.**
1. **Inventory** with runtime data: consumers per API (contracts, analytics), traffic, incidents, operations used.
2. **Compare behaviour**, not only specs: filters, mappings, business rules (e.g. inactive customer handling). Decide the correct group rule with business data owners.
3. **Choose the survivor** by contract quality, number of consumers, operational health, security and fit with the canonical model — or design a new **canonical v2** when none is good enough.
4. **Migrate consumers safely**: the losing APIs become **facades** routing to the survivor (same old contract, new implementation), so consumers switch without changes; then each consumer moves to the canonical contract within a deprecation window; finally retire the facade.
5. Reconcile data: parallel run and compare outputs before switching critical reports.

\`\`\`
Before:  IE apps -> ie-customer-sapi -----> SAP
         Parts   -> parts-sap-customers --> SAP
         Services-> sys-sap-customer-api -> SAP

Step 1:  IE apps -> ie-customer-sapi (facade) ---\\
         Parts   -> parts-sap-customers (facade) -+--> customer-sapi v2 (canonical) --> SAP
         Services-> sys-sap-customer-api (facade)/

Step 2:  all consumers -> customer-sapi v2 ; facades retired
\`\`\`

**Roadmap.**
- *Phase 0 (0–3 months)*: inventory, domain map and owners, mandatory standards v1, Exchange visibility across business groups, security quick wins (no unprotected APIs; baseline policies).
- *Phase 1 (3–9 months)*: **customer domain** consolidation — it unblocks the cross-BU portal and customer 360; build \`prc-group-customer-api\` on the canonical System API; portal Experience API on top.
- *Phase 2 (9–18 months)*: Salesforce and Workday duplicates; standard CI/CD templates adopted by all BUs; shared logging/monitoring.
- *Phase 3 (18–24 months)*: remaining domains by value; capacity rationalisation; consider a group canonical model only where cross-BU use exists (avoid boiling the ocean).

**Security and platform.** One security baseline: OAuth 2.0 via the corporate IdP for external and sensitive APIs, client ID enforcement at minimum internally, TLS everywhere, secrets in secure properties/vault. Policies applied by automation. One observability approach with correlation IDs across BUs (needed for cross-BU journeys).

**Change management.** Make the federated model attractive: BUs gain shared templates, a faster pipeline and less maintenance; consolidation savings partly return to BU budgets; BU architects co-own standards. Escalation path for ownership disputes via the architecture board with an executive sponsor (CIO).

**Success measures.** Duplicate System APIs retired (target: 0 for customer domain by month 9); consumers migrated; % of APIs compliant with the security baseline (target 100% quickly); vCore/capacity cost trend; reuse across BUs (APIs with consumers from 2+ BUs); lead time for cross-BU features; report reconciliation issues closed.
`,
  followUps: [
    { q: 'Why not centralise all API development in one group team?', a: 'A 4-person central team would become a bottleneck and BUs would route around it again. Federated delivery with a few automated, mandatory standards keeps speed in the BUs while preventing the problems that caused duplication.' },
    { q: 'How do you pick the owner of a shared System API when several BUs want it?', a: 'Prefer the team closest to the system of record with the skills and capacity to run it, and back that with joint funding and an SLA. Ownership is about accountability for the contract and operation, not about who uses it most.' },
    { q: 'What if two duplicates implement genuinely different business rules?', a: 'Surface the difference to the business data owners and agree a group rule; if both rules are valid, make it explicit in the canonical API (for example a status filter parameter) instead of hiding it in two implementations.' },
    { q: 'How do you stop new duplicates appearing?', a: 'Exchange visible across business groups, a reuse-before-build check in the project intake and pipeline, the domain ownership register, and metrics that show duplicates to leadership.' },
  ],
}
