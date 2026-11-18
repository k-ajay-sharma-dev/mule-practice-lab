import { diagram } from '../../arch/dsl.js'

const postcodes = { type: 'external-api', label: 'postcode' }
const lookups = { name: 'address lookups', from: ['web-app', 'internal-app'], rps: 100, to: postcodes }

export default {
  id: 'ar-161',
  category: 'architecture',
  title: 'An Address Lookup Service That Charges per Call: One System API for Every Channel, and a Day-Long Cache That Cuts the Bill by Four Fifths',
  level: 'BEGINNER',
  tags: ['cache', 'cost', 'system-api', 'third-party-api', 'reuse', 'retail'],
  estMinutes: 20,
  diagram: {
    task: 'draw the checkout and the call centre app each calling their own Experience API. Both reach one address lookup System API, which keeps answers in a cache and otherwise calls the postcode lookup service.',
    checks: [
      { label: 'The checkout calls an Experience API', rule: { type: 'edge', from: 'web-app', to: 'experience-api' } },
      { label: 'The call centre app calls an Experience API', rule: { type: 'edge', from: 'internal-app', to: 'experience-api' } },
      { label: 'Both Experience APIs share one System API for addresses', rule: { type: 'each', of: 'system-api', edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'The System API keeps answers in a cache', rule: { type: 'edge', from: 'system-api', to: 'cache' } },
      { label: 'The postcode lookup service is reached only through the System API', rule: { type: 'only-via', target: postcodes, from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Checkout'],
        cc: ['internal-app', 'Call centre app'],
        expW: ['experience-api', 'exp-checkout'],
        expC: ['experience-api', 'exp-call-centre'],
        sys: ['system-api', 'sys-address-lookup', { vCores: '0.2' }],
        c: ['cache', 'Address cache', { ttlSec: 86400 }],
        pc: ['external-api', 'Postcode lookup service'],
      },
      ['web -> expW', 'cc -> expC', 'expW -> sys', 'expC -> sys', 'sys -> c', 'sys -> pc'],
    ),
    simulation: {
      systems: [{ match: 'external-api', latencyMs: 200 }],
      cache: { hitRatio: 0.85, atTtlSec: 86400 },
      tests: [
        {
          name: 'A Saturday afternoon',
          about: 'The checkout and the call centre look up 100 postcodes a second between them. Every lookup is answered, and fewer than 20 a second reach the paid service.',
          traffic: [lookups],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 300 }], peakRps: [{ node: postcodes, max: 20 }] },
        },
        {
          name: 'The lookup service is down for 15 minutes',
          about: 'The postcode service has an outage. Postcodes looked up earlier in the day are still answered from the cache, so most customers can still type their address quickly.',
          traffic: [{ ...lookups, rps: 50 }],
          incidents: [{ down: postcodes, at: 5, forMin: 15 }],
          durationMin: 25,
          expect: { answers: [{ minSuccess: 0.8 }] },
        },
      ],
    },
  },
  description: `
A home furnishings retailer lets customers type a postcode and pick their address from a list. The list comes from a **postcode lookup service**, a third-party API that charges **per call**.

Two channels use it: the website **checkout** and the **call centre app**. Each team built its own calls to the service, with its own API key. The bill has doubled in a year, and finance wants it cut.

**Numbers**
- About **100 lookups a second** at peak across both channels.
- The service answers in about 200 ms.
- Addresses for a postcode change very rarely, a few new builds a year.
- About 85% of lookups in a day are for postcodes already looked up that day.

**Questions:**
- Draw the design.
- How much of the bill can a cache save, and how long should it keep an answer?
- Why one System API instead of each channel calling the service?
- What happens at the checkout when the service is down?
`,
  answerTemplate: `## Design

## The cache and the bill

## One System API

## When the service is down
`,
  keyPoints: [
    'Put every call to the paid service behind one System API. One key, one place to count calls, one cache for both channels.',
    'Cache by postcode in the System API. Each channel\'s lookups then fill the cache for the other.',
    'Choose the time to live from how often the data changes. Addresses change a few times a year, so a day is safe. The default of five minutes would keep very few answers.',
    'With 85% of the day\'s lookups repeated, a day-long cache sends about 15 in 100 to the service. The bill falls by about four fifths.',
    'The cache also keeps the checkout going during an outage of the service, for every postcode looked up earlier that day.',
  ],
  solution: `
**Design**
\`\`\`
Checkout ─────────► exp-checkout ───┐
                                    ├─► sys-address-lookup ─► Postcode lookup service
Call centre app ──► exp-call-centre ┘          │
                                               └─► Address cache (24 h)
\`\`\`

**The cache and the bill.** \`sys-address-lookup\` keeps the address list for each postcode for 24 hours. In this model about 85 in 100 lookups are answered from the cache, so of 100 a second about 15 reach the service. The cache is an Object Store or the Cache scope in the System API.

**One System API.** Both teams' code calling the service is replaced by one API. The second key is cancelled, and the call count on the bill can be checked against the API's own metrics.

**When the service is down.** Postcodes already in the cache are answered as usual. For the rest, the checkout lets the customer type the address by hand.

**Sizing.** 100 lookups a second is more than the smallest size takes in this model, so the shared System API gets 0.2 vCore.
`,
  followUps: [
    {
      q: 'The service\'s terms say results may only be kept for 30 days. Does that change anything?',
      a: 'Check the terms before choosing the time to live. A day is well inside 30 days, but some providers forbid caching at all, or charge for it. The design has to follow the contract.',
    },
    {
      q: 'Should the cache be warmed at night with the most common postcodes?',
      a: 'It saves little here, since the first lookup of the day fills the cache anyway, and each warming call is also paid for. Warm only if the first minutes of the day are too slow.',
    },
  ],
}
