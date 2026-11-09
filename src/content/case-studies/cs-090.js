import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-090',
  category: 'case-studies',
  title: 'Banking Group Separating Ring-Fenced Retail Bank Integrations From Its Investment Bank',
  level: 'EXPERT',
  tags: ['banking', 'ring-fencing', 'compliance', 'governance', 'api-management', 'segregation', 'api-led'],
  estMinutes: 60,
  diagram: {
    task: 'draw the separated estate: investment bank apps reach retail data only through the retail bank gateway and its group services Experience API, the retail app uses its own Experience API, retail systems sit behind retail System APIs, retail queues are not shared with the investment bank, and the group sanctions service is shared through one group System API.',
    checks: [
      { label: 'Investment bank components reach retail core banking only through the retail bank gateway', rule: { type: 'no-path', from: { label: ['investment'] }, to: { type: 'legacy', label: ['retail'] }, unless: { type: 'api-gateway', label: ['retail'] } } },
      { label: 'The retail bank gateway exposes only the group services Experience API', rule: { type: 'only-via', target: { type: 'experience-api', label: ['group'] }, from: { type: 'api-gateway', label: ['retail'] } } },
      { label: 'The retail bank gateway never forwards straight to Process APIs, System APIs or systems', rule: { type: 'no-edge', from: { type: 'api-gateway', label: ['retail'] }, to: ['process-api', 'system-api', 'legacy', 'crm', 'queue', 'topic'] } },
      { label: 'Retail core banking is reached only through a retail System API', rule: { type: 'only-via', target: { type: 'legacy', label: ['retail'] }, from: { type: 'system-api', label: ['retail'] } } },
      { label: 'The investment bank never publishes to a retail queue', rule: { type: 'no-edge', from: { label: ['investment'] }, to: { type: ['queue', 'topic'], label: ['retail'] } } },
      { label: 'The investment bank never consumes from a retail queue', rule: { type: 'no-edge', from: { type: ['queue', 'topic'], label: ['retail'] }, to: { label: ['investment'] } } },
      { label: 'Retail channels have no route into investment bank systems', rule: { type: 'no-path', from: 'mobile-app', to: { label: ['investment'] } } },
      { label: 'The retail app reaches retail core banking through its own Experience API', rule: { type: 'path', from: 'mobile-app', via: 'experience-api', to: { type: 'legacy', label: ['retail'] } } },
      { label: 'Both banks use the shared sanctions service through one group System API', rule: { type: 'each', of: { type: 'system-api', label: ['group'] }, edgeFrom: 'process-api', count: 2 } },
      { label: 'Every line into or out of a retail queue is an async message', rule: { type: 'lines', touching: ['queue', 'topic'], kind: 'async' } },
    ],
    reference: diagram(
      {
        ibapp: ['internal-app', 'Investment bank onboarding desk'],
        ibp: ['process-api', 'prc-investment-client-onboarding'],
        ibsys: ['system-api', 'sys-investment-trade-api'],
        ibcore: ['legacy', 'Investment bank trade store'],
        gwr: ['api-gateway', 'Retail bank API gateway (contracts, mTLS)'],
        rexp: ['experience-api', 'exp-retail-group-services-api'],
        rmob: ['mobile-app', 'Retail banking app'],
        rexp2: ['experience-api', 'exp-retail-mobile-api'],
        rprc: ['process-api', 'prc-retail-customer-api'],
        rsys: ['system-api', 'sys-retail-core-banking-api'],
        rcrm: ['system-api', 'sys-retail-crm-api'],
        rq: ['queue', 'retail.payments'],
        rpay: ['system-api', 'sys-retail-payments-api'],
        sscr: ['system-api', 'sys-group-screening-api'],
        rcore: ['legacy', 'Retail core banking'],
        crm: ['crm', 'Retail CRM'],
        hub: ['payment', 'Retail payment scheme gateway'],
        scr: ['saas', 'Group sanctions screening'],
      },
      [
        'ibapp -> ibp', 'ibp -> ibsys', 'ibsys -> ibcore', 'ibp -> gwr', 'gwr -> rexp', 'rexp -> rprc',
        'rmob -> rexp2', 'rexp2 -> rprc', 'rprc -> rsys', 'rsys -> rcore', 'rprc -> rcrm', 'rcrm -> crm',
        'rprc ~> rq', 'rq ~> rpay', 'rpay -> hub', 'ibp -> sscr', 'rprc -> sscr', 'sscr -> scr',
      ],
    ),
  },
  description: `
**Context.** A UK banking group must keep its retail bank ring-fenced from its investment bank. The ring-fenced bank (retail, 9 million customers) has to be able to keep operating if the rest of the group fails, and its data and services cannot depend on investment bank entities. The legal entities were split in 2019, but the integration estate was not.

**What an internal audit found**
- One Anypoint organisation with one set of environments. Retail and investment bank Mule apps share CloudHub workers, Anypoint MQ queues and a common \`sys-customer-api\` that reads both banks' customer databases.
- The investment bank's client onboarding flow reads retail customer data (for private banking clients who are also retail customers) straight from the retail core System API.
- An investment bank batch job consumes from \`retail.payments\` to build a liquidity report.
- Group sanctions screening is a shared service run by a group service company, which the regulator accepts under a documented arrangement.

**Requirements**
- The retail bank owns, runs and can operate its integrations without the investment bank.
- Any investment bank access to retail data goes through a documented, contracted API with its own credentials, logging and the option to switch it off.
- No shared queues, credentials or runtime capacity across the two banks.
- Group shared services (sanctions screening) stay shared, consumed by both banks through a governed API.
- The change must happen over 12 months without stopping either bank.

**Your task.** Design the target integration estate and the plan to separate it.
`,
  answerTemplate: `## Separation principles

## Platform separation (organisations, environments, runtimes)

## Retail data access for the investment bank

## Messaging and batch dependencies

## Shared group services

## Separation plan over 12 months

## Governance and evidence for the regulator

## Risks
`,
  keyPoints: [
    'Separate Anypoint business groups (or organisations), environments, private spaces and credentials for the retail bank, owned and run by retail bank staff.',
    'The investment bank reaches retail data only through a retail gateway and a dedicated group services Experience API with a contract, its own client ID, logging and a kill switch.',
    'Retail systems are reached only through retail System APIs; the shared sys-customer-api is split per bank.',
    'No investment bank component publishes to or consumes from retail queues; the liquidity report gets a published extract or event feed through the contracted API.',
    'Shared group services are consumed by both banks through one group System API under a documented service arrangement.',
  ],
  solution: `
**Principles.** Ring-fenced first: the retail estate must work on its own. Crossing the line happens only through a contracted API, never through shared infrastructure.

**Platform.** A retail business group with its own environments, CloudHub 2.0 private spaces, Anypoint MQ regions and secrets. Separate CI/CD pipelines and an operations team in the retail entity. The investment bank keeps its own business group. The root organisation admin is limited to a few group platform staff under a documented arrangement.

**Retail data for the investment bank.** \`exp-retail-group-services-api\` behind the retail gateway exposes only what the arrangement allows (for example customer identity and products held for joint clients). The investment bank gets its own client ID and contract, data is minimised, every call is logged, and the retail bank can revoke the contract.

**Messaging.** The investment bank consumer on \`retail.payments\` is removed. The liquidity report gets a daily aggregate through the group services API. Queues are re-created in the retail business group only.

**Shared services.** \`sys-group-screening-api\` is run by the group service company, consumed by both banks with separate client IDs and SLAs. The retail bank keeps a fallback (hold payments) if it becomes unavailable.

**Plan.** Months 1 to 2: inventory every app, queue, credential and cross-bank call. Months 2 to 5: build the retail platform and split \`sys-customer-api\`. Months 5 to 9: move retail apps, cut over cross-bank calls to the contracted API. Months 9 to 12: remove shared queues and credentials, prove separation with a test that disables all investment bank access.

**Evidence.** API Manager contracts and logs, a dependency map reviewed quarterly, and the results of the separation test.

**Risks.** Hidden dependencies (inventory from runtime traffic, not only documents), the investment bank losing data it needs (agree the API scope early), and duplicated platform cost (accepted as the cost of ring-fencing).
`,
  followUps: [
    { q: 'Why is a shared Anypoint MQ queue a ring-fencing problem even if access is read-only?', a: 'The retail bank\'s payments flow then shares infrastructure and credentials with the investment bank. A failure, change or outage on that side can affect retail, and access cannot be cut off without touching the retail flow.' },
    { q: 'How do you prove to the regulator that the retail estate can run alone?', a: 'Run a test that revokes every investment bank contract and credential and shows retail flows keep working, and keep the dependency map and API logs as evidence.' },
    { q: 'Why keep sanctions screening shared?', a: 'It is a group service run under a documented arrangement. Both banks consume it through a governed API, and retail has a fallback if it fails.' },
    { q: 'What is the first step of the separation plan, and why?', a: 'Build an inventory from runtime traffic, credentials and queue consumers. Documents miss hidden dependencies such as the liquidity job.' },
  ],
}
