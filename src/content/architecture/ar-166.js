import { diagram } from '../../arch/dsl.js'

const v1 = { type: 'process-api', label: 'v1' }
const v2 = { type: 'process-api', label: 'v2' }
const main = { name: 'main traffic', from: 'web-app', rps: 95, to: 'database', via: v1 }
const canary = { name: 'canary traffic', from: 'web-app', rps: 5, to: 'database', via: v2 }

export default {
  id: 'ar-166',
  category: 'architecture',
  title: 'A Canary Release for a New Pricing Engine: the Gateway Sends 5% of Requests to Version 2, and a Bad Version 2 Hurts Only Those',
  level: 'ADVANCED',
  tags: ['canary-release', 'api-gateway', 'deployment', 'versioning', 'risk', 'e-commerce'],
  estMinutes: 40,
  diagram: {
    task: 'draw the web shop calling an API gateway. Behind the gateway draw two versions of the pricing Process API, prc-pricing-v1 and prc-pricing-v2, side by side. Both read product data through one System API in front of the product database.',
    checks: [
      { label: 'The web shop calls the gateway', rule: { type: 'edge', from: 'web-app', to: 'api-gateway' } },
      { label: 'The gateway has a line to both pricing versions', rule: { type: 'each', of: 'api-gateway', edgeTo: 'process-api', count: 2 } },
      { label: 'The pricing versions are reached only through the gateway', rule: { type: 'only-via', target: 'process-api', from: 'api-gateway' } },
      { label: 'Version 1 reads through the System API', rule: { type: 'path', from: v1, via: 'system-api', to: 'database' } },
      { label: 'Version 2 reads through the same kind of System API', rule: { type: 'path', from: v2, via: 'system-api', to: 'database' } },
      { label: 'The product database is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop'],
        gw: ['api-gateway', 'API gateway (canary routing)'],
        p1: ['process-api', 'prc-pricing-v1', { replicas: 2, vCores: '0.2' }],
        p2: ['process-api', 'prc-pricing-v2'],
        sys: ['system-api', 'sys-products', { replicas: 2, vCores: '0.2' }],
        db: ['database', 'Product database'],
      },
      ['web -> gw', 'gw -> p1', 'gw -> p2', 'p1 -> sys', 'p2 -> sys', 'sys -> db'],
    ),
    simulation: {
      systems: [{ match: 'database', latencyMs: 30 }],
      tests: [
        {
          name: 'The first canary day',
          about: 'The shop asks for 100 prices a second. The gateway sends 95 to version 1 and 5 to version 2, and every price is answered.',
          traffic: [main, canary],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 300 }], peakRps: [{ node: v2, max: 6 }], vCores: { max: 1 } },
        },
        {
          name: 'Version 2 has a bug',
          about: 'Version 2 fails 60% of its requests for a rule nobody tested. Only the canary traffic sees errors. The 95% on version 1 is not touched.',
          traffic: [main, canary],
          incidents: [{ errors: v2, rate: 0.6, at: 2, forMin: 20 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'main traffic', minSuccess: 0.99 }, { flow: 'canary traffic', maxSuccess: 0.7 }] },
        },
        {
          name: 'An availability zone goes down',
          about: 'One zone fails during the canary. Version 1 and the System API keep answering from the other zone.',
          traffic: [main],
          incidents: [{ zone: true, at: 5, forMin: 10 }],
          durationMin: 20,
          expect: { answers: [{ flow: 'main traffic', minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
An online electronics shop is replacing the rules in its **pricing Process API**: promotions, bundles and member prices. The new version, \`prc-pricing-v2\`, passed its tests. Last year a big-bang release of a similar change showed wrong prices to every customer for an hour.

The architect proposes a **canary release**: run both versions side by side behind the **API gateway**, send a small share of requests to version 2, watch its errors and its prices, and move more traffic over step by step.

**Numbers**
- About **100 price requests a second**.
- Start with **5%** to version 2.
- Both versions read product data through the same System API in front of the **product database**.
- The vCore budget for this part of the estate is **1 vCore**.
- Version 1 and the System API must keep answering if one **availability zone** of the region fails.

**Questions:**
- Draw the design for the first canary day.
- How does the gateway split the traffic, and what decides who goes to version 2?
- What happens if version 2 has a bug?
- What do you watch before moving more traffic, and how do you roll back?
`,
  answerTemplate: `## Design

## Splitting the traffic

## A bad version 2

## Moving on, or rolling back
`,
  keyPoints: [
    'A canary runs the new version beside the old one and gives it a small share of real traffic. A fault then reaches only that share.',
    'The split lives in the gateway or load balancer in front of both versions. The shop calls one address and never knows which version answered.',
    'Pick the canary share in a stable way, such as by a hash of the customer ID, so one customer does not see two different prices for the same basket.',
    'Rolling back is a change to the split, back to 0%, with no deployment. That makes it fast and safe at any hour.',
    'Both versions read through the same System API, so the canary tests the new rules, not a new copy of the data.',
    'Size each version for its share. Version 2 needs little at 5%, and grows as the share grows.',
  ],
  solution: `
**Design**
\`\`\`
Web shop ─► API gateway ─95%─► prc-pricing-v1 ─┐
                       └─5%──► prc-pricing-v2 ─┴► sys-products ─► Product database
\`\`\`

**Splitting the traffic.** The gateway routes by a rule: requests whose customer ID hashes into the first 5 of 100 buckets go to version 2. The same customer always lands on the same version. Staff and test accounts can be sent to version 2 by a header for checks before the canary starts.

**A bad version 2.** Its errors stay within the canary share. Alerts on version 2's error rate and on how far its prices differ from version 1's for the same products trigger a rollback: the split goes back to 0% and version 1 takes everything.

**Moving on.** If version 2 holds for a day, go to 25%, then 50%, then 100%, watching the same signals at each step. Then retire version 1.

**Sizing.** Version 1 takes 95 a second: two replicas of 0.2 vCore, which also survives a zone outage. Version 2 takes 5 a second on one small replica. With the shared System API that is 0.9 vCore, inside the budget.
`,
  followUps: [
    {
      q: 'Version 2 writes something, such as reserving a promotion code. Does a canary still work?',
      a: 'Yes, if both versions write in a way the other can read. If version 2 changes the shape of stored data, make the data change first, so that both versions work with it, then run the canary.',
    },
    {
      q: 'How is a canary different from blue-green?',
      a: 'Blue-green switches all traffic from the old copy to the new one at once, with a fast way back. A canary moves traffic over in steps, so a fault is found while it touches only a few customers.',
    },
  ],
}
