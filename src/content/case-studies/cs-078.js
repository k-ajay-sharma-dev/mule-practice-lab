import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-078',
  category: 'case-studies',
  title: 'Building Society Publishing Savings Rates to Comparison Sites',
  level: 'BEGINNER',
  tags: ['banking', 'api-led', 'caching', 'rate-limiting', 'api-management', 'partners'],
  estMinutes: 30,
  diagram: {
    task: 'draw how the comparison sites and the society website read savings rates: through the API gateway, an Experience API with a cache, and a System API in front of the core banking product tables.',
    checks: [
      { label: 'Comparison sites call the API gateway', rule: { type: 'edge', from: 'partner', to: 'api-gateway' } },
      { label: 'Every call into the Experience API passes the gateway (client ID and rate limit)', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'Comparison sites reach rates data only through the Experience API', rule: { type: 'no-path', from: 'partner', to: ['system-api', 'legacy'], unless: 'experience-api' } },
      { label: 'Rates are served from a cache so partner traffic does not hit the core', rule: { type: 'edge', from: ['experience-api', 'process-api'], to: 'cache' } },
      { label: 'The Experience API reads rates through a System API', rule: { type: 'path', from: 'experience-api', via: 'system-api', to: 'legacy' } },
      { label: 'The core banking system is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Reading rates is a synchronous call from the API layers to the System API', rule: { type: 'lines', to: 'system-api', from: ['experience-api', 'process-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        cmp: ['partner', 'Comparison sites (12 partners)'],
        web: ['web-app', 'Society website'],
        gw: ['api-gateway', 'API Manager: client ID + rate limit'],
        exp: ['experience-api', 'exp-savings-rates-api'],
        cache: ['cache', 'Rates cache (Object Store, 5 min TTL)'],
        sys: ['system-api', 'sys-core-products-api'],
        core: ['legacy', 'Core banking (product tables)'],
      },
      ['cmp -> gw', 'web -> gw', 'gw -> exp', 'exp -> cache', 'exp -> sys', 'sys -> core'],
    ),
  },
  description: `
**Context.** A regional building society has 400,000 savers and 60 savings products. Twelve comparison sites list its rates. Today each site gets a CSV file by email every morning, and the society's own website reads a copy of the product table that is refreshed overnight.

**The problem today**
- When the society changes a rate at 10:00, comparison sites show the old rate until the next morning. The regulator expects advertised rates to be accurate, and complaints have doubled.
- Two sites have started scraping the website every minute, which slows it down.
- Nobody knows which sites still use the CSV.

**What exists**
- Core banking on an IBM i system. The product and rate tables are readable over JDBC, but the core team allows at most 20 queries per second.
- Anypoint Platform with API Manager and CloudHub 2.0, used so far only for two internal APIs.

**Goals**
- Comparison sites and the website see a rate change within 15 minutes.
- Each site has its own credentials so the society can see who calls and switch off a site that misbehaves.
- Partner traffic (expected peak 300 requests per second when a best-buy table is published) must never overload the core.

**Your task.** Design the rates API: the layers, how partners are let in, how the core is protected, and how you replace the CSV emails.
`,
  answerTemplate: `## Consumers and what they need

## API layers

## Letting partners in safely

## Protecting the core banking system

## Moving sites off the CSV email

## Risks
`,
  keyPoints: [
    'One Experience API (exp-savings-rates-api) serves both the comparison sites and the website, with the same read-only rates contract.',
    'Every call passes API Manager policies: client ID enforcement gives each site its own credentials, and a rate limit or SLA tier caps each one.',
    'A System API in front of the core product tables is the only component that queries the IBM i system.',
    'A cache with a short TTL (about 5 minutes) absorbs the 300 requests per second so the core sees only a few queries per minute, which meets the 15 minute freshness goal.',
    'The CSV emails are retired site by site after each partner is onboarded to the API and its usage is visible in API Manager.',
  ],
  solution: `
**Consumers.** Twelve comparison sites (read rates, some every minute), the society website, and later the mobile app. All read; none write.

**Layers**
\`\`\`
Comparison sites     Society website
        \\               /
   API gateway (client ID, rate limit per site)
              |
     exp-savings-rates-api  <->  rates cache (5 min TTL)
              |
     sys-core-products-api
              |
   Core banking product tables (IBM i)
\`\`\`
A Process API adds little here because there is no orchestration: one source, one read model. If a second source appears (for example a separate ISA product system), add \`prc-savings-products-api\` then.

**Letting partners in.** Publish the API in Exchange with a public portal page. Each site requests access and gets its own client ID and secret. Apply Client ID Enforcement and an SLA based rate limit: standard tier 10 requests per second, premium tier for the two largest sites. Scrapers get blocked at the website and pointed to the API.

**Protecting the core.** The Experience API reads from the cache first. On a miss it calls the System API, which runs one query for the full product list (60 rows) and returns it. With a 5 minute TTL the core sees at most 12 queries an hour from this API, far below the 20 per second limit. The System API also has a small connection pool so a burst cannot open many JDBC connections.

**Freshness.** A rate change shows within 5 minutes of the change in core. If the product team needs it faster on launch days, they can call an internal endpoint that clears the cache.

**Moving off CSV.** Keep the CSV for 3 months. Onboard sites one by one, watch their calls in API Manager, then remove them from the email list. When the list is empty, switch the job off.

**Risks.** Stale rates if the cache does not expire (test the TTL), a partner hammering the API (rate limit and client ID make this visible), and a core outage (serve the last cached rates with a timestamp and \`Cache-Control\` headers so partners know their age).
`,
  followUps: [
    { q: 'Why not let each comparison site query the core tables over JDBC?', a: 'The core allows only 20 queries per second and has no per-partner control. An API with a cache shields it, gives each site its own credentials and lets the society switch one site off.' },
    { q: 'How do you pick the cache TTL?', a: 'Start from the freshness goal of 15 minutes and the load the core can take. Five minutes keeps rates accurate enough while turning thousands of partner calls into a few core queries.' },
    { q: 'What do you return if the core is down?', a: 'Serve the last cached rates with the time they were read. Partners can show them with a note, which is better than an error during a best-buy publication.' },
    { q: 'How would you know a site still relies on the old CSV?', a: 'Compare the CSV email list with the client IDs seen in API Manager analytics. A site on the list with no API traffic still needs onboarding.' },
  ],
}
