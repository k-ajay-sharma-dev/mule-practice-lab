export default {
  id: 'ar-009',
  category: 'architecture',
  title: 'When Not to Use MuleSoft',
  level: 'INTERMEDIATE',
  tags: ['tool-selection', 'point-to-point', 'cost', 'integration-strategy'],
  estMinutes: 15,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each request to the best-fitting tool.',
      pairs: [
        ['Nightly copy of 2 TB of sales history into the data warehouse', 'ETL/ELT or replication tool'],
        ['New Salesforce opportunities posted into Slack', 'Native vendor integration (point-to-point)'],
        ['Customer and order data for the portal, mobile app and a future chatbot', 'MuleSoft, API-led'],
        ['50,000 machine sensor readings per second to analytics', 'Streaming platform (e.g. Kafka)'],
      ],
      explain: 'Bulk set-based loads and very high-rate streams have dedicated tools; a supported native SaaS connector with one consumer needs no extra layer. Multiple consumers with governance needs is the MuleSoft sweet spot.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Why is request 3 (customer and order data for three channels) a strong MuleSoft case?',
      options: [
        'Because Mule is the fastest at moving bulk data',
        'Because several consumers now and later can reuse the same System/Process APIs, with security policies and analytics from the platform',
        'Because the CIO said everything goes through MuleSoft',
        'Because a direct database connection is not technically possible',
      ],
      answer: 1,
      explain: 'Reuse is the economic argument: the second and third consumers are much cheaper once the APIs exist. Direct DB access would couple every consumer to the schema.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'What role, if any, does Mule play for the machine telemetry?',
      options: [
        'Carry every sensor reading through a Mule app',
        'None at all',
        'Subscribe to derived business events (e.g. "machine fault") from the streaming platform to trigger ERP work orders',
        'Replace the streaming platform with Anypoint MQ',
      ],
      answer: 2,
      explain: 'Raw telemetry belongs on a streaming platform. Mule adds value where a business event must trigger work in other systems.',
    },
    {
      type: 'multi',
      prompt: 'A company is writing a guide to decide when a new integration should use MuleSoft and when another tool fits better. The guide must give the same result across teams. Which three criteria belong in it?',
      options: [
        'How many consumers will use it, now and later',
        'What security, SLA and audit needs it has',
        'How much data moves, and in what shape',
        'Which tool the developers enjoy working with most',
        'Which tool a senior manager personally prefers',
      ],
      answer: [0, 1, 2],
      explain: 'The criteria must be explainable to a CIO and repeatable across teams. Reuse, governance needs, and the volume and shape of the data (bulk set, stream, transactions) all point to the right tool. Ownership, support and total cost (vCores, licences) also belong in the guide. Personal preference is not a selection criterion.',
    },
    {
      type: 'single',
      prompt: 'How do you answer "everything must go through MuleSoft" without creating point-to-point chaos?',
      options: [
        'Agree, and route every integration through Mule anyway',
        'Let each team pick any tool without recording it',
        'Propose a C4E-owned decision guide: MuleSoft by default for application/API integration, documented exceptions, and every exception still registered in an inventory/Exchange',
        'Ban native SaaS integrations entirely',
      ],
      answer: 2,
      explain: 'A default plus documented, registered exceptions avoids both extremes: expensive Mule-for-everything and invisible spaghetti.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Six months later the Salesforce-to-Slack flow also needs data from SAP. What now?',
      options: [
        'Keep the native integration and add a second native one from SAP to Slack',
        'Re-evaluate: there is now orchestration and a second source, so moving it to Mule (reusing the SAP System API) is justified',
        'Nothing; decisions are final once made',
        'Ask the Slack vendor to connect to SAP',
      ],
      answer: 1,
      explain: 'Decisions depend on requirements. When orchestration and more sources appear, the criteria point to Mule, and the native integration is retired.',
    },
  ],
  description: `
A manufacturing company bought Anypoint Platform last year. A new CIO says "**everything** must go through MuleSoft". You receive five requests this month:

1. Copy **2 TB of historical sales data** nightly from the ERP database into the cloud data warehouse for BI dashboards.
2. Push new **Salesforce opportunities** into Slack channels — Salesforce offers a native, supported Slack integration.
3. Expose **customer and order data** to the new partner portal, the mobile app, and later to a chatbot.
4. Stream **machine telemetry** (50,000 sensor readings/second) to an analytics platform.
5. Sync **employees** from Workday to three internal systems (AD, payroll, badge system).

vCore capacity is limited and each new app costs money and support effort.

**Questions:**
- For each request: MuleSoft, another tool, or a point-to-point/native integration? Why?
- What criteria do you use to decide?
- How do you explain to the CIO that "not everything goes through MuleSoft" without creating chaos?
`,
  answerTemplate: `## Decision per request

## Decision criteria

## Message to the CIO
`,
  keyPoints: [
    'Bulk data warehouse loads (request 1) fit an ETL/ELT or data-replication tool better than a Mule app moving terabytes record by record.',
    'A supported native SaaS-to-SaaS connector (request 2) with one consumer and no reuse can stay point-to-point.',
    'Requests 3 and 5 are good MuleSoft cases: multiple consumers or targets, reuse of System/Process APIs, security and governance needs.',
    'High-volume event streaming (request 4) belongs on a streaming platform (e.g. Kafka); Mule may consume or publish selected business events, not carry every sensor reading.',
    'Decision criteria are explicit: number of consumers/reuse, need for API governance/security, volume and data shape, latency, ownership and total cost.',
  ],
  solution: `
**Decision per request.**
| # | Choice | Reason |
|---|---|---|
| 1 | **ETL/ELT or replication tool** (e.g. the warehouse's loader, CDC replication) | Set-based bulk movement of TBs; Mule *can* do batch, but it would cost many vCores and reinvent features (schema evolution, incremental loads) that data tools provide. |
| 2 | **Native Salesforce–Slack integration** (point-to-point) | One source, one target, vendor-supported, no reuse, no transformation logic. Wrapping it in Mule adds cost and a failure point with zero benefit. |
| 3 | **MuleSoft, API-led** | Several consumers now and later → reusable Customer/Order System APIs and a Process API, security policies, analytics. This is exactly the reuse case. |
| 4 | **Streaming platform** (Kafka or a cloud IoT/streaming service) | Very high event rate, analytics consumers, replay. Mule can subscribe to *derived* business events (e.g. "machine fault") to trigger ERP work orders. |
| 5 | **MuleSoft** (or the IAM tool's provisioning for AD) | One source, several targets with mapping and error handling — a typical Mule sync, ideally via an Employee System API and events. If an identity-management tool already provisions AD, use it for that target. |

**Decision criteria.**
- **Reuse/consumers:** more than one consumer or likely future consumers → API.
- **Governance needs:** security policies, SLA, analytics, auditing.
- **Volume and shape:** bulk set-based data → data tools; very high-rate streams → streaming platform; business transactions and orchestration → Mule.
- **Logic complexity:** orchestration, transformation, error handling.
- **Ownership and cost:** who supports it at 3 a.m.; vCore and license cost vs value.

**Message to the CIO.** Propose an **integration decision guide** owned by the architecture team / C4E: MuleSoft is the default for application and API integration, with documented exceptions (data pipelines, streaming, native SaaS connectors). Every exception is still registered (e.g. as an asset in Exchange or in an integration inventory) so the landscape stays visible. This avoids both "MuleSoft for everything" (expensive, slow) and uncontrolled point-to-point spaghetti.
`,
  followUps: [
    { q: 'The native Salesforce–Slack integration later needs data from SAP too. Now what?', a: 'The criteria changed: there is orchestration and a second source. Re-evaluate and move it to Mule (reusing the SAP System API), retiring the native integration. Decisions should be revisited when requirements change.' },
    { q: 'How do you justify the cost of MuleSoft for request 3 versus a quick direct database connection?', a: 'Show the reuse: the second and third consumers (mobile, chatbot) cost much less because System/Process APIs already exist, and security/monitoring come from the platform. Direct DB access couples every consumer to the schema and multiplies change cost.' },
    { q: 'Is point-to-point ever acceptable inside an API-led architecture?', a: 'Yes, when there is exactly one consumer, no expected reuse, and the extra layer adds no value. API-led is a guideline for reuse, not a rule to create three layers for every flow.' },
  ],
}
