import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-044',
  category: 'architecture',
  title: 'Migrating a SOAP ESB Estate to API-led',
  level: 'EXPERT',
  tags: ['migration', 'soap', 'esb', 'strangler-fig', 'api-led', 'modernisation'],
  estMinutes: 40,
  diagram: {
    task: 'draw the estate halfway through the strangler fig migration. Internal apps and partners keep their endpoints, a routing layer sends migrated services to Mule and the rest to the ESB, and the new APIs are built as System, Process and Experience APIs.',
    checks: [
      { label: 'Internal apps and partners call the routing layer, so their endpoints stay the same', rule: { type: 'each', of: ['internal-app', 'partner'], min: 2, edgeTo: ['api-gateway', 'load-balancer'] } },
      { label: 'Consumers reach the ESB and the new APIs only through the routing layer', rule: { type: 'no-path', from: ['internal-app', 'partner'], to: ['experience-api', 'process-api', 'system-api', 'legacy'], unless: ['api-gateway', 'load-balancer'] } },
      { label: 'The routing layer still forwards unmigrated services to the ESB, and nothing else calls the ESB', rule: { type: 'only-via', target: { type: 'legacy', label: 'esb' }, from: ['api-gateway', 'load-balancer'] } },
      { label: 'The routing layer sends migrated services to a Mule SOAP facade (an Experience API)', rule: { type: 'edge', from: ['api-gateway', 'load-balancer'], to: 'experience-api' } },
      { label: 'Every Experience API (the SOAP facade) calls a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Every Process API calls a System API', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api' } },
      { label: 'Every System API is called by a Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['database', 'oracle-db', 'sql-server', 'erp', 'crm', 'saas', 'legacy'] } },
      { label: 'Backends (database, SAP, billing) are reached only through System APIs or the ESB', rule: { type: 'only-via', target: ['database', 'oracle-db', 'sql-server', 'erp', 'crm', 'saas'], from: ['system-api', 'legacy'] } },
      { label: 'The ESB still serves its unmigrated services from the backends', rule: { type: 'each', of: { type: 'legacy', label: 'esb' }, edgeTo: ['database', 'oracle-db', 'sql-server', 'erp', 'crm', 'saas'] } },
      { label: 'Reads and writes to a database are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server'], kind: 'sync' } },
      { label: 'SOAP and REST calls are sync calls', rule: { type: 'lines', from: ['internal-app', 'partner', 'web-app', 'api-gateway', 'load-balancer', 'experience-api', 'process-api'], to: ['api-gateway', 'load-balancer', 'experience-api', 'process-api', 'system-api', 'legacy'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        apps: ['internal-app', 'Internal apps (45)'],
        ptn: ['partner', 'Partners (WS-Security, 2-way TLS)'],
        rtr: ['api-gateway', 'Routing layer (moves traffic service by service)'],
        esb: ['legacy', 'Legacy ESB (unmigrated services)'],
        soap: ['experience-api', 'exp-customer-soap-facade (same WSDL)'],
        prc: ['process-api', 'prc-customer-api (one, not 6 variants)'],
        sdb: ['system-api', 'sys-customer-db-api'],
        ssap: ['system-api', 'sys-sap-customer-api'],
        db: ['database', 'Customer DB (stored procedures)'],
        sap: ['erp', 'SAP'],
      },
      ['apps -> rtr', 'ptn -> rtr', 'rtr -> esb', 'rtr -> soap', 'soap -> prc', 'prc -> sdb', 'prc -> ssap', 'sdb -> db', 'ssap -> sap', 'esb -> db', 'esb -> sap'],
    ),
  },
  quiz: [
    {
      type: 'match',
      prompt: 'Assign each ESB service to its migration bucket.',
      pairs: [
        ['No calls in a year of traffic logs, owners confirm', 'Retire'],
        ['Six near-identical GetCustomer variants', 'Consolidate into one API plus facades'],
        ['Simple pass-through to a stored procedure', 'Rehost (lift into a System API)'],
        ['Multi-system orchestration with embedded business rules', 'Redesign'],
      ],
      explain: 'The target is not 180 Mule apps: retire and consolidate first so only what is needed is migrated, and spend design effort where the complexity is.',
    },
    {
      type: 'order',
      prompt: 'Order the strangler-fig steps for migrating one service.',
      items: [
        'Put a routing layer in front of the ESB endpoints, forwarding everything to the ESB',
        'Build the target System and Process APIs on Mule',
        'Compare behaviour with shadow traffic or replayed recorded requests',
        'Switch the route for that service (rollback = switch back)',
        'Repeat in waves until the ESB receives no traffic',
      ],
      explain: 'The router comes first so consumers never see endpoint changes; every switch is validated and reversible.',
    },
    {
      type: 'single',
      prompt: 'Partners cannot move to REST within 18 months. How do you keep them working after the ESB is gone?',
      options: [
        'Keep the ESB running for partners only',
        'Expose the same WSDL through a Mule SOAP facade (APIkit for SOAP) that translates to the new REST Process APIs, preserving WS-Security and mutual TLS',
        'Force partners to change by a hard deadline',
        'Give partners direct database access',
      ],
      answer: 1,
      explain: 'A facade keeps the partner contract identical while the implementation moves to API-led; new consumers use the REST APIs.',
    },
    {
      type: 'single',
      prompt: 'What happens to the XSLT transformations inside the ESB?',
      options: [
        'Copy them unchanged forever',
        'They may run temporarily via the XML module as a bridge, but the target is DataWeave, tested with recorded ESB inputs/outputs as golden files',
        'Rewrite them all in Java',
        'Move them to the consumers',
      ],
      answer: 1,
      explain: 'Reusing XSLT short term protects the deadline; golden-file MUnit tests prove the DataWeave rewrite has parity.',
    },
    {
      type: 'single',
      prompt: 'A company is moving services from an old ESB to Mule. A routing layer in front of the ESB sends each service to the ESB or to Mule. Which approach lowers the risk of each cut-over?',
      options: [
        'Move every service in one big-bang cut-over weekend',
        'Compare responses in a parallel run, and rehearse the rollback',
        'Switch the route first, and let consumers report differences',
        'Remove the routing layer, so that consumers call Mule directly',
      ],
      answer: 1,
      explain: 'A parallel run or response comparison shows that a migrated service behaves like the ESB before traffic moves. Feature-flag routing with a rehearsed rollback lets you switch back. Other risk controls are performance tests against ESB baselines and a short ESB support extension negotiated early as insurance. A big-bang cut-over gives up the move service by service, and migrating every service one-to-one before any redesign carries over the duplication you should retire.',
    },
    {
      type: 'single',
      prompt: 'Where do business rules hidden in ESB orchestrations go?',
      options: [
        'Into the Experience APIs',
        'To their proper owner: domain rules to Process APIs, system-of-record rules back to that system, volatile complex rules to a rules engine — each documented in an ADR',
        'Into a single shared System API',
        'They are dropped',
      ],
      answer: 1,
      explain: 'Extracting rules deliberately avoids recreating the ESB inside Mule.',
    },
  ],
  description: `
A utilities company runs a 12-year-old ESB (not MuleSoft) with:

| Item | Count / fact |
|---|---|
| SOAP services exposed | 180 (many near-duplicates, e.g. 6 variants of GetCustomer) |
| Consumers | 45 internal apps, 12 external partners (WS-Security, some with 2-way TLS) |
| Logic inside the ESB | Orchestrations, business rules, XSLT transformations, DB stored-procedure calls |
| Usage data | Partial; ~40 services have had no calls in logs for a year |
| Licence | ESB support ends in **18 months** |

Leadership wants to move to MuleSoft with API-led connectivity, REST/JSON as the target style, and **no big-bang cutover**. Partners cannot be forced to change their integration within 18 months.

**Questions:**
- How do you discover, assess and prioritise the 180 services?
- Describe the migration approach (patterns, waves) that meets the deadline without breaking partners.
- How do you handle SOAP consumers that cannot move to REST in time?
- What happens to the business logic and XSLT inside the ESB?
- How do you manage risk and measure progress?
`,
  answerTemplate: `## Discovery and assessment

## Target architecture and migration pattern

## Keeping SOAP consumers working

## Business logic and transformations

## Waves, risk and progress tracking
`,
  keyPoints: [
    'Start with an inventory based on real traffic data (consumers, call volumes, dependencies, complexity), then retire unused services and consolidate duplicates instead of migrating them one-to-one.',
    'Use a strangler-fig approach: put a routing layer in front of the ESB endpoints so traffic can move service by service to Mule without consumers noticing.',
    'Build the target as System, Process and Experience APIs; existing SOAP contracts are preserved as thin SOAP facades (APIkit for SOAP or Web Service Consumer-based proxies) over the new APIs for consumers that cannot change.',
    'Business rules hidden in the ESB are extracted to their proper owner (Process APIs, the system of record, or a rules engine) rather than copied blindly; XSLT can be reused temporarily but is typically rewritten in DataWeave with test parity.',
    'Each migrated service is validated by parallel run or response comparison against the ESB before cutover, with a quick rollback path in the router.',
    'Waves are prioritised by business value, risk and the licence deadline, with a tracked burn-down of services migrated, retired and remaining.',
  ],
  solution: `
**Discovery and assessment.**
- Collect 6–12 months of **traffic logs** per operation: consumer, volume, errors. Combine with ESB configuration export to map dependencies (which backends, which stored procedures).
- Score each service: business criticality, consumers (internal/partner), complexity (orchestration, transactions), data sensitivity.
- Outcome buckets: **Retire** (no traffic — confirm with owners, switch off and watch for 30 days), **Consolidate** (6 GetCustomer variants → one Customer System/Process API + facades), **Rehost** (simple pass-through), **Redesign** (complex orchestrations).
- Expect a large part of the estate to shrink: the target is not 180 Mule apps.

**Migration pattern — strangler fig.**
1. Put a **routing layer** (API gateway or a Mule routing proxy) in front of the ESB endpoints; DNS/consumer endpoints point to it. Initially it forwards everything to the ESB.
2. Build target **System APIs** for backends (DB, SAP, billing) and **Process APIs** for the domains.
3. Per service: implement on Mule, **compare** (shadow traffic or replay recorded requests and diff responses), then switch the route. Rollback = switch back.
4. Repeat in waves until the ESB receives no traffic.

**Keeping SOAP consumers working.**
- For partners and slow-moving internal apps, expose the **same WSDL** via a Mule SOAP facade (APIkit for SOAP generates flows from the WSDL). The facade translates to the new REST Process APIs with DataWeave. Keep WS-Security and mutual TLS behaviour identical (Mule supports WS-Security via its web service/security configuration; validate partner-specific details early).
- Publish new **REST** APIs for new consumers and offer partners a migration path with a long deprecation window after the ESB is gone.

**Business logic and XSLT.**
- Extract rules: domain rules → Process APIs; rules that belong to the system of record → push back to it; complex, frequently changing rules → rules engine. Document each in an ADR.
- XSLT: Mule can run XSLT (XML module) as a short-term bridge for complex mappings, but the target is **DataWeave** with MUnit tests using recorded ESB inputs/outputs as golden files.
- Stored-procedure-heavy services: wrap in a System API first (lift), refactor later — do not block the deadline.

**Waves, risk, progress.**
- Wave 0: platform (CI/CD, security, logging, routing layer), retire unused services.
- Wave 1: low-risk, high-volume read services (prove the pattern).
- Wave 2–3: core domains and partner services; leave complex transactional orchestrations for when the team is experienced, but before month 15 to keep buffer.
- Risk controls: parallel run, feature-flag routing, cutover windows, rollback rehearsed, performance tests against ESB baselines.
- Track: services retired/migrated/remaining, % of traffic on Mule, defects after cutover, partner readiness. Make the licence end date a visible milestone with contingency (short ESB support extension negotiated early as insurance).
`,
  followUps: [
    { q: 'Why not migrate each SOAP service one-to-one to Mule first and redesign later?', a: 'It is fast but carries over duplication and ESB-specific design, and "later" rarely comes. A hybrid works best: lift simple or low-value services, but consolidate duplicates and design the System/Process layer properly for core domains.' },
    { q: 'How do you prove the new implementation behaves the same?', a: 'Record real requests and responses from the ESB, replay them against the Mule implementation and compare responses (ignoring known differences like timestamps); use these as regression tests and shadow traffic before switching the route.' },
    { q: 'What if a partner insists on the exact same endpoint URL?', a: 'The routing layer or DNS change keeps the external URL stable while the backend changes, which is exactly why the router is introduced first.' },
  ],
}
