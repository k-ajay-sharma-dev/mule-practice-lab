import { diagram } from '../../arch/dsl.js'

const boards = { name: 'job boards', from: 'partner', rps: 5, spikes: [{ at: 5, forMin: 20, rps: 80 }], to: 'saas', kind: 'write' }

export default {
  id: 'uc-133',
  category: 'use-cases',
  title: 'Job Board Applications Into the Hiring System: One Intake API for Five Boards, a Queue for the Monday Rush, and a Limit for a Board Gone Wrong',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'partner-api', 'rate-limit', 'anypoint-mq', 'dlq', 'load-levelling', 'hr', 'recruitment'],
  estMinutes: 30,
  diagram: {
    task: 'draw the intake path: the job boards call an API gateway with a client ID and a rate limit, then an applications Experience API that puts each application on a queue with a dead-letter queue. A Process API takes them from the queue and creates candidates in the hiring system through a System API.',
    checks: [
      { label: 'The job boards call the API gateway', rule: { type: 'edge', from: 'partner', to: 'api-gateway' } },
      { label: 'The Experience API is reached only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'Applications wait on a queue before they reach the hiring system', rule: { type: 'path', from: 'experience-api', via: 'queue', to: 'saas' } },
      { label: 'No job board waits on the hiring system', rule: { type: 'no-path', from: 'partner', to: 'saas', kind: 'sync' } },
      { label: 'The hiring system is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        jb: ['partner', 'Five job boards'],
        gw: ['api-gateway', 'API gateway', { auth: 'client-id', rateLimit: 100 }],
        exp: ['experience-api', 'exp-job-applications', { vCores: '0.5' }],
        q: ['queue', 'new-applications', { maxRedelivery: 30 }],
        dlq: ['dlq', 'new-applications DLQ'],
        prc: ['process-api', 'prc-candidate-intake'],
        sys: ['system-api', 'sys-hiring-system'],
        ats: ['saas', 'Hiring system (applicant tracking)'],
      },
      ['jb -> gw', 'gw -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> ats'],
    ),
    simulation: {
      systems: [{ match: 'saas', latencyMs: 500, maxRps: 20 }],
      tests: [
        {
          name: 'Monday morning',
          about: 'Weekend applications arrive at 09:00 Monday: 80 a second for 20 minutes. Every board gets its answer at once, the hiring system never takes more than its 20 a second, and every application arrives within two hours.',
          traffic: [boards],
          durationMin: 150,
          expect: {
            answers: [{ minSuccess: 0.99, maxMs: 300 }],
            peakRps: [{ node: 'saas', max: 20 }],
            delivered: [{ to: 'saas', min: 0.99 }],
            lost: { max: 0 },
            backlog: [{ queue: 'queue', maxEnd: 0 }],
          },
        },
        {
          name: 'A board stuck in a retry loop',
          about: 'One board\'s release sends every application again and again: 400 calls a second for 10 minutes. The gateway answers most of them with 429, and the Mule apps stay within their size.',
          traffic: [{ name: 'broken board', from: 'partner', rps: 400, forMin: 10, to: 'saas', kind: 'write' }],
          durationMin: 15,
          expect: { answers: [{ minLimited: 0.7 }], peakRps: [{ node: 'experience-api', max: 110 }] },
        },
        {
          name: 'A CV the hiring system cannot read',
          about: 'One application in 100 carries a file the hiring system refuses every time. Those applications move to the dead-letter queue for the recruiting team, and the rest arrive.',
          traffic: [{ ...boards, poison: 0.01 }],
          durationMin: 180,
          expect: { delivered: [{ to: 'saas', min: 0.98 }], dlq: { min: 100 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A hospital group recruits nurses and support staff through **five job boards**. Each board posts every application to the group's **hiring system**, a SaaS applicant tracking product. Today each board calls the hiring system's API directly with its own login.

The hiring system allows about **20 calls a second**. Most of the week the boards send about 5 applications a second. At 09:00 on Monday they release the weekend's applications: about **80 a second for 20 minutes**. The hiring system answers 429, some boards give up, and candidates are lost without anyone knowing.

Last month one board's new release resent the same applications in a loop, about **400 calls a second**, and the hiring system blocked the group's whole account for an hour.

About 1 application in 100 has a CV file the hiring system refuses every time.

Requirements:
- A board gets its answer within 300 ms, even on Monday morning. No application may be lost.
- Every application of the Monday rush reaches the hiring system within two hours, and the hiring system never gets more than 20 calls a second.
- A board stuck in a loop gets 429 for most of its calls, so that no more than about 100 calls a second reach the Mule apps.

**Questions:**
- Draw one intake for all five boards.
- How does the Monday rush reach the hiring system without going over its limit?
- How do you stop one broken board from hurting the others and the hiring system?
- What happens to an application the hiring system refuses every time?
`,
  answerTemplate: `## Design

## The Monday rush

## A board gone wrong

## Refused applications
`,
  keyPoints: [
    'Give the boards one API behind a gateway. Each board has its own client ID, so the group knows who sent what and can switch one off.',
    'The Experience API puts each application on a queue and answers at once. Boards never wait on the hiring system.',
    'A consumer takes applications from the queue at the pace the hiring system allows. The queue absorbs the Monday rush.',
    'A rate limit at the gateway answers 429 to a board that sends far too much, before it costs Mule capacity or the hiring system\'s limit.',
    'A redelivery limit and a dead-letter queue keep a refused application for the recruiting team instead of retrying it for ever.',
    'Size the Experience API for what the gateway lets through, not for what a broken board sends.',
  ],
  solution: `
**Design**
\`\`\`
Job boards ─► API gateway (client ID, rate limit) ─► exp-job-applications ~► new-applications ~► prc-candidate-intake ─► sys-hiring-system ─► Hiring system
                                                                                   ~► DLQ
\`\`\`

**The Monday rush.** 80 applications a second for 20 minutes is about 96,000 applications. The boards get an answer as soon as each one is on the queue. \`prc-candidate-intake\` sends them at about 20 a second, so the queue empties in under two hours. Candidates see a confirmation from the board at once, and recruiters see them in the hiring system the same morning.

**A board gone wrong.** The gateway has a rate limit of 100 calls a second, above the Monday peak. A loop of 400 a second gets 429 for three quarters of its calls. In a real deployment, put the limit on each board's contract through its client ID, so one board's loop does not use the others' share. This model applies one limit to the gateway.

**Refused applications.** After 30 failed deliveries an application moves to the DLQ. The recruiting team asks the candidate for a new file.

**Sizing.** The Experience API takes up to 100 calls a second, so half a vCore in this model.
`,
  followUps: [
    {
      q: 'The same application arrives twice. What then?',
      a: 'Give each application the board\'s own ID and the board name. The Process API checks the hiring system, or a small store of recent IDs, before it creates a candidate.',
    },
    {
      q: 'Should the boards get the hiring system\'s candidate ID back?',
      a: 'Not in the first answer, since it does not exist yet. Return an intake ID, and offer a status call or a callback if a board needs the outcome.',
    },
  ],
}
