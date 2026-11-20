import { diagram } from '../../arch/dsl.js'

const polls = { name: 'price list polls', from: 'partner', rps: 60, to: 'file-store', kind: 'read' }

export default {
  id: 'uc-167',
  category: 'use-cases',
  title: 'Price Lists on an Azure File Share Polled by 300 Shops at 06:00: Cache in Front of the Share, Size the API for the Rush, and Keep the Share Under Its Limit',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-file-share', 'cache', 'sizing', 'throttling', 'api-gateway', 'wholesale'],
  estMinutes: 45,
  diagram: {
    task: 'draw the shops calling a prices Experience API through an API gateway that checks client IDs. The Experience API keeps answers in a cache and reads price files through a share System API, which reads the Azure File Share.',
    checks: [
      { label: 'Shops come in through the API gateway', rule: { type: 'edge', from: 'partner', to: 'api-gateway' } },
      { label: 'The Experience API has a cache', rule: { type: 'link', from: 'experience-api', to: 'cache' } },
      { label: 'The share is reached only through a System API', rule: { type: 'only-via', target: 'file-store', from: 'system-api' } },
      { label: 'Shops reach the share only through the Experience API', rule: { type: 'path', from: 'partner', via: 'experience-api', to: 'file-store' } },
    ],
    reference: diagram(
      {
        shops: ['partner', 'Partner shops'],
        gw: ['api-gateway', 'API gateway', { auth: 'client-id' }],
        exp: ['experience-api', 'exp-price-lists', { vCores: '2' }],
        cache: ['cache', 'Price list cache', { ttlSec: 900 }],
        sys: ['system-api', 'sys-price-share', { vCores: '0.5' }],
        share: ['file-store', 'Azure File Share price-lists'],
      },
      ['shops -> gw', 'gw -> exp', 'exp -> cache', 'exp -> sys', 'sys -> share'],
    ),
    simulation: {
      systems: [{ match: 'file-store', latencyMs: 150, maxRps: 200 }],
      cache: { hitRatio: 0.9, atTtlSec: 900 },
      tests: [
        {
          name: 'A quiet hour',
          about: 'About 60 polls a second. Every shop gets its price list.',
          traffic: [polls],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'The 06:00 rush',
          about: 'Every shop polls at once: 600 a second for 20 minutes. Almost every poll is answered, and the share never sees more than its 200 reads a second.',
          traffic: [{ ...polls, spikes: [{ at: 2, forMin: 20, rps: 600 }] }],
          durationMin: 25,
          expect: { answers: [{ minSuccess: 0.99 }], peakRps: [{ node: 'file-store', max: 200 }] },
        },
        {
          name: 'A shop without its client ID',
          about: 'A shop\'s new till posts without a client ID. The gateway refuses it, and the share is never read for it.',
          traffic: [{ ...polls, name: 'no client ID', rps: 5, auth: 'none' }],
          durationMin: 10,
          expect: { answers: [{ flow: 'no client ID', minRefused: 0.99 }], notReached: [{ flow: 'no client ID', node: 'file-store' }] },
        },
      ],
    },
  },
  description: `
Tallow & Finch, a fictional food wholesaler, publishes one price list per customer group each night. The pricing team saves them to an **Azure File Share**, \`price-lists\`. About 300 partner shops fetch their list through a prices API; a share System API on a runtime with the share mounted reads the files. Each shop has its own client ID, and a call without one must be refused before it costs a read.

At 06:00 every shop's till fetches the day's prices at once, and keeps polling every few seconds until it gets them. Last month the share started refusing reads, shops opened with yesterday's prices, and the API itself answered 503.

**Numbers**
- About **60 polls a second** most of the day, **600 a second** for 20 minutes from 06:00.
- The share serves up to about **200 reads a second** for these files before it throttles.
- A price list changes once a night. Keeping an answer for **15 minutes** is fine; in this scenario that gives a hit ratio of about 90%.
- In this model one vCore serves about 500 requests a second, and the smallest size is 0.1 vCore.

**Questions:**
- Draw the design.
- How do you keep the share under 200 reads a second at 06:00?
- Size the Experience API and the System API. Show the sums.
- What does the gateway add?
`,
  answerTemplate: `## Design

## Protecting the share

## Sizing

## The gateway
`,
  keyPoints: [
    'The files change once a night but are read thousands of times. A cache in the Experience API answers almost all of the rush without touching the share.',
    'With a 90% hit ratio, 600 polls a second become about 60 reads a second at the share, well under its limit.',
    'The Experience API still answers all 600: about 1.2 vCores of work, so 2 vCores. The System API sees only cache misses: half a vCore is plenty.',
    'A file share has its own throughput limits. Treat them like any backend\'s: measure, then design so the peak cannot reach them.',
    'Client ID enforcement at the gateway stops unknown callers before they cost a read.',
  ],
  solution: `
**Design**
\`\`\`
Partner shops ─► API gateway (client ID) ─► exp-price-lists ─► sys-price-share ─► Azure File Share price-lists
                                                  └─► Price list cache (15 minutes)
\`\`\`

**Sums.** 600 polls a second at the Experience API: 2 vCores. About 10% miss the cache: 60 a second at the System API and the share. 0.5 vCore for the System API.

**After a new list is saved.** Shops may see the old list for up to 15 minutes. If the pricing team publishes at 05:30, clear the cache at 05:45, or key the cache by the file's modified time.

**Polling every few seconds.** Ask the till vendor for an If-Modified-Since style check, or answer with a Retry-After header, so tills poll less.
`,
  followUps: [
    {
      q: 'Why not raise the share\'s limits instead of caching?',
      a: 'Premium file shares offer more throughput for more money. It may be worth it, but a cache costs far less here, because the content changes once a day.',
    },
    {
      q: 'Where would you put a rate limit, and why?',
      a: 'At the gateway, per client ID. One broken till polling in a loop then gets 429 instead of using up capacity meant for 300 shops.',
    },
  ],
}
