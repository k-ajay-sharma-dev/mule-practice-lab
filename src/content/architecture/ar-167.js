import { diagram } from '../../arch/dsl.js'

const stock = { type: 'erp', label: 'stock' }
const reports = { type: 'erp', label: 'report' }
const lookups = { name: 'stock lookups', from: { type: 'internal-app', label: 'staff' }, rps: 200, to: stock }
const finance = { name: 'finance reports', from: { type: 'internal-app', label: 'finance' }, rps: 40, to: reports }

export default {
  id: 'ar-167',
  category: 'architecture',
  title: 'Finance Reports That Take Eight Seconds Starve the Store Stock Lookups: Give Each Kind of Work Its Own System API, So Slow Calls Cannot Use Up the Threads of Fast Ones',
  level: 'ADVANCED',
  tags: ['bulkhead', 'threads', 'system-api', 'erp', 'isolation', 'retail'],
  estMinutes: 40,
  diagram: {
    task: 'draw the store staff app calling its Experience API, and the finance reporting tool calling its own. Draw the ERP stock service and the ERP report service, each reached through its own System API.',
    checks: [
      { label: 'The staff app calls an Experience API', rule: { type: 'edge', from: { type: 'internal-app', label: 'staff' }, to: 'experience-api' } },
      { label: 'The finance tool calls an Experience API', rule: { type: 'edge', from: { type: 'internal-app', label: 'finance' }, to: 'experience-api' } },
      { label: 'The stock service is reached only through a System API', rule: { type: 'only-via', target: stock, from: 'system-api' } },
      { label: 'The report service is reached only through a System API', rule: { type: 'only-via', target: reports, from: 'system-api' } },
      { label: 'No System API serves both the stock service and the report service', rule: { type: 'each', of: 'system-api', edgeTo: 'erp', max: 1, min: 2 } },
      { label: 'Stock lookups never pass through anything that reaches the report service', rule: { type: 'no-path', from: { type: 'internal-app', label: 'staff' }, to: reports } },
    ],
    reference: diagram(
      {
        staff: ['internal-app', 'Store staff app'],
        fin: ['internal-app', 'Finance reporting tool'],
        expS: ['experience-api', 'exp-store-staff', { replicas: 2, vCores: '0.5' }],
        expF: ['experience-api', 'exp-finance-reports', { vCores: '1' }],
        sysS: ['system-api', 'sys-erp-stock', { replicas: 2, vCores: '0.5' }],
        sysR: ['system-api', 'sys-erp-reports', { vCores: '1', timeoutMs: 15000 }],
        erpS: ['erp', 'ERP stock service'],
        erpR: ['erp', 'ERP report service'],
      },
      ['staff -> expS', 'fin -> expF', 'expS -> sysS', 'expF -> sysR', 'sysS -> erpS', 'sysR -> erpR'],
    ),
    simulation: {
      systems: [
        { match: stock, latencyMs: 50 },
        { match: reports, latencyMs: 8000 },
      ],
      tests: [
        {
          name: 'A Monday morning',
          about: 'Store staff look up stock 200 times a second while finance runs 40 reports a second. Lookups are answered fast, and the reports finish.',
          traffic: [lookups, finance],
          durationMin: 20,
          expect: { answers: [{ flow: 'stock lookups', minSuccess: 0.99, maxMs: 300 }, { flow: 'finance reports', minSuccess: 0.95 }] },
        },
        {
          name: 'The report service slows to 20 seconds',
          about: 'A big month-end query makes the report service take 20 seconds. Reports time out, but stock lookups are not slowed at all.',
          traffic: [lookups, finance],
          incidents: [{ slow: reports, latencyMs: 20000, at: 5, forMin: 10 }],
          durationMin: 20,
          expect: { answers: [{ flow: 'stock lookups', minSuccess: 0.99, maxMs: 300 }] },
        },
      ],
    },
  },
  description: `
A DIY retailer's **ERP** offers two services that Mule calls: the **ERP stock service**, which answers stock questions in about 50 ms, and the **ERP report service**, which builds finance reports and takes about **8 seconds**.

Today one System API, \`sys-erp\`, calls both. The **store staff app** uses it for stock lookups, and the **finance reporting tool** for reports. Every month end, the stores report that the staff app hangs. The ERP stock service is healthy at those times. The monitoring shows \`sys-erp\` with spare CPU but every thread busy, waiting on reports.

**Numbers**
- Stock lookups: about **200 a second**, each about 50 ms in the ERP.
- Finance reports: up to **40 a second** at month end, each about 8 seconds, sometimes 20.
- In this model each replica has 128 threads plus 256 per vCore, and each call holds a thread until its answer comes back.

**Questions:**
- Draw the design.
- Why do the lookups hang when the CPU is not busy?
- How does your design keep reports from affecting lookups?
- What timeout should each System API use?
`,
  answerTemplate: `## Design

## Why the lookups hang

## Keeping the work apart

## Timeouts
`,
  keyPoints: [
    'A call holds a thread for as long as it waits. 40 reports a second that take 8 seconds each hold about 320 threads at once, whatever the CPU is doing.',
    'When fast and slow calls share one pool, the slow ones take the threads and the fast ones queue behind them. That is why the lookups hang.',
    'Give each kind of work its own System API: its own threads, its own size, its own timeout. That is the bulkhead pattern.',
    'A slow report service can then use up only the report System API. Stock lookups never wait on it.',
    'Set each timeout from its own work: about a second for stock, about 15 seconds for reports, not one value for both.',
  ],
  solution: `
**Design**
\`\`\`
Store staff app ────────► exp-store-staff ─────► sys-erp-stock ───► ERP stock service
Finance reporting tool ─► exp-finance-reports ─► sys-erp-reports ─► ERP report service
\`\`\`

**Why the lookups hang.** By Little's law, threads in use = rate × time. Reports need 40 × 8 = 320 threads at once, 800 when they take 20 seconds. A 1 vCore replica has 384 in this model. The lookups need 200 × 0.05 = 10, but they find none free.

**Keeping the work apart.** \`sys-erp-stock\` and \`sys-erp-reports\` are two apps. Each has its own replicas and threads. The report APIs get 1 vCore each, so their 384 threads cover the 320 that month-end reports hold. Two replicas of the stock API keep the stores going through a zone outage.

**Timeouts.** The stock API uses a short timeout, so a stuck call is dropped fast. The reports API uses 15 seconds: long enough for a normal report, short enough that a stuck one frees its thread. When the report service slows to 20 seconds, reports fail; the finance tool should start them as jobs instead, which is the next step for that team.

**Why not a bigger shared API.** More vCores would raise the thread count, but reports would still grow into whatever is there, and one bad month end would hang the stores again.
`,
  followUps: [
    {
      q: 'Can the bulkhead be inside one app instead of two?',
      a: 'Partly. Separate HTTP Request configurations with their own connection limits, or a capped Async scope for reports, limit how much the reports take. Separate apps also give separate scaling and deployments, which is clearer.',
    },
    {
      q: 'The ERP itself has a limited number of sessions. Does splitting the System APIs help there?',
      a: 'Only if each System API gets its own share of sessions. Agree a limit for reports with the ERP team, so they cannot use every ERP session at month end either.',
    },
  ],
}
