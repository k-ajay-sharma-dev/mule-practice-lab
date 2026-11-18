import { diagram } from '../../arch/dsl.js'

const bureau = { type: 'external-api', label: 'credit' }
const decisions = { name: 'broker decisions', from: 'partner', rps: 60, to: bureau }

export default {
  id: 'uc-147',
  category: 'use-cases',
  title: 'Mortgage Decisions in Principle for Broker Platforms: a Credit Bureau That Takes Four Seconds Ties Up Every Thread, Unless the APIs Are Sized for It and a Slow Spell Gets a Referral',
  level: 'ADVANCED',
  tags: ['threads', 'sizing', 'timeouts', 'partial-response', 'partners', 'financial-services'],
  estMinutes: 45,
  diagram: {
    task: 'draw the broker platforms calling an API gateway that checks client IDs, then a broker Experience API and a decision Process API. The Process API calls the credit bureau through a System API.',
    checks: [
      { label: 'Broker platforms come in through the API gateway', rule: { type: 'edge', from: 'partner', to: 'api-gateway' } },
      { label: 'The Experience API is reached only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'Decisions go through a Process API', rule: { type: 'path', from: 'experience-api', via: 'process-api', to: bureau } },
      { label: 'The credit bureau is reached only through a System API', rule: { type: 'only-via', target: bureau, from: 'system-api' } },
    ],
    reference: diagram(
      {
        brk: ['partner', 'Broker platforms'],
        gw: ['api-gateway', 'API gateway', { auth: 'client-id' }],
        exp: ['experience-api', 'exp-broker-decisions', { replicas: 2, vCores: '0.5' }],
        prc: ['process-api', 'prc-decision-in-principle', { replicas: 2, vCores: '0.5', timeoutMs: 6000, onFailure: 'partial answer' }],
        sys: ['system-api', 'sys-credit-bureau', { replicas: 2, vCores: '0.5', timeoutMs: 6000 }],
        cb: ['external-api', 'Credit bureau'],
      },
      ['brk -> gw', 'gw -> exp', 'exp -> prc', 'prc -> sys', 'sys -> cb'],
    ),
    simulation: {
      systems: [{ match: bureau, latencyMs: 4000 }],
      tests: [
        {
          name: 'A Monday morning',
          about: 'Brokers ask for 60 decisions a second. Each one waits about four seconds on the bureau, and every one is answered.',
          traffic: [decisions],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 5000, maxDegraded: 0.01 }] },
        },
        {
          name: 'The bureau slows to 15 seconds',
          about: 'The bureau answers in 15 seconds for 10 minutes. Brokers get "referred for review" within about six seconds, instead of timeouts after a long wait.',
          traffic: [decisions],
          incidents: [{ slow: bureau, latencyMs: 15000, at: 5, forMin: 10 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 7000, minDegraded: 0.4 }] },
        },
        {
          name: 'An availability zone goes down',
          about: 'One zone fails on a busy morning. The replicas in the other zone take every request, with enough threads for the four second waits.',
          traffic: [decisions],
          incidents: [{ zone: true, at: 5, forMin: 10 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'A platform without a client ID',
          about: 'A platform that has no contract calls the API. The gateway refuses it, and the bureau, which charges per check, is never called.',
          traffic: [{ ...decisions, name: 'no contract', rps: 10, auth: 'none' }],
          durationMin: 10,
          expect: { answers: [{ flow: 'no contract', minRefused: 0.99 }], notReached: [{ flow: 'no contract', node: bureau }] },
        },
      ],
    },
  },
  description: `
A building society offers **decisions in principle** for mortgages to **broker platforms**. A broker enters the customer's details and gets back "likely to lend", "unlikely" or "referred for review". Each decision needs a **credit bureau** check, which takes about **four seconds**.

The first version ran on the smallest size. On its first Monday it answered half the brokers with 503, though its CPU was nearly idle. When the bureau later slowed to 15 seconds for a while, every request failed.

The product owner's rule: a broker always gets an answer within about **seven seconds**. If the credit check cannot be done in time, the answer is "referred for review", and an underwriter looks at it later.

**Numbers**
- About **60 decisions a second** on a Monday morning.
- The bureau answers in about 4 seconds, and has had slow spells of 15 seconds.
- In this model each replica has 128 threads plus 256 per vCore, and a request holds a thread in every API it passes while it waits.
- The bureau charges per check.

**Questions:**
- Draw the design.
- Why did the first version fail with an idle CPU?
- How many threads does the design need, and how do you size for them?
- What should brokers get during a slow spell?
- How do you stop unknown platforms from running up the bureau bill?
`,
  answerTemplate: `## Design

## Why the CPU was idle

## Sizing for the threads

## Slow spells

## Who may call
`,
  keyPoints: [
    'A slow backend uses up threads, not CPU. By Little\'s law, 60 requests a second that each wait 4 seconds hold about 240 threads at once in every API on the path.',
    'Size for the threads: in this model 0.1 vCore has 153 threads, half a vCore has 256. Two replicas of half a vCore per API give 512, enough for the peak with one zone down.',
    'A timeout of 6 seconds on the bureau call keeps a slow spell from holding threads for 15 seconds each, which would need far more threads than any size has.',
    'During a slow spell answer "referred for review" instead of an error. That is a real, useful answer in this business, and the broker is not left waiting.',
    'A client ID policy at the gateway keeps unknown platforms out, so nobody runs up the per-check bill.',
  ],
  solution: `
**Design**
\`\`\`
Broker platforms ─► API gateway (client ID) ─► exp-broker-decisions ─► prc-decision-in-principle ─► sys-credit-bureau ─► Credit bureau
\`\`\`

**Why the CPU was idle.** Each request spent four seconds waiting on the bureau. On the smallest size, 153 threads were all busy waiting at about 38 requests a second. Every request above that got 503, with the CPU doing almost nothing.

**Sizing for the threads.** 60 × 4 = 240 threads in each API, more during a spike. Each API gets two replicas of half a vCore: 512 threads, and 256 in one zone during a zone outage, still above 240.

**Slow spells.** \`prc-decision-in-principle\` calls the bureau with a 6 second timeout. On a timeout it answers "referred for review" with a reference, and puts the case on the underwriters' list. With a 15 second bureau, threads are now held for 6 seconds, not 15.

**Who may call.** Each broker platform has a client ID under its contract. The gateway refuses any call without one, before it can reach the bureau.

**What else helps.** If the bureau offers it, an asynchronous check with a callback frees the threads entirely: answer "processing", and push the decision to the platform when it comes back.
`,
  followUps: [
    {
      q: 'Why not cache bureau results?',
      a: 'A credit check is for one customer at one moment, and the bureau\'s terms usually limit how long a result may be reused. A short reuse for the same customer within an hour may be allowed and would save repeat checks when a broker resubmits.',
    },
    {
      q: 'Should the APIs retry a bureau call that timed out?',
      a: 'Not within the request: there is no time left in the budget, and a retry doubles the bill. Refer the case, and let the underwriter\'s process run the check again later.',
    },
  ],
}
