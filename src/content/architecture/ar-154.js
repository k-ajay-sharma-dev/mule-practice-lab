import { diagram } from '../../arch/dsl.js'

const targets = ['database', 'erp', 'wms', 'saas']
const web = { name: 'web pages', from: 'web-app', rps: 150, to: targets }
const app = { name: 'app pages', from: 'mobile-app', rps: 100, to: targets }
const core = { type: 'process-api', label: 'core' }
const extras = { type: 'process-api', label: 'extras' }

export default {
  id: 'ar-154',
  category: 'architecture',
  title: 'A Product Page Under a 400 ms Budget: Calls in Parallel, Short Timeouts, a Circuit Breaker, and Reviews That May Be Left Out',
  level: 'EXPERT',
  tags: ['latency', 'scatter-gather', 'timeouts', 'circuit-breaker', 'partial-answer', 'process-api', 'retail'],
  estMinutes: 60,
  diagram: {
    task: 'draw the product page path: the web shop and the app call one Experience API, which calls two Process APIs. A core Process API gets the catalogue and the price through two System APIs. An extras Process API gets stock and reviews through two other System APIs, and answers without whatever is late. Draw the price system as an ERP box, stock as a Warehouse mgmt box and the reviews service as a SaaS application box. Name the two Process APIs with core and extras in their names, and set on each box whether it calls in parallel, its timeout and its circuit breaker.',
    checks: [
      { label: 'Both channels call the product page Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], edgeTo: 'experience-api', count: 1 } },
      { label: 'The Experience API calls a core and an extras Process API', rule: { type: 'edge', from: 'experience-api', to: 'process-api', min: 2 } },
      { label: 'The core Process API reaches the catalogue and the price system', rule: { type: 'path', from: core, via: 'system-api', to: ['database', 'erp'], min: 2 } },
      { label: 'The extras Process API reaches stock and reviews', rule: { type: 'path', from: extras, via: 'system-api', to: ['wms', 'saas'], min: 2 } },
      { label: 'The core never waits on reviews', rule: { type: 'no-path', from: core, to: 'saas' } },
      { label: 'Every system of record is reached only through a System API', rule: { type: 'only-via', target: ['database', 'erp', 'wms', 'saas'], from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop'],
        app: ['mobile-app', 'Shopping app'],
        exp: ['experience-api', 'exp-product-page', { vCores: '1', calls: 'in parallel' }],
        core: ['process-api', 'prc-product-core', { vCores: '1', calls: 'in parallel' }],
        ext: ['process-api', 'prc-product-extras', { vCores: '1', calls: 'in parallel', timeoutMs: 250, onFailure: 'partial answer', circuitBreaker: 'on' }],
        sCat: ['system-api', 'sys-catalogue', { vCores: '0.5' }],
        sPrc: ['system-api', 'sys-prices', { vCores: '0.5' }],
        sStk: ['system-api', 'sys-stock', { vCores: '0.5' }],
        sRev: ['system-api', 'sys-reviews', { vCores: '0.5', timeoutMs: 1000 }],
        cat: ['database', 'Catalogue database'],
        erp: ['erp', 'ERP (prices)'],
        wms: ['wms', 'Warehouse system (stock)'],
        rev: ['saas', 'Reviews service'],
      },
      ['web -> exp', 'app -> exp', 'exp -> core', 'exp -> ext', 'core -> sCat', 'core -> sPrc', 'sCat -> cat', 'sPrc -> erp', 'ext -> sStk', 'ext -> sRev', 'sStk -> wms', 'sRev -> rev'],
    ),
    simulation: {
      systems: [
        { match: 'database', latencyMs: 20, maxRps: 2000 },
        { match: 'erp', latencyMs: 120, maxRps: 600 },
        { match: 'wms', latencyMs: 80, maxRps: 600 },
        { match: 'saas', latencyMs: 150, maxRps: 600 },
      ],
      tests: [
        {
          name: 'A normal afternoon',
          about: 'The web shop and the app open 250 product pages a second. Every page is complete and comes back well inside 400 ms.',
          traffic: [web, app],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 400, maxDegraded: 0.01 }] },
        },
        {
          name: 'Reviews slow to 3 seconds',
          about: 'The reviews service is overloaded for 20 minutes. Pages still come back inside 400 ms, without reviews.',
          traffic: [web, app],
          incidents: [{ slow: 'saas', latencyMs: 3000, at: 5, forMin: 20 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 400 }, { minDegraded: 0.3 }] },
        },
        {
          name: 'Reviews stop answering',
          about: 'The reviews service hangs for 20 minutes. After the first failures the extras API stops waiting for it at all, and pages come back faster than its timeout.',
          traffic: [web, app],
          incidents: [{ hang: 'saas', at: 5, forMin: 20 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 260 }] },
        },
        {
          name: 'The ERP is down',
          about: 'Without a price the page cannot sell the product. Pages fail rather than show a product with no price.',
          traffic: [web, app],
          incidents: [{ down: 'erp', at: 2, forMin: 20 }],
          durationMin: 22,
          expect: { answers: [{ maxSuccess: 0.2 }] },
        },
      ],
    },
  },
  description: `
An outdoor clothing retailer's product page needs four things: the **catalogue** entry (name, pictures, sizes) from a database, the **price** from the ERP, **stock** from the warehouse system, and **reviews** from a reviews service.

Today one Process API calls the four one after another. On a normal day that takes more than 500 ms. The web team's budget for the whole call is **400 ms**. Twice this quarter the reviews service slowed to several seconds, and every product page waited for it, with a default timeout of 10 seconds. Sales dropped by a third for an hour each time.

The business has said:
- A page **without a price or catalogue entry** must not be shown.
- A page **without stock or reviews** is fine. Show "check stock in store" and no reviews.

**Numbers:** about **250 product pages a second** at peak. Typical answer times: catalogue 20 ms, ERP 120 ms, warehouse 80 ms, reviews 150 ms.

**Questions:**
- Draw a design that answers inside 400 ms on a normal day, and still does when reviews are slow or down.
- Which calls may be left out, and how does the design keep the others required?
- What timeouts would you set at each hop?
- What does a circuit breaker add when reviews hang?
`,
  answerTemplate: `## Design

## Parallel calls

## Required and optional parts

## Timeouts

## The circuit breaker
`,
  keyPoints: [
    'Call the systems in parallel, such as with Scatter-Gather. The time is then set by the slowest call, not the sum.',
    'Split what must be there from what may be left out. The core API fails without the price. The extras API answers without what is late.',
    'Give the optional calls a short timeout, here 250 ms, so a slow reviews service costs at most that.',
    'A circuit breaker on the extras API stops calling a service that keeps failing. Pages stop paying even the 250 ms timeout until it recovers.',
    'Set a timeout at every hop, each a little shorter than its caller\'s, so a thread is never held for an answer nobody will read.',
    'Size each layer for the peak: 250 pages a second is more than the smallest size takes in this model.',
  ],
  solution: `
**Design**
\`\`\`
Web shop ─┐                     ┌─► prc-product-core ───┬─► sys-catalogue ─► Catalogue database
Shopping app ─┴─► exp-product-page ─┤                       └─► sys-prices ────► ERP
                                    └─► prc-product-extras ─┬─► sys-stock ─────► Warehouse system
                                                            └─► sys-reviews ───► Reviews service
\`\`\`

**Parallel calls.** Each API calls what it needs at the same time. The core takes about 160 ms (the ERP), the extras about 190 ms (reviews), and the page about 230 ms in all in this model. One after another it would be nearer 600 ms.

**Required and optional parts.** \`prc-product-core\` fails if the catalogue or the price fails, so the page fails too. \`prc-product-extras\` answers with whatever arrived in time: stock and reviews when both answer, or less. The Experience API marks the missing parts so the page shows "check stock in store".

**Timeouts.** The web shop waits 400 ms. \`exp-product-page\` gives each Process API about 350 ms. \`prc-product-extras\` waits 250 ms for stock and reviews. \`sys-reviews\` waits at most 1 second for the service, so a stuck call frees its thread.

**The circuit breaker.** When reviews hang, every call would wait the full 250 ms. With the breaker open, \`prc-product-extras\` skips the call at once for a while, then tries one to see if the service is back. In this model pages take about 210 ms during the outage with the breaker, and about 270 ms without it.

**Sizing.** In this model 250 pages a second needs one vCore for the Experience API and each Process API, and half a vCore for each System API.
`,
  followUps: [
    {
      q: 'How do you build the extras API in Mule?',
      a: 'A Scatter-Gather with a route for stock and one for reviews, each wrapped in a Try that answers an empty result on error, and a timeout on each HTTP Request. The breaker can be kept in an Object Store as a count of recent failures and the time it opened.',
    },
    {
      q: 'Would a cache help as well?',
      a: 'Yes, for the catalogue and reviews, which change slowly. Price and stock change often, so cache them for seconds at most, or not at all.',
    },
    {
      q: 'Why not let the Experience API call the four System APIs itself?',
      a: 'It would work for one channel. The core and extras Process APIs are reused by the app, the store kiosks and the marketplace feed, each with the same rules about what is required.',
    },
  ],
}
