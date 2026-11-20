import { diagram } from '../../arch/dsl.js'

const checkout = { name: 'checkout', from: 'web-app', rps: 120, to: 'legacy' }
const primary = { type: 'legacy', label: 'primary' }
const standby = { type: 'legacy', label: 'standby' }

export default {
  id: 'ar-156',
  category: 'architecture',
  title: 'A Tax Engine Licensed for One Active Server: an Active-Passive Pair Behind a Load Balancer in Failover Mode',
  level: 'INTERMEDIATE',
  tags: ['high-availability', 'load-balancer', 'failover', 'active-passive', 'licensing', 'e-commerce'],
  estMinutes: 30,
  diagram: {
    task: 'draw the checkout calling an Experience API, a pricing Process API and a tax engine System API. The System API reaches the two tax engine servers, the primary and the standby, only through a load balancer. Draw each server as a Legacy box with primary or standby in its name, draw the load balancer\'s line to the primary first, and set the load balancer\'s mode.',
    checks: [
      { label: 'The checkout reaches the tax engine through a System API', rule: { type: 'path', from: 'web-app', via: 'system-api', to: 'legacy' } },
      { label: 'The System API calls the load balancer', rule: { type: 'edge', from: 'system-api', to: 'load-balancer' } },
      { label: 'The load balancer has a line to each tax engine server', rule: { type: 'each', of: 'load-balancer', edgeTo: 'legacy', count: 2 } },
      { label: 'Both servers are reached only through the load balancer', rule: { type: 'only-via', target: 'legacy', from: 'load-balancer' } },
      { label: 'The primary and the standby are both drawn', rule: { type: 'node', match: 'legacy', min: 2 } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Online checkout'],
        exp: ['experience-api', 'exp-checkout', { vCores: '0.5' }],
        prc: ['process-api', 'prc-order-pricing', { vCores: '0.5' }],
        sys: ['system-api', 'sys-tax-engine', { vCores: '0.5' }],
        lb: ['load-balancer', 'Tax engine load balancer', { mode: 'failover' }],
        te1: ['legacy', 'Tax engine (primary)'],
        te2: ['legacy', 'Tax engine (standby)'],
      },
      ['web -> exp', 'exp -> prc', 'prc -> sys', 'sys -> lb', 'lb -> te1', 'lb -> te2'],
    ),
    simulation: {
      systems: [{ match: 'legacy', latencyMs: 60, maxRps: 400 }],
      tests: [
        {
          name: 'A normal day',
          about: 'The checkout asks for 120 tax quotes a second. All of them are answered by the primary, and the standby gets none, so the licence holds.',
          traffic: [checkout],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 400 }], notReached: [{ node: standby }], delivered: [{ to: primary, min: 0.99 }] },
        },
        {
          name: 'The primary fails',
          about: 'The primary server stops for 20 minutes. The load balancer sends every quote to the standby, and the checkout keeps working.',
          traffic: [checkout],
          incidents: [{ down: primary, at: 5, forMin: 20 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
An online furniture shop calculates sales tax with a **tax engine** from a software vendor. It runs on two servers in the shop's data centre. The vendor's licence allows **one active server**. A second server may run as a **standby** that takes over when the first one fails, but it must not serve quotes while the first one is up.

The checkout reaches the tax engine through Mule: an Experience API for the checkout, a pricing Process API and a System API for the tax engine. Today the System API calls the primary server by its host name. When the primary failed last month, someone changed the host name in the System API's configuration and redeployed it, and the checkout could not price orders for 40 minutes.

A network engineer suggests putting the two servers behind the data centre's **load balancer**.

**Numbers**
- About **120 tax quotes a second** at peak. A quote takes about 60 ms.
- Each tax engine server takes up to 400 quotes a second.

**Questions:**
- Draw the design.
- How should the load balancer share quotes between the two servers, given the licence?
- What happens when the primary fails, and when it comes back?
`,
  answerTemplate: `## Design

## Spread or failover

## When the primary fails

## When it comes back
`,
  keyPoints: [
    'A load balancer in front of a pair hides which server answers. The System API calls one address that never changes.',
    'Spread mode shares requests between all healthy servers. That is active-active, and it breaks a licence for one active server.',
    'Failover mode sends everything to the primary and moves to the standby only when the primary\'s health check fails. That is active-passive.',
    'The load balancer\'s health check decides when to fail over, so it must test something real, such as a test quote, not only that the port is open.',
    'Decide whether traffic goes back to the primary on its own when it recovers, or only when an operator says so. Moving back and forth on a flapping server hurts more than staying on the standby.',
    'The Mule APIs need no change for a failover. Size them for the peak: 120 quotes a second is more than the smallest size takes in this model.',
  ],
  solution: `
**Design**
\`\`\`
Online checkout ─► exp-checkout ─► prc-order-pricing ─► sys-tax-engine ─► Tax engine load balancer (failover) ─► Tax engine (primary)
                                                                                                             └─► Tax engine (standby)
\`\`\`

**Spread or failover.** Failover. In spread mode both servers answer quotes all day, which is two active servers. In failover mode the standby is idle until the primary's health check fails.

**When the primary fails.** The load balancer stops sending quotes to it within a few health check intervals. Quotes in flight at that moment fail, so the System API retries once on a connection error. After that every quote goes to the standby.

**When it comes back.** Many load balancers can move traffic back as soon as the primary passes its health check again. For a licence like this one, prefer a manual move back at a quiet hour, after the vendor confirms the primary is healthy.

**Sizing.** 120 quotes a second is more than one 0.1 vCore replica takes in this model, so each Mule API gets half a vCore.
`,
  followUps: [
    {
      q: 'Could the System API do the failover itself, with Until Successful and two host names?',
      a: 'It could, but every app that calls the tax engine would need the same logic, and each would decide on its own which server is up. One load balancer gives one answer for everyone.',
    },
    {
      q: 'Does the standby need the same data as the primary?',
      a: 'Yes. Tax rates and product tax codes must be loaded on both, or a failover gives wrong prices. Make the rate update job load both servers and check that they match.',
    },
  ],
}
