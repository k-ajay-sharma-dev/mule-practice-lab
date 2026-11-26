export default {
  id: 'cs-052',
  category: 'case-studies',
  title: 'Three Business Units, Three Copies of Every System API: Federated Governance and Consolidation',
  level: 'EXPERT',
  tags: ['api-led', 'federated-governance', 'domain-ownership', 'consolidation', 'c4e', 'exchange'],
  estMinutes: 60,
  quiz: [
    {
      type: 'single',
      prompt: 'A group moves to federated API governance with a 4-person central team. In one week: unit A wants its own error response format for a new order API, unit B wants a monthly release train instead of weekly releases, and unit C wants to model its order resources its own way. Which request should the central team refuse?',
      options: [
        'Unit B\'s monthly train, because the centre sets one release cadence for every unit',
        'Unit C\'s resource model, because the centre approves the design of every API',
        'Unit A\'s error format, because the error format is a mandatory group standard',
        'None of them, because in a federated model each unit sets its own standards',
      ],
      answer: 2,
      explain: 'The centre owns only what must be common: platform foundations, a short list of mandatory standards (security baseline, naming, versioning, error format, correlation IDs), Exchange as the single catalogue with a reuse-before-build check, and the domain map and ownership register. A different error format breaks every consumer that handles errors across units, so the centre holds that line. Delivery cadence and internal API design stay with the units; a 4-person team approving every design would become the bottleneck. Federation is not a free-for-all either: without a few mandatory standards the units drift apart again. The centre automates the standards so it does not become a review queue.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Three business units (BUs) will share one consolidated SAP customer-master System API, and the central architecture team has only 4 people. Who should own the API?',
      options: [
        'Whichever BU calls it most, since it has the most at stake',
        'The central architecture team, since it is shared by all BUs',
        'The team closest to the system of record, with joint funding and an SLA',
        'A new shared team with one developer lent by each BU',
      ],
      answer: 2,
      explain: 'Ownership follows the business domain and system of record, with accountability for contract and operation. The heaviest caller would shape the API for its own needs, and the central team lacks capacity. A team of lent developers answers to three BUs, so each developer pulls the API toward their own unit and nobody is accountable for its SLA.',
    },
    {
      type: 'order',
      needsScenario: true,
      prompt: 'Order the method for consolidating the three customer System APIs.',
      items: [
        'Inventory with runtime data: consumers, traffic, incidents, operations used',
        'Compare behaviour (filters, mappings, rules) and agree the group rule with data owners',
        'Choose the survivor, or design a canonical v2 if none is good enough',
        'Turn the losing APIs into facades that route to the survivor',
        'Move each consumer to the canonical contract within a deprecation window',
        'Retire the facades',
      ],
      explain: 'Decide on evidence and business rules first; facades let consumers switch with no change on day one, and the deprecation window gives them time to move before the facades go.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Why do the losing duplicates become **facades** instead of being switched off?',
      options: [
        'So each BU can keep its own mapping rules in its facade while sharing one back end',
        'So old consumers keep their contract while the survivor already serves them',
        'So the survivor can be load tested on real traffic before any duplicate is retired',
        'So the duplicates keep serving reads while the survivor takes over writes',
      ],
      answer: 1,
      explain: 'The facade decouples the switch of implementation from the consumer migration, so consumers move on their own schedule without a big-bang cut-over. It is temporary: it is retired after the deprecation window, not kept forever. Keeping BU mapping rules in facades preserves the hidden differences that made reports disagree. Load testing happens before the facades route traffic, not as their purpose. A facade routes all of its calls to the survivor, so the old duplicate serves nothing.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Which domain do you consolidate first, and why?',
      options: [
        'Workday, because it is the smallest domain and the lowest risk',
        'Customer, because it unblocks the cross-BU portal and customer 360',
        'Customer, Salesforce accounts and Workday in parallel, one domain per BU team',
        'Salesforce accounts, because account data feeds the sales reports',
      ],
      answer: 1,
      explain: 'Prioritise by value: the customer domain blocks the group\'s new journeys and causes the unreconcilable reports. Workday is low risk but unblocks nothing. Three domains in parallel pull every BU off delivery at once and stretch the 4-person central team across three sets of rule decisions. Sales reports matter, but the accounts domain does not block the portal or customer 360.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'One duplicate filters out inactive customers, the others do not. What do you do?',
      options: [
        'Keep the behaviour of the API that has the most consumers today',
        'Ask the data owners to agree a group rule, and state it in the canonical API',
        'Let each BU keep its own copy of that one operation',
        'Remove the filter everywhere, since less hidden logic is better',
      ],
      answer: 1,
      explain: 'Hidden rule differences caused the unreconcilable reports. The rule is a business decision; once agreed, the canonical contract states it openly instead of burying it in implementations. If both rules are valid, the canonical API makes the choice explicit, for example with a status filter parameter.',
    },
    {
      type: 'single',
      prompt: 'A company is consolidating duplicate System APIs across its business units, and leadership wants a progress report. Which measure shows real progress, not only activity?',
      options: [
        'Number of duplicate System APIs retired',
        'Number of facades deployed over the losing System APIs',
        'Number of canonical data types agreed and published',
        'Number of new APIs built by each unit',
      ],
      answer: 0,
      explain: 'Retired duplicates track the actual goal of less duplication. Other useful measures are the percentage of APIs compliant with the security baseline, the vCore or capacity cost trend, and APIs consumed by two or more units. A facade is a step on the way, but while it runs the duplicate still costs capacity and its consumers have not moved. Agreed data types are design work, not less duplication. New API counts measure activity, and can even reward more duplication.',
    },
  ],
  description: `
**Context.** An industrial group has three business units (**Industrial Equipment**, **Services**, and **Spare Parts**) that each adopted Anypoint Platform independently over 4 years, in separate business groups of one organisation.
- Together they run **~260 APIs**. An inventory finds **3 different System APIs over the same SAP S/4HANA customer master** (\`sys-sap-customer-api\`, \`ie-customer-sapi\`, \`parts-sap-customers\`), 2 over Salesforce accounts, 3 over the same Workday instance, and 4 different "customer" data models.
- Each BU has its own naming, security policies, CI/CD and error formats. One BU uses OAuth via the corporate IdP; another uses only Client ID Enforcement; a third has some APIs with no policies.
- Group IT now wants **cross-BU journeys**: one customer portal across all three BUs, group-wide customer 360 and consolidated reporting.
- BU leaders resist central control: "a central team will slow us down"; the central architecture team has 4 people.
- Duplicate APIs sometimes behave differently (e.g. one filters inactive customers, the others don't), so reports don't reconcile.
- vCore/capacity costs grew 3x in two years.

**Your task.** Propose a federated governance model, domain ownership, and a consolidation roadmap for duplicated System APIs, while BUs keep delivering. Include how you decide which duplicate survives, how consumers migrate, and how you measure success.
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
    'Assigns ownership by business domain (system of record), not by BU (e.g. one owner for SAP customer master System APIs serving all BUs), with clear funding and support obligations.',
    'Consolidation method: inventory with runtime consumers, compare behaviour, choose a survivor (or new canonical v2) by contract quality, consumers, operational health and fit; use facades/routing so consumers migrate gradually; retire with deprecation windows.',
    'Phased roadmap that unblocks the cross-BU portal first (customer domain), standardises security quickly, and consolidates other domains by value.',
    'Change management and metrics: BU involvement, incentives (shared platform services and funding), and KPIs like duplicates retired, consumers migrated, policy compliance, capacity cost and cross-BU delivery time.',
  ],
  solution: `
**Diagnosis.** Three independent adoptions produced three application networks in one organisation. Causes: no shared catalogue or discovery across business groups, BU-funded projects that only paid for their own needs, no domain ownership, and no minimum standards. Consequences: inconsistent business logic in duplicates (unreconcilable reports), triple maintenance and capacity cost, uneven security (a real risk), and cross-BU journeys that would have to integrate with three versions of everything.

**Governance model: federated, with a thin mandatory core.**

| Central (group platform team + architecture board) | Federated (BU and domain teams) |
|---|---|
| Platform: org structure, environments, CI/CD templates, monitoring, IdP integration | Building and running their APIs |
| Mandatory standards: security policy baseline, naming, versioning, error format, logging/correlation IDs | Choice of internal design and delivery cadence |
| Exchange as the single catalogue; reuse-before-build check | Publishing assets and documentation to Exchange |
| Domain map and ownership register; arbitration on overlap | Owning domain APIs assigned to them |
| Metrics and reporting | Contributing to C4E community (patterns, templates) |

Keep the mandatory list short and **automate** it (pipeline checks, API Manager policy automation, spec linting) so governance doesn't depend on a 4-person team reviewing everything. A federated C4E: each BU nominates architects who form the design authority with the central team.

**Domain ownership.** Own APIs by **business domain and system of record**, not by BU:
- *Customer* (SAP customer master, Salesforce accounts): owned by the Spare Parts team (largest customer volume and best SAP skills), funded jointly.
- *Workforce* (Workday): owned by group HR IT.
- *Product/asset*, *service contracts*, *orders*: mapped to the BU that owns the system of record.
Owners commit to: a published contract, versioning policy, SLA/support, capacity, and accepting change requests from other BUs through a transparent backlog.

**Consolidating duplicates: method.**
1. **Inventory** with runtime data: consumers per API (contracts, analytics), traffic, incidents, operations used.
2. **Compare behaviour**, not only specs: filters, mappings, business rules (e.g. inactive customer handling). Decide the correct group rule with business data owners.
3. **Choose the survivor** by contract quality, number of consumers, operational health, security and fit with the canonical model, or design a new **canonical v2** when none is good enough.
4. **Migrate consumers safely**: the losing APIs become **facades** routing to the survivor (same old contract, new implementation), so consumers switch without changes; then each consumer moves to the canonical contract within a deprecation window; finally retire the facade.
5. Reconcile data: parallel run and compare outputs before switching critical reports.

\`\`\`
Before:  IE apps -> ie-customer-sapi -----> SAP
         Parts   -> parts-sap-customers --> SAP
         Services-> sys-sap-customer-api -> SAP

Step 1:  IE apps -> ie-customer-sapi (facade) ---\\
         Parts   -> parts-sap-customers (facade) -+--> sys-customer-api v2 (canonical) --> SAP
         Services-> sys-sap-customer-api (facade)/

Step 2:  all consumers -> sys-customer-api v2 ; facades retired
\`\`\`

**Roadmap.**
- *Phase 0 (months 0 to 3)*: inventory, domain map and owners, mandatory standards v1, Exchange visibility across business groups, security quick wins (no unprotected APIs; baseline policies).
- *Phase 1 (months 3 to 9)*: **customer domain** consolidation, because it unblocks the cross-BU portal and customer 360; build \`prc-group-customer-api\` on the canonical System API; portal Experience API on top.
- *Phase 2 (months 9 to 18)*: Salesforce and Workday duplicates; standard CI/CD templates adopted by all BUs; shared logging/monitoring.
- *Phase 3 (months 18 to 24)*: remaining domains by value; capacity rationalisation; consider a group canonical model only where cross-BU use exists (avoid boiling the ocean).

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
