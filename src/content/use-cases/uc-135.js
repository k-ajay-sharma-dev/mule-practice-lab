import { diagram } from '../../arch/dsl.js'

const policies = { type: 'database', label: 'policy' }
const customers = { name: 'customers', from: ['mobile-app', 'web-app'], rps: 3, to: [policies, 'legacy'], kind: 'write' }
const agents = { name: 'call centre', from: 'internal-app', rps: 1, to: [policies, 'legacy'], kind: 'write' }
const storm = (f, rps) => ({ ...f, spikes: [{ at: 10, forMin: 45, rps }] })

export default {
  id: 'uc-135',
  category: 'use-cases',
  title: 'A Storm Hits: Car Insurance Claims Jump From 4 to 135 a Second, Every Customer Gets a Claim Number at Once, and the Claims Core Takes Them at Its Own Pace',
  level: 'EXPERT',
  tags: ['myproject', 'insurance', 'load-levelling', 'anypoint-mq', 'dlq', 'read-model', 'process-api', 'spike'],
  estMinutes: 60,
  diagram: {
    task: 'draw the first notice of loss path: the customer app and the claims website call a digital Experience API, the call centre desktop calls its own Experience API, and both call one claims Process API. It checks the policy in a policy copy through a System API, then puts the claim on a queue with a dead-letter queue. A claim intake Process API takes claims from the queue and creates them in the claims core through its System API.',
    checks: [
      { label: 'The app and the website call an Experience API', rule: { type: 'each', of: ['mobile-app', 'web-app'], edgeTo: 'experience-api', count: 1 } },
      { label: 'The call centre has its own Experience API', rule: { type: 'each', of: 'experience-api', min: 2, edgeFrom: ['mobile-app', 'web-app', 'internal-app'], max: 2 } },
      { label: 'Both Experience APIs call the same claims Process API', rule: { type: 'each', of: 'process-api', edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'The policy is checked in a policy copy through a System API', rule: { type: 'path', from: 'process-api', via: 'system-api', to: policies } },
      { label: 'Claims wait on a queue before they reach the claims core', rule: { type: 'path', from: 'process-api', via: 'queue', to: 'legacy' } },
      { label: 'No customer or agent waits on the claims core', rule: { type: 'no-path', from: ['mobile-app', 'web-app', 'internal-app'], to: 'legacy', kind: 'sync' } },
      { label: 'The claims core is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Customer app'],
        web: ['web-app', 'Claims website'],
        cc: ['internal-app', 'Call centre desktop'],
        expD: ['experience-api', 'exp-claims-digital', { vCores: '0.5' }],
        expA: ['experience-api', 'exp-claims-agent'],
        fnol: ['process-api', 'prc-first-notice-of-loss', { vCores: '0.5' }],
        sysP: ['system-api', 'sys-policy-copy', { vCores: '0.5' }],
        pol: ['database', 'Policy copy (refreshed from the core)'],
        q: ['queue', 'new-claims', { maxRedelivery: 120 }],
        dlq: ['dlq', 'new-claims DLQ'],
        intake: ['process-api', 'prc-claim-intake'],
        sysC: ['system-api', 'sys-claims-core'],
        core: ['legacy', 'Claims core'],
      },
      ['app -> expD', 'web -> expD', 'cc -> expA', 'expD -> fnol', 'expA -> fnol', 'fnol -> sysP', 'sysP -> pol', 'fnol ~> q', 'q ~> intake', 'q ~> dlq', 'intake -> sysC', 'sysC -> core'],
    ),
    simulation: {
      systems: [
        { match: policies, latencyMs: 10, maxRps: 1000 },
        { match: 'legacy', latencyMs: 600, maxRps: 40 },
      ],
      tests: [
        {
          name: 'A quiet day',
          about: 'About 4 claims a second from customers and agents. Each gets a claim number quickly, and every claim reaches the core.',
          traffic: [customers, agents],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 400 }], delivered: [{ to: 'legacy', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The storm',
          about: 'Hail hits two cities. For 45 minutes customers report 120 claims a second and agents 15. Everyone gets a claim number at once, the core never takes more than its 40 a second, and the queue is empty again within three hours.',
          traffic: [storm(customers, 120), storm(agents, 15)],
          durationMin: 240,
          expect: {
            answers: [{ minSuccess: 0.99, maxMs: 500 }],
            peakRps: [{ node: 'legacy', max: 40 }],
            delivered: [{ to: 'legacy', min: 0.99 }],
            lost: { max: 0 },
            backlog: [{ queue: 'queue', maxEnd: 0 }],
          },
        },
        {
          name: 'The claims core is down during the storm',
          about: 'The core goes down for an hour in the middle of the storm. Customers still get claim numbers, nothing is lost, and no claim is given up as failed.',
          traffic: [storm(customers, 120), storm(agents, 15)],
          incidents: [{ down: 'legacy', at: 20, forMin: 60 }],
          durationMin: 240,
          expect: { answers: [{ minSuccess: 0.99 }], lost: { max: 0 }, dlq: { max: 0 } },
        },
        {
          name: 'Claims the core cannot match',
          about: 'Two claims in 100 name a vehicle the core cannot match to the policy, and it refuses them every time. They move to the dead-letter queue for a claims handler, and the rest arrive.',
          traffic: [{ ...customers, poison: 0.02 }, agents],
          durationMin: 180,
          expect: { delivered: [{ flow: 'customers', to: 'legacy', min: 0.97 }], dlq: { min: 50 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A car insurer takes **first notice of loss** (the first report of a claim) from its **customer app**, its **claims website** and its **call centre**. Every claim is created in the **claims core**, an old system that takes about 600 ms a claim and no more than **40 claims a second**.

On a normal day about 4 claims a second come in. Last summer a hail storm hit two cities, and claims jumped to about **135 a second** for most of an hour: 120 from customers online and 15 from agents. The app and the website called the core directly and waited. The core slowed, then stopped answering. Customers got errors, tried again, and some claims were created twice. Agents typed claims on paper and keyed them in two days later.

**Requirements**
- Every customer and agent gets a **claim number at once**, even when the core is slow or down: within 400 ms on a normal day and within 500 ms during a storm.
- A claim must name a **valid policy**. Check it before giving a claim number, without asking the core: a copy of the policy data, refreshed from the core, is available in a database.
- The core must never get more than 40 claims a second.
- No claim may be lost. A claim the core refuses every time, such as a vehicle it cannot match, goes to a claims handler.
- After a storm of about 45 minutes, every claim must be in the core within about three hours.
- The core can be down for up to an hour during a storm. A queue redelivers a failed message about once a minute, and every delivery counts toward its redelivery limit. No good claim may reach the DLQ during that hour.

**Questions:**
- Draw the design for the three channels.
- Where does the claim number come from, if the core has not created the claim yet?
- What happens during the storm, and during an hour of core outage?
- How would you size it?
`,
  answerTemplate: `## Design

## The claim number

## During the storm

## When the core is down

## Refused claims

## Sizing
`,
  keyPoints: [
    'Accept the claim, check the policy in the policy copy, give a claim number, and put the claim on a queue. The core is never in the customer\'s wait.',
    'The claim number is made by the Process API, not the core. Store it with the claim so the core record and the customer\'s number match later.',
    'A consumer takes claims from the queue at no more than the core can take. The queue absorbs the storm and empties over the next hours.',
    'Set the redelivery limit to cover a long core outage, here at least an hour of tries, so good claims are never sent to the dead-letter queue.',
    'Claims the core refuses every time go to the dead-letter queue, where a handler fixes them by hand.',
    'Both channels share one Process API, so a claim is accepted by the same rules from the app, the website and the call centre.',
    'Size the accepting side for the storm: the digital Experience API, the Process API and the policy copy\'s System API, not the core side.',
  ],
  solution: `
**Design**
\`\`\`
Customer app ──┐
Claims website ┴─► exp-claims-digital ─┐
Call centre desktop ─► exp-claims-agent ┴─► prc-first-notice-of-loss ─► sys-policy-copy ─► Policy copy
                                                        ~► new-claims ~► prc-claim-intake ─► sys-claims-core ─► Claims core
                                                                    ~► DLQ
\`\`\`

**The claim number.** \`prc-first-notice-of-loss\` makes the number, such as CLM-2026-0004817, from a sequence it owns. It sends the claim with that number on the queue, and the core stores it as the external reference. The customer can quote it at once. A retry from the app carries the same request ID, so the Process API returns the same number instead of a second claim.

**During the storm.** 135 claims a second come in for 45 minutes, about 365,000 claims. All are accepted in well under a second. \`prc-claim-intake\` sends 40 a second to the core, so the queue peaks at about 250,000 and is empty within about three hours. Customers get "We have your claim" at once, and an SMS when a handler is assigned.

**When the core is down.** Claims keep arriving on the queue. In this model a failed delivery is tried again about once a minute, so a redelivery limit of 120 covers two hours of tries, so none goes to the DLQ while the core is away. When it is back, the backlog drains at 40 a second.

**Refused claims.** A claim the core refuses every time moves to the DLQ after its last try. A claims handler matches the vehicle and sends it again.

**Sizing.** The digital Experience API, the Process API and the policy copy's System API each take up to 135 calls a second, so half a vCore each in this model. The agent Experience API and the core side stay small: the core side is limited by the core, not by Mule.
`,
  followUps: [
    {
      q: 'Why not scale the core side up during the storm?',
      a: 'More consumers would only send more than the core can take, and it would fail faster. The core\'s limit sets the pace. If the backlog is too long, the answer is in the core, not in Mule.',
    },
    {
      q: 'What if the policy copy is a few hours behind?',
      a: 'A policy bought that morning may be missing. Accept the claim with a flag for a handler to check, rather than refuse it, and keep the refresh of the copy frequent during a storm.',
    },
    {
      q: 'Should agents be prioritised over the app during a storm?',
      a: 'Their claims come with a customer on the phone and often more detail. A separate queue for agent claims with its own consumer lets them reach the core first, within the same 40 a second.',
    },
  ],
}
