import { diagram } from '../../arch/dsl.js'

const recalls = { type: 'legacy', label: 'recall' }
const publicApi = { type: 'experience-api', label: 'public' }
const dealerApi = { type: 'experience-api', label: 'dealer' }
const owners = { name: 'owner lookups', from: 'web-app', rps: 300, to: recalls }
const dealers = { name: 'dealer lookups', from: 'partner', rps: 10, to: recalls }

export default {
  id: 'uc-148',
  category: 'use-cases',
  title: 'Recall Lookups by Vehicle Number for Owners and Dealers: a Cached, Rate-Limited Public API, a Dealer API That Always Gets Through, and a Mainframe That Takes 40 Calls a Second',
  level: 'ADVANCED',
  tags: ['automotive', 'cache', 'rate-limiting', 'mainframe', 'partners', 'two-audiences'],
  estMinutes: 40,
  diagram: {
    task: 'draw the public recall website calling a public Experience API, which reads a cache. Draw the dealer systems calling an API gateway that checks client IDs, then a dealer Experience API. Both Experience APIs reach the recall database on the mainframe through one System API.',
    checks: [
      { label: 'The public website calls the public Experience API', rule: { type: 'edge', from: 'web-app', to: publicApi } },
      { label: 'The public Experience API reads a cache', rule: { type: 'edge', from: publicApi, to: 'cache' } },
      { label: 'Dealers come in through the API gateway', rule: { type: 'edge', from: 'partner', to: 'api-gateway' } },
      { label: 'The dealer Experience API is reached only through the gateway', rule: { type: 'only-via', target: dealerApi, from: 'api-gateway' } },
      { label: 'Both Experience APIs share one System API', rule: { type: 'each', of: 'system-api', edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'The mainframe is reached only through the System API', rule: { type: 'only-via', target: recalls, from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Public recall website'],
        expP: ['experience-api', 'exp-public-recalls', { replicas: 2, vCores: '0.5', rateLimit: 350 }],
        c: ['cache', 'Recall answer cache', { ttlSec: 3600 }],
        dlr: ['partner', 'Dealer systems'],
        gw: ['api-gateway', 'API gateway', { auth: 'client-id' }],
        expD: ['experience-api', 'exp-dealer-recalls', { replicas: 2 }],
        sys: ['system-api', 'sys-recalls', { replicas: 2, vCores: '0.2' }],
        mf: ['legacy', 'Recall database on the mainframe'],
      },
      ['web -> expP', 'expP -> c', 'expP -> sys', 'dlr -> gw', 'gw -> expD', 'expD -> sys', 'sys -> mf'],
    ),
    simulation: {
      systems: [{ match: recalls, latencyMs: 150, maxRps: 40 }],
      cache: { hitRatio: 0.92, atTtlSec: 3600 },
      tests: [
        {
          name: 'An ordinary day',
          about: 'Owners look up 300 vehicles a second and dealers 10. Everyone is answered, and the mainframe stays within 40 calls a second.',
          traffic: [owners, dealers],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 400 }], peakRps: [{ node: recalls, max: 40 }] },
        },
        {
          name: 'A recall on the evening news',
          about: 'A big recall is on the news and owners send 2,000 lookups a second for 10 minutes. The public site answers what it can and refuses the rest with 429. Dealers are not affected, and the mainframe is not overloaded.',
          traffic: [{ ...owners, spikes: [{ at: 5, forMin: 10, rps: 2000 }] }, dealers],
          durationMin: 20,
          expect: { answers: [{ flow: 'dealer lookups', minSuccess: 0.99 }, { flow: 'owner lookups', minLimited: 0.3 }], peakRps: [{ node: recalls, max: 40 }] },
        },
        {
          name: 'A dealer system without a client ID',
          about: 'An unknown system calls the dealer API, which shows extra detail meant for dealers. The gateway refuses it.',
          traffic: [{ ...dealers, name: 'unknown caller', auth: 'none' }],
          durationMin: 10,
          expect: { answers: [{ flow: 'unknown caller', minRefused: 0.99 }], notReached: [{ flow: 'unknown caller', node: recalls }] },
        },
      ],
    },
  },
  description: `
A car maker runs a **public recall website** where owners enter their vehicle identification number (VIN) and see any open recall. Its **dealer systems** use the same data when a car comes in for service, with extra detail such as parts and repair codes.

The recalls live in a **recall database on the mainframe**, which takes about **40 calls a second**. The mainframe team charges the website team for every call.

Last year a recall was on the evening news. Owners flooded the website, the mainframe slowed down, and dealers could not check cars in their workshops for two hours.

**Numbers**
- Owners: about **300 lookups a second** on an ordinary day, up to **2,000 a second** after news of a big recall.
- Dealers: about **10 lookups a second**, which must always work.
- The mainframe answers in about 150 ms and takes about **40 calls a second**.
- A vehicle's recall status changes rarely, a few times in its life. About 92% of owner lookups in an hour are for VINs already looked up in that hour.
- An owner may see a recall status up to an hour old. Dealers must see the current status.
- Every lookup must be answered within **400 ms** on an ordinary day.
- Only signed-up dealers may see the dealer detail.

**Questions:**
- Draw the design.
- How do owners and dealers each get what they need from a mainframe that takes 40 calls a second?
- What happens when a recall is on the news?
- Why do the two audiences need different Experience APIs and policies?
`,
  answerTemplate: `## Design

## Two audiences

## The public path

## The dealer path

## The news spike
`,
  keyPoints: [
    'Two audiences with different needs get two Experience APIs: anonymous owners in large numbers, and a few known dealers who must always get through.',
    'The public API caches answers by VIN for an hour. Recall status changes rarely, and a new recall is announced to owners by letter anyway.',
    'A rate limit on the public API caps what a spike can take. Over it, owners get 429 and the site says "try again shortly".',
    'Dealers come in through the gateway with a client ID, on their own Experience API, so the public spike never uses up their path.',
    'The shared System API sees cache misses and dealer calls only, which fit under the mainframe\'s 40 a second.',
  ],
  solution: `
**Design**
\`\`\`
Public recall website ─► exp-public-recalls (cache 1 h, limit 350/s) ─┐
                                                                     ├─► sys-recalls ─► Recall database on the mainframe
Dealer systems ─► API gateway (client ID) ─► exp-dealer-recalls ─────┘
\`\`\`

**The public path.** About 92 in 100 owner lookups are answered from the cache, so 300 a second become about 24 mainframe calls. The rate limit of 350 a second keeps a spike from turning into hundreds of misses a second.

**The dealer path.** Dealers are not cached: a dealer checking a car must see a recall issued this morning. They add about 10 calls a second, which fits beside the public misses.

**The news spike.** At 2,000 a second, 350 are served, mostly from the cache, and 1,650 get 429. The misses among those 350 and the dealer calls stay under 40 a second. Dealers see no change.

**Sizing.** The public API runs on two replicas of half a vCore for the spike. The dealer API and the System API each have two replicas, so a zone outage does not stop the workshops.
`,
  followUps: [
    {
      q: 'A new recall is issued. How long until owners see it on the website?',
      a: 'Up to an hour for VINs already in the cache. If that is too slow, the recall team\'s release process clears the cache for the affected VIN ranges, or clears it entirely, which costs a short burst of mainframe calls.',
    },
    {
      q: 'Could the public spike be handled with a bigger cache instead of a limit?',
      a: 'The cache helps only for VINs looked up before. In a news spike many owners look up their own VIN for the first time, so misses go up with the traffic. The limit is what protects the mainframe.',
    },
  ],
}
