import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-116',
  category: 'case-studies',
  title: 'Cable Operator Strangling a TIBCO BusinessWorks Estate Behind a Routing Facade',
  level: 'ADVANCED',
  tags: ['esb-replacement', 'migration', 'strangler', 'tibco', 'jms', 'anypoint-mq', 'telecom', 'api-led'],
  estMinutes: 55,
  diagram: {
    task: 'draw the coexistence period: channels calling only the routing facade, which sends migrated services to Mule and the rest to BusinessWorks; migrated APIs using System APIs and never BusinessWorks; and EMS events reaching migrated consumers through a bridge into Anypoint MQ.',
    checks: [
      { label: 'The portal and the agent desktop each call the routing facade', rule: { type: 'each', of: ['web-app', 'internal-app'], min: 2, edgeTo: 'load-balancer' } },
      { label: 'Every route from a channel to Mule or BusinessWorks passes the routing facade, so moving a service does not change its URL', rule: { type: 'no-path', from: ['web-app', 'internal-app'], to: ['experience-api', 'legacy'], unless: 'load-balancer' } },
      { label: 'The facade routes migrated services to a Mule Experience API', rule: { type: 'path', from: 'load-balancer', to: 'experience-api' } },
      { label: 'The facade still routes services not yet migrated to BusinessWorks', rule: { type: 'edge', from: 'load-balancer', to: { type: 'legacy', label: ['tibco', 'businessworks'] } } },
      { label: 'Migrated Mule APIs never call BusinessWorks', rule: { type: 'no-path', from: ['experience-api', 'process-api'], to: { type: 'legacy', label: ['tibco', 'businessworks'] } } },
      { label: 'Mule Process and Experience APIs never touch the billing database directly', rule: { type: 'no-edge', from: ['process-api', 'experience-api'], to: 'oracle-db' } },
      { label: 'The migrated Process API reaches billing through a System API', rule: { type: 'path', from: 'process-api', via: 'system-api', to: 'oracle-db' } },
      { label: 'EMS events reach Anypoint MQ through a bridge', rule: { type: 'path', from: { type: 'queue', label: 'ems' }, via: { type: 'process-api', label: 'bridge' }, to: { type: ['queue', 'topic'], label: 'anypoint' } } },
      { label: 'Lines to and from queues and topics are async messages', rule: { type: 'lines', touching: ['queue', 'topic'], kind: 'async' } },
      { label: 'One Salesforce System API is shared by the migrated API and the migrated event consumer', rule: { type: 'each', of: { type: 'system-api', label: 'salesforce' }, edgeFrom: 'process-api', count: 2 } },
    ],
    reference: diagram(
      {
        agent: ['internal-app', 'Agent desktop (call centre)'],
        web: ['web-app', 'Self-care portal'],
        lb: ['load-balancer', 'Routing facade (F5, path rules)'],
        mexp: ['experience-api', 'exp-customer-api (migrated)'],
        bw: ['legacy', 'TIBCO BusinessWorks (not yet migrated)'],
        prc: ['process-api', 'prc-customer-account-api'],
        sbill: ['system-api', 'sys-billing-api'],
        bill: ['oracle-db', 'Billing DB (Oracle)'],
        scrm: ['system-api', 'sys-salesforce-api'],
        crm: ['crm', 'Salesforce'],
        ems: ['queue', 'TIBCO EMS order queues'],
        bridge: ['process-api', 'ems-to-anypoint-mq-bridge'],
        amq: ['queue', 'Anypoint MQ order-events'],
        cons: ['process-api', 'prc-order-events-api'],
      },
      [
        'agent -> lb', 'web -> lb', 'lb -> mexp', 'lb -> bw', 'mexp -> prc', 'prc -> sbill', 'prc -> scrm', 'sbill -> bill',
        'scrm -> crm', 'bw -> bill', 'bw ~> ems', 'ems ~> bridge', 'bridge ~> amq', 'amq ~> cons', 'cons -> scrm',
      ],
    ),
  },
  description: `
**Context.** A cable and broadband operator (4 million customers) runs its integrations on **TIBCO BusinessWorks 5** with **TIBCO EMS**:

- 220 BusinessWorks processes, of which about 90 expose SOAP or REST services used by the self-care portal, the call centre agent desktop and 30 internal apps.
- 300 EMS queues and topics carry order, provisioning and billing events.
- An F5 load balancer publishes the BusinessWorks services under \`services.example.com\`.
- Billing is a home-grown system on Oracle; CRM moved to Salesforce last year.

The TIBCO licence renewal is due in **20 months** and the board has decided not to renew. The integration team (12 people) is moving to Anypoint Platform. A previous attempt to rewrite everything in one release was cancelled after a year.

**Requirements**
- No consumer changes URLs during the migration.
- Services move one at a time, each with a rollback path.
- Order events published by BusinessWorks processes that are not yet migrated must reach new Mule consumers, and the other way round.
- By month 20, BusinessWorks and EMS are switched off.

**Observations from the inventory**
- 40 BusinessWorks processes are not called by anything in the last 90 days.
- Many services contain both billing logic and Salesforce calls in one process.
- EMS peak is 1,500 messages per second on the order topic during the evening.

**Your task.** Design the coexistence architecture (strangler) and the migration approach.
`,
  answerTemplate: `## Inventory and retirement candidates

## Routing facade

## API-led target for migrated services

## Messaging coexistence (EMS and Anypoint MQ)

## Sequencing over 20 months

## Risks
`,
  keyPoints: [
    'Use the inventory first: retire the 40 unused processes, and group the rest by business capability and consumer.',
    'The F5 becomes a routing facade: path rules send each migrated service to Mule and everything else to BusinessWorks, so URLs never change and rollback is a rule change.',
    'Migrated services follow API-led layers, with System APIs for billing and Salesforce; Mule never calls BusinessWorks, so finished capabilities do not depend on the old platform.',
    'A bridge flow moves events between EMS and Anypoint MQ (both directions as needed) until every producer and consumer of a topic is migrated.',
    'Sequence by capability with low-risk services first, and track the remaining BusinessWorks processes and EMS destinations as the burn-down measure.',
  ],
  solution: `
**Inventory.** Confirm unused processes from EMS and F5 statistics, then switch them off after a notice period. Map each remaining service to a capability (customer account, orders, billing, provisioning) and to its consumers.

**Routing facade.** The F5 keeps \`services.example.com\`. Path rules decide per operation: \`/customer/v1/accounts/*\` to the Mule ingress once migrated, all else to BusinessWorks. Rollback is reverting the rule. Where the Mule API has a new contract, the Experience API keeps the old one for existing consumers.

**Target.** \`exp-customer-api\` → \`prc-customer-account-api\` → \`sys-billing-api\` and \`sys-salesforce-api\`. A migrated service never calls BusinessWorks; if it needs something not yet migrated, that capability is moved first or a System API is built over the underlying system.

**Messaging.** \`ems-to-anypoint-mq-bridge\` uses the JMS connector with the EMS client libraries, consumes from EMS with client acknowledgement, and publishes to the Anypoint MQ exchange. A reverse bridge carries events from migrated producers back to EMS while old consumers remain. Each event keeps its message ID so consumers can drop duplicates. At 1,500 messages per second the bridge runs several replicas consuming from an EMS queue (not a topic subscription per replica) to avoid double delivery.

**Sequencing.**
- Months 1 to 3: platform, CI/CD, facade, bridge, first two low-risk services.
- Months 4 to 15: capability waves (customer account, orders, billing).
- Months 16 to 20: provisioning, last consumers off EMS, remove bridge, switch off TIBCO.

**Risks.** Hidden logic in BusinessWorks mappings (cover each service with recorded request and response tests before moving it); EMS features without a direct equivalent, such as selectors and message priority; and the deadline, which needs a fallback such as a short licence extension for a few processes.
`,
  followUps: [
    { q: 'Why must migrated Mule APIs never call BusinessWorks?', a: 'Each call back into BusinessWorks keeps that process alive and adds hops. It would leave capabilities half migrated at the licence deadline.' },
    { q: 'How do you prove a migrated service behaves like the old one?', a: 'Record real requests and responses from BusinessWorks, replay them against the Mule service, and compare results. Differences are fixed or accepted before the facade rule changes.' },
    { q: 'Why not let new consumers read EMS directly with the JMS connector?', a: 'They would depend on EMS and need changing again when it is switched off. Reading Anypoint MQ from day one means only the bridge is removed later.' },
    { q: 'What do you measure each month?', a: 'Remaining BusinessWorks processes and EMS destinations, traffic share through the Mule side of the facade, and incidents caused by migrated services.' },
  ],
}
