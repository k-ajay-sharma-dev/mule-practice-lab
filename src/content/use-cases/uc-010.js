import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-010',
  category: 'use-cases',
  title: 'Car Insurance Quote API for Comparison Sites',
  level: 'BEGINNER',
  tags: ['api-design', 'raml', 'validation', 'policies'],
  estMinutes: 20,
  diagram: {
    task: 'draw the Quote API landscape: the comparison sites, the gateway policies, the Quote API layers, the rating engine and vehicle lookup behind System APIs, the vehicle cache and the quote store.',
    checks: [
      { label: 'Comparison sites call through the API gateway (client ID, SLA rate limits)', rule: { type: 'each', of: 'partner', edgeTo: 'api-gateway' } },
      { label: 'The gateway fronts the Quote Experience API', rule: { type: 'edge', from: 'api-gateway', to: 'experience-api' } },
      { label: 'The SOAP rating engine is reached only through a System API', rule: { type: 'only-via', target: { type: ['legacy', 'external-api', 'erp', 'saas'], label: ['rating', 'engine', 'soap'] }, from: 'system-api' } },
      { label: 'The vehicle lookup service is reached only through a System API', rule: { type: 'only-via', target: { type: ['external-api', 'saas', 'legacy'], label: 'vehicle' }, from: 'system-api' } },
      { label: 'Quotes are stored for 30 days', rule: { type: 'edge', from: ['process-api', 'experience-api', 'system-api'], to: { type: ['database', 'cache'], label: 'quote' } } },
      { label: 'Vehicle lookups are cached', rule: { type: 'edge', to: { type: 'cache', label: ['vehicle', 'lookup', 'registration'] } } },
    ],
    reference: diagram(
      {
        cmp: ['partner', 'Comparison sites (x5)'],
        gw: ['api-gateway', 'API Manager: client ID + SLA rate limiting'],
        e: ['experience-api', 'exp-quotes-api'],
        p: ['process-api', 'prc-quote-api (validation, capped concurrency)'],
        srat: ['system-api', 'sys-rating-engine-api'],
        rat: ['legacy', 'Rating engine (SOAP)'],
        sveh: ['system-api', 'sys-vehicle-lookup-api'],
        veh: ['external-api', 'Vehicle lookup'],
        cache: ['cache', 'Vehicle cache (1 day)'],
        qdb: ['database', 'Quotes DB (30-day expiry)'],
        purge: ['batch-job', 'Nightly expired-quote purge'],
      },
      ['cmp -> gw', 'gw -> e', 'e -> p', 'p -> srat', 'srat -> rat', 'p -> sveh', 'sveh -> veh', 'p -> cache', 'p -> qdb', 'purge -> qdb'],
    ),
  },
  description: `
An insurer wants to sell car insurance through **price comparison websites**. Each site will call a public **Quote API** with driver and vehicle details and display the premium.

Backend:
- A **rating engine** (on-premises, SOAP web service) calculates premiums. Average response 600 ms, max ~40 concurrent requests.
- A **vehicle lookup** REST service returns make/model/value from a registration number.

Requirements:
- 5 comparison sites at launch; one site alone can send **30 quotes/second** at evening peaks.
- Each quote must be stored with a **quote reference** valid for 30 days, so the customer can buy it later at the same price.
- Invalid requests (driver under 17, missing licence date) must get a clear 400 error, not reach the rating engine.
- Each site must only see its own quotes.

**Describe your solution:**
- How would you design the API (resources, contract, errors)?
- How do you protect the rating engine and identify each site?
- How do you store and retrieve quotes?
`,
  answerTemplate: `## API design

## Implementation flow

## Security and traffic control

## Storing quotes
`,
  keyPoints: [
    'Design-first contract (RAML or OAS) published in Exchange: POST /quotes returns 201 with quoteId; GET /quotes/{quoteId}; standard error payload.',
    'Request validated by APIkit against the contract plus business rules (age, licence) before any backend call; 400 with field-level messages.',
    'Each comparison site is a client app with its own credentials (client ID enforcement or OAuth 2.0 client credentials) and an SLA tier / rate limit.',
    'Backend protected: rate limiting/spike control per site and a capped concurrency towards the SOAP engine (e.g. maxConcurrency), with timeouts and a 503 on overload.',
    'Quote persisted with premium, inputs, client ID and expiry (30 days); GET checks ownership and expiry.',
  ],
  solution: `
**API design (design-first).** Write the contract in **RAML or OAS** in Design Center and publish to **Exchange** so sites can try the mocking service before go-live.
- \`POST /quotes\` — body: driver (birth date, licence date, claims), vehicle (registration or make/model), cover type, start date. Returns **201** with \`quoteId\`, premium, excess and \`validUntil\`.
- \`GET /quotes/{quoteId}\` — retrieve a stored quote.
- Errors: one consistent JSON shape (\`code\`, \`message\`, \`details[]\`) for 400, 401, 404, 429, 503.

This is an **Experience/Process API** for partners; behind it sit System APIs for the rating engine (SOAP via the **Web Service Consumer** connector) and vehicle lookup.

**Implementation flow.**
1. APIkit router validates the request against the schema (types, required fields).
2. Business validation in the flow: driver age ≥ 17, licence date after 17th birthday, start date within 60 days → 400 with details if not.
3. Vehicle lookup (cache results by registration for a day — the value rarely changes).
4. DataWeave maps to the SOAP rating request; call the rating engine.
5. Store the quote and return 201.

**Security and traffic control.** Apply policies in **API Manager**: **Client ID enforcement** (or OAuth 2.0 client credentials) so each site is a separate client application; **SLA-based rate limiting** per site (e.g. 40 req/s tier); HTTPS only. The rating engine allows ~40 concurrent calls: at 30 req/s × 0.6 s ≈ 18 concurrent per site, so with 5 sites at peak you must **cap concurrency** (flow \`maxConcurrency\` on the calling flow, or a shared queue) and fail fast with **503 + Retry-After** rather than letting the engine collapse. Set an explicit timeout on the SOAP call.

**Storing quotes.** Save each quote in a database (quoteId, client ID, inputs, premium, created, \`expiresAt\` = +30 days). \`GET\` returns 404 if the quote belongs to another client ID (do not reveal it exists) and 410/expired status after 30 days. A nightly job purges expired quotes that were never bought.
`,
  followUps: [
    { q: 'Comparison sites often send the same request many times. Any optimisation?', a: 'Cache identical requests for a short time (hash of normalised inputs per site) so repeated quotes return the stored result without calling the rating engine, as long as pricing rules allow it.' },
    { q: 'How do you version the API when you add a new field?', a: 'Adding optional fields is backward compatible within v1. Breaking changes go to /v2 with a new Exchange asset version, running v1 in parallel until all sites migrate.' },
    { q: 'The rating engine is down. What does the site see?', a: 'A fast 503 with a retry hint (and alerting on our side), not a 30-second hang; a circuit-breaker style check avoids hammering the engine while it recovers.' },
  ],
}
