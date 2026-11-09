import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-086',
  category: 'case-studies',
  title: 'Insurer Moving Policy Administration From a Mainframe to a SaaS Platform Book by Book',
  level: 'ADVANCED',
  tags: ['insurance', 'policy-administration', 'migration', 'strangler', 'legacy', 'events', 'api-led'],
  estMinutes: 55,
  diagram: {
    task: 'draw the coexistence design: all channels on Experience APIs, one routing Process API that uses a migration register to send each request to the mainframe or the SaaS platform System API, both platforms publishing the same canonical policy events, and finance, reinsurance and the warehouse fed from those events. Add the book migration job.',
    checks: [
      { label: 'Customers, brokers and contact centre agents all use Experience APIs', rule: { type: 'each', of: ['web-app', 'partner', 'internal-app'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Experience APIs never call a policy System API directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The router looks up which platform holds each policy in a migration register', rule: { type: 'edge', from: { type: 'process-api', label: ['rout'] }, to: ['cache', 'database'] } },
      { label: 'The router can reach both the mainframe and the SaaS System APIs', rule: { type: 'each', of: { type: 'process-api', label: ['rout'] }, edgeTo: 'system-api', count: 2 } },
      { label: 'The mainframe is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The SaaS policy platform is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Both platform System APIs publish the same canonical policy events', rule: { type: 'each', of: { type: 'system-api', label: ['mainframe', 'policycenter'] }, min: 2, edgeTo: ['topic', 'event-stream'], kind: 'async' } },
      { label: 'Finance, reinsurance and the warehouse are fed from the events', rule: { type: 'edge', from: ['topic', 'event-stream'], kind: 'async', min: 3 } },
      { label: 'The migration job moves books through the System APIs', rule: { type: 'path', from: 'batch-job', via: 'system-api', to: 'saas' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Customer self-service'],
        brk: ['partner', 'Broker platforms'],
        agent: ['internal-app', 'Contact centre desktop'],
        ex: ['experience-api', 'exp-policy-servicing-api'],
        eb: ['experience-api', 'exp-broker-policy-api'],
        route: ['process-api', 'prc-policy-router'],
        reg: ['database', 'Migration register (policy to platform)'],
        mig: ['batch-job', 'Book migration job'],
        smf: ['system-api', 'sys-mainframe-policy-api'],
        spc: ['system-api', 'sys-policycenter-api'],
        tp: ['topic', 'policy-events (canonical)'],
        sfin: ['system-api', 'sys-finance-api'],
        sri: ['system-api', 'sys-reinsurance-api'],
        mf: ['legacy', 'Mainframe PAS (CICS / DB2)'],
        pc: ['saas', 'Guidewire PolicyCenter (cloud)'],
        erp: ['erp', 'SAP finance'],
        ri: ['database', 'Reinsurance accounting'],
        dw: ['data-warehouse', 'Actuarial data warehouse'],
      },
      [
        'web -> ex', 'agent -> ex', 'brk -> eb', 'ex -> route', 'eb -> route', 'route -> reg', 'route -> smf', 'route -> spc',
        'smf -> mf', 'spc -> pc', 'smf ~> tp', 'spc ~> tp', 'tp ~> sfin', 'tp ~> sri', 'tp ~> dw',
        'sfin -> erp', 'sri -> ri', 'mig -> smf', 'mig -> spc', 'mig -> reg',
      ],
    ),
  },
  description: `
**Context.** A general insurer has 3.2 million home, motor and pet policies on a 30 year old mainframe policy administration system (CICS, DB2, COBOL). It has bought Guidewire PolicyCenter (cloud) and plans to move the books over 3 years: pet first (200,000 policies), then home, then motor.

**What depends on the mainframe today**
- Customer self-service, the contact centre desktop and 300 broker platforms read and change policies through screen-scraping and MQ messages.
- SAP finance, the reinsurance accounting database and the actuarial warehouse get nightly extracts from DB2.
- 40 batch jobs run renewals, cancellations for non-payment and regulatory reports.

**Rules for the programme**
- A policy lives on exactly one platform at a time. Policies move at renewal so the customer gets one clean document.
- Channels must not need to know where a policy lives; a broker calls the same API before and after the move.
- Finance and reinsurance must see one consistent view of all policies throughout.
- The mainframe is frozen except for regulatory changes. Its MIPS bill is 9 million EUR a year and must not grow.
- Each book move must be reversible for 30 days.

**Your task.** Design the integration architecture for the 3 year coexistence and the migration of each book.
`,
  answerTemplate: `## Coexistence principles

## Channels and routing

## The migration register

## Canonical policy events and downstream feeds

## Moving a book

## Rollback

## Protecting the mainframe

## Risks
`,
  keyPoints: [
    'Channels call stable Experience APIs; one routing Process API decides per policy which platform to call, using a migration register.',
    'Each platform has its own System API that maps to a shared canonical policy model, so channels and the router never see platform formats.',
    'Both System APIs publish the same canonical policy events, so finance, reinsurance and the warehouse consume one stream whatever the platform.',
    'Books move at renewal by a migration job that reads from the mainframe API, loads PolicyCenter through its API, and flips the register entry.',
    'Rollback is a register flip back plus a reverse load for policies changed after the move; mainframe calls are cached and limited to protect MIPS.',
  ],
  solution: `
**Principles.** One platform per policy; a stable canonical policy contract; platform knowledge only in System APIs and the router; one event stream for downstream systems.

**Routing.** \`prc-policy-router\` takes a policy number, reads the register (\`policyNumber → platform, movedAt, book\`), and calls \`sys-mainframe-policy-api\` or \`sys-policycenter-api\`. New business for a migrated book goes to PolicyCenter by product rule. Searches across both platforms (for example by customer) call both and merge.

**Register.** A small database owned by the migration team, cached in the router for 60 seconds. It is the single truth for where a policy lives; every flip is audited.

**Events.** \`PolicyIssued\`, \`PolicyChanged\`, \`PolicyRenewed\`, \`PolicyCancelled\` in one canonical schema. The mainframe API publishes them from DB2 change data capture; the PolicyCenter API publishes them from PolicyCenter messaging. Finance, reinsurance and the warehouse each have their own subscription. The nightly extracts stop per book once its events are trusted.

**Moving a book.** 60 days before renewal the job extracts each policy, maps it, loads it into PolicyCenter as a future-dated renewal and reconciles counts and premiums. At renewal the register flips. The mainframe record is closed but kept read-only.

**Rollback.** Within 30 days, flip the register back and replay changes made in PolicyCenter to the mainframe through its API. After 30 days the move is final.

**Mainframe protection.** Cache reads with a short TTL, cap concurrent calls in the System API, and run migration extracts at night.

**Risks.** Policies changed on both platforms during the move (freeze changes for 1 hour per batch), downstream double counting when a policy moves (the event carries the platform and a move marker), and register errors (reconcile register against both platforms daily).
`,
  followUps: [
    { q: 'Why put the routing in a Process API and not in each Experience API?', a: 'There is one rule for where a policy lives. A single router keeps that rule in one place and lets the migration team change it without touching channels.' },
    { q: 'How do finance and reinsurance avoid seeing a policy twice during a move?', a: 'Both platforms publish one canonical schema with the platform and a move marker, so consumers close the mainframe record and open the PolicyCenter one as a transfer, not as new business.' },
    { q: 'Why move policies at renewal?', a: 'The customer gets one document from one platform, mid-term adjustments are avoided, and premium and cover start fresh on the new system.' },
    { q: 'What makes the register risky, and how do you control it?', a: 'A wrong entry sends changes to the wrong platform. Flips are audited and done only by the migration job, and a daily reconciliation compares the register with both platforms.' },
  ],
}
