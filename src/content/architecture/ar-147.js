import { diagram } from '../../arch/dsl.js'

const northbay = { name: 'Northbay customers', from: { type: 'mobile-app', label: 'Northbay' }, rps: 150, to: { type: 'legacy', label: 'Northbay' } }
const crestwell = { name: 'Crestwell customers', from: { type: 'mobile-app', label: 'Crestwell' }, rps: 80, to: { type: 'legacy', label: 'Crestwell' } }

export default {
  id: 'ar-147',
  category: 'architecture',
  title: 'Two Building Societies Merge: One Accounts API for Both Apps, Two Core Systems Kept Apart Behind It',
  level: 'ADVANCED',
  tags: ['merger', 'api-led', 'facade', 'bulkhead', 'timeouts', 'banking'],
  estMinutes: 40,
  diagram: {
    task: 'draw the accounts landscape after the merger: the Northbay app and the Crestwell app both calling one accounts Experience API, one accounts Process API that reads the customer directory to find which core holds an account, and one System API for each core banking system. Draw each core as a Legacy box, and put the brand name in the name of each app and each core. Name the directory database customer directory. Set a timeout on each System API, and size the shared APIs so a slow core cannot use up their threads.',
    checks: [
      { label: 'One Experience API serves both brands\' apps', rule: { type: 'each', of: 'experience-api', edgeFrom: 'mobile-app', count: 2, some: true } },
      { label: 'One accounts Process API calls the System APIs of both cores', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api', count: 2, some: true } },
      { label: 'The Process API reads the customer directory to choose the core', rule: { type: 'edge', from: 'process-api', to: { type: 'database', label: 'directory' } } },
      { label: 'Each core banking system has its own System API', rule: { type: 'each', of: 'legacy', min: 2, edgeFrom: 'system-api', max: 1 } },
      { label: 'No System API calls both cores', rule: { type: 'each', of: 'system-api', min: 2, edgeTo: 'legacy', max: 1 } },
      { label: 'The cores are reached only through their System APIs', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The apps never call a core or a System API directly', rule: { type: 'no-edge', from: 'mobile-app', to: ['system-api', 'legacy'] } },
    ],
    reference: diagram(
      {
        appN: ['mobile-app', 'Northbay app'],
        appC: ['mobile-app', 'Crestwell app'],
        exp: ['experience-api', 'exp-accounts-mobile', { replicas: 2, vCores: '1' }],
        prc: ['process-api', 'prc-accounts', { replicas: 2, vCores: '1' }],
        dir: ['database', 'Customer directory (which core holds each account)'],
        sysN: ['system-api', 'sys-core-northbay', { vCores: '0.5', timeoutMs: 2000 }],
        sysC: ['system-api', 'sys-core-crestwell', { vCores: '0.5', timeoutMs: 2000 }],
        coreN: ['legacy', 'Northbay core banking'],
        coreC: ['legacy', 'Crestwell core banking'],
      },
      ['appN -> exp', 'appC -> exp', 'exp -> prc', 'prc -> dir', 'prc -> sysN', 'prc -> sysC', 'sysN -> coreN', 'sysC -> coreC'],
    ),
    simulation: {
      systems: [
        { match: { type: 'legacy', label: 'Northbay' }, latencyMs: 300 },
        { match: { type: 'legacy', label: 'Crestwell' }, latencyMs: 500 },
        { match: 'database', latencyMs: 5 },
      ],
      tests: [
        {
          name: 'Payday morning',
          about: 'Northbay customers check balances 150 times a second and Crestwell customers 80 times. Both brands are answered within a second.',
          traffic: [northbay, crestwell],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1000 }] },
        },
        {
          name: 'The Crestwell core is slow for 20 minutes',
          about: 'The Crestwell core takes 8 seconds per call while it runs a batch. Crestwell requests give up after the System API timeout, and Northbay customers do not notice.',
          traffic: [northbay, crestwell],
          incidents: [{ slow: { type: 'legacy', label: 'Crestwell' }, latencyMs: 8000, at: 5, forMin: 20 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'Northbay customers', minSuccess: 0.99, maxMs: 1000 }] },
        },
        {
          name: 'The Crestwell core is down for maintenance',
          about: 'The Crestwell core is stopped for 30 minutes. Crestwell balances are not available, and Northbay customers are served as usual.',
          traffic: [northbay, crestwell],
          incidents: [{ down: { type: 'legacy', label: 'Crestwell' }, at: 5, forMin: 30 }],
          durationMin: 40,
          expect: { answers: [{ flow: 'Northbay customers', minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Two building societies, **Northbay** and **Crestwell**, have merged. Each brand keeps its own app for now, and each app talks to its own **core banking system**. Moving all accounts onto one core will take about two years.

The board wants one thing sooner: **one accounts API** that both apps, and the new joint website after them, can call for balances and transactions. The app teams do not want to know which core an account lives on.

What the team knows:
- A **customer directory** database, built during the merger, says which core holds each account.
- The Northbay core answers in about **300 ms**. The Crestwell core answers in about **500 ms**, but while it runs its daytime batch it takes up to **8 seconds** per call for 20 minutes or so.
- At peak, Northbay customers make about **150** balance requests a second and Crestwell customers about **80**.
- The Crestwell core is stopped for maintenance one evening a month.
- The apps show "balance not available, try again shortly" when an answer takes more than **2 seconds**, so waiting longer than that on a core helps nobody.

A first design had one System API calling both cores. In testing, a slow Crestwell core held that API's threads, and Northbay customers' balances failed too.

**Questions:**
- Draw the API-led design for one accounts API over two cores.
- Where does the decision "which core" live, and why there?
- How do you stop one core's problems from reaching the other brand's customers?
- What changes when the accounts move to one core?
`,
  answerTemplate: `## Design

## Choosing the core

## Keeping the cores apart

## Sizing

## When the cores are merged
`,
  keyPoints: [
    'Put one Experience and one Process API in front of both cores, so the channels see one accounts API from day one.',
    'The Process API reads the customer directory and routes each request to the right core. That rule lives in one place.',
    'Give each core its own System API. Its threads, timeouts and deployments then belong to that core only, like a bulkhead in a ship.',
    'Set a short timeout in each System API. A core that answers in 8 seconds then fails fast instead of holding threads for 8 seconds.',
    'Threads held by slow calls run out long before the CPU does. Size the shared APIs for the longest call they wait on.',
    'When accounts move to one core, only the directory and the System APIs change. The apps and the Experience API do not.',
  ],
  solution: `
**Design**
\`\`\`
Northbay app  ─┐
               ├─► exp-accounts-mobile ─► prc-accounts ─┬─► Customer directory
Crestwell app ─┘                                        ├─► sys-core-northbay  ─► Northbay core banking
                                                        └─► sys-core-crestwell ─► Crestwell core banking
\`\`\`

**Choosing the core.** \`prc-accounts\` looks the account up in the customer directory and calls the System API for that core. The rule is business logic about the merged company, so it sits in the Process API. The System APIs each know one core and nothing about the other.

**Keeping the cores apart.**
- Two System APIs, deployed separately. A slow Crestwell core can only use up the threads of \`sys-core-crestwell\`.
- A 2 second timeout in each System API. When the Crestwell core takes 8 seconds, its calls fail after 2 seconds. Crestwell customers see "balance not available, try again shortly" for those 20 minutes, which is better than an app that hangs.
- The shared Experience and Process APIs still wait up to 2 seconds on each Crestwell call. Give them enough replicas for that: two replicas of one vCore each in this model. Without the timeout they would wait 8 seconds, run out of threads, and fail Northbay requests too.

**Sizing.** \`sys-core-northbay\` serves 150 requests a second and \`sys-core-crestwell\` 80, so half a vCore each. The shared APIs serve 230 a second, but their threads are held up to 2 seconds during a slow spell, so two replicas each.

**When the cores are merged.** Accounts move in waves. After each wave the directory points those accounts at the Northbay core. When the directory no longer names Crestwell, \`sys-core-crestwell\` and the Crestwell core are switched off. The apps never change.
`,
  followUps: [
    {
      q: 'Why not route in the Experience API instead?',
      a: 'The new joint website will need the same rule. In the Process API it is written once and shared by every channel.',
    },
    {
      q: 'Would a circuit breaker help when the Crestwell core is slow?',
      a: 'A breaker trips on failures. Slow answers that still come back are not failures, so the timeout is what turns them into fast errors. With both, the breaker then stops calling the core for a while.',
    },
    {
      q: 'What if a customer has accounts on both cores?',
      a: 'The directory returns both, the Process API calls both System APIs, ideally in parallel, and merges the lists. If one core does not answer, return the other accounts with a note that some are missing.',
    },
  ],
}
