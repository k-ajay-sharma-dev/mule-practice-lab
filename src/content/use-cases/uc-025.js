import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-025',
  category: 'use-cases',
  title: 'Travel Booking Aggregation from Multiple Suppliers',
  level: 'EXPERT',
  tags: ['aggregation', 'scatter-gather', 'caching', 'saga', 'travel'],
  estMinutes: 45,
  diagram: {
    task: 'draw the travel platform with search and booking separated: the edge protection, Search and Booking Experience APIs, flight/hotel search and booking-orchestrator Process APIs, the search cache, hotel mapping and booking-state stores, and System APIs per supplier and the PSP.',
    checks: [
      { label: 'Search and booking are separate Experience APIs', rule: { type: 'node', match: 'experience-api', min: 2 } },
      { label: 'Channels pass a gateway with rate limiting / bot protection', rule: { type: 'each', of: ['web-app', 'mobile-app'], edgeTo: 'api-gateway' } },
      { label: 'Search results are cached to cut GDS fees', rule: { type: 'edge', from: 'process-api', to: 'cache' } },
      { label: 'Hotels are de-duplicated via a mapping table (supplier ID → master ID)', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['map', 'master', 'content'] } } },
      { label: 'The GDS is reached only through a System API', rule: { type: 'only-via', target: { type: ['external-api', 'legacy'], label: ['gds', 'amadeus', 'sabre'] }, from: 'system-api' } },
      { label: 'A booking orchestrator persists saga state', rule: { type: 'edge', from: 'process-api', to: { type: 'database', label: ['booking', 'state', 'saga'] } } },
      { label: 'Payment (authorise, capture, void) goes through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'Experience APIs never call supplier System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Website / app'],
        gw: ['api-gateway', 'Rate limiting / bot protection'],
        es: ['experience-api', 'exp-search-api'],
        eb: ['experience-api', 'exp-booking-api'],
        pfs: ['process-api', 'prc-flight-search'],
        phs: ['process-api', 'prc-hotel-search'],
        pbo: ['process-api', 'prc-booking-orchestrator'],
        cache: ['cache', 'Search cache (Redis, short TTL)'],
        map: ['database', 'Hotel mapping (supplier → master ID)'],
        bstate: ['database', 'Booking state'],
        sgds: ['system-api', 'sys-gds-api'],
        sbed: ['system-api', 'sys-bedbank-api'],
        spsp: ['system-api', 'sys-psp-api'],
        gds: ['external-api', 'GDS (SOAP)'],
        bed: ['external-api', 'Bed banks'],
        psp: ['payment', 'PSP'],
      },
      [
        'web -> gw', 'gw -> es', 'gw -> eb', 'es -> pfs', 'es -> phs', 'pfs -> cache', 'phs -> cache', 'phs -> map', 'pfs -> sgds',
        'phs -> sbed', 'eb -> pbo', 'pbo -> bstate', 'pbo -> sgds', 'pbo -> sbed', 'pbo -> spsp', 'sgds -> gds', 'sbed -> bed', 'spsp -> psp',
      ],
    ),
  },
  description: `
An online travel agency sells **flight + hotel packages**. Content comes from several suppliers:

- **Flights**: a GDS (Amadeus/Sabre-like, SOAP/XML, per-call fees) and two low-cost airline APIs (REST/JSON).
- **Hotels**: two bed banks (REST) and direct contracts in an internal hotel DB.
- **Payments** via a PSP; tickets issued by the GDS; hotel bookings confirmed by the bed bank.

Facts and constraints:
- **Search**: ~400 searches/second at peak; look-to-book ratio ~1,000:1. Users expect results in **< 3 seconds**; supplier response times vary from 300 ms to 8 s.
- GDS charges per search transaction and enforces a look-to-book limit in the contract.
- Prices and availability change constantly; the price shown must be **re-validated before payment**.
- A package booking involves flight + hotel: if the hotel fails after the flight is ticketed, the customer must not end up with half a package (flight tickets may be voidable only within 24 hours).
- Different suppliers return the same hotel under different IDs and names.

**Design the solution:**
- API architecture for search, price check and booking.
- How do you aggregate many slow suppliers within 3 seconds?
- How do you reduce GDS costs and protect suppliers?
- How do you de-duplicate hotels across suppliers?
- How do you book a package across suppliers consistently?
`,
  answerTemplate: `## API architecture

## Search aggregation

## Caching and cost control

## Content mapping and de-duplication

## Price re-validation

## Package booking saga

## Non-functional concerns
`,
  keyPoints: [
    'Separate search (high volume, cached, partial results acceptable) from booking (low volume, strongly consistent) — different APIs, scaling and SLAs.',
    'Fan-out to suppliers in parallel with per-supplier timeouts and a global deadline; return partial results and optionally stream/poll later results rather than waiting for the slowest supplier.',
    'Caching of search results/availability with short TTLs and request normalisation to cut GDS calls and respect look-to-book limits; per-supplier rate limits and circuit breakers.',
    'Hotel de-duplication via a content mapping table (supplier hotel ID → master property ID) built offline, not fuzzy matching at search time.',
    'Mandatory live price/availability re-check before payment; price changes shown to the customer.',
    'Package booking as a saga: hold/authorise payment, book the least reversible or most likely to fail component in the right order, compensate (cancel/void within allowed windows) on failure, with persisted state and idempotent supplier calls.',
  ],
  solution: `
**API architecture.**
- **Search Experience API** (web/app): \`GET /packages/search\` → returns a search ID and first results; \`GET /packages/search/{id}\` for later results.
- **Booking Experience API**: \`POST /offers/{offerId}/price-check\`, \`POST /bookings\`, \`GET /bookings/{id}\`.
- **Process APIs**: Flight Search, Hotel Search, Package Composer, Booking Orchestrator.
- **System APIs per supplier** (GDS via Web Service Consumer, airline and bed bank REST adapters), each mapping to a **canonical offer** model (segments, fares, rooms, rate conditions, cancellation policies, total price + currency, supplier reference).
Search and booking are deployed and scaled separately: search is huge volume and can tolerate staleness; booking is small volume and must be exact.

**Search aggregation.**
- Fan out to all relevant suppliers in parallel (**Scatter-Gather** or **Parallel For Each**) with **per-route timeouts** and a global budget (~2.5 s). Note Scatter-Gather fails the whole scope if a route errors — wrap each route in a Try with on-error-continue returning an empty result so one bad supplier does not break the search.
- Return what is available by the deadline; slow suppliers continue in the background and their results are stored under the search ID for the client to poll (or push via websocket from a separate service).
- Merge, de-duplicate, rank and paginate in DataWeave; keep payloads small (summary per offer, details on demand).

**Caching and cost control.**
- Normalise the request (route, dates, pax, cabin) and cache supplier results in a distributed cache (at hundreds of searches per second a dedicated cache such as Redis is a better fit than Object Store v2, which has request-rate limits) with short TTLs (e.g. 5–15 minutes for flights, longer for hotel static data).
- Pre-warm popular routes; use cheaper low-fare/cached-shopping products from the GDS where available.
- Per-supplier **rate limiting and circuit breakers**; track look-to-book per supplier to stay within contract.
- Policies on the Experience API (rate limiting per client/IP, bot protection at the edge) stop scrapers from burning GDS fees.

**Content mapping and de-duplication.** Hotels appear under different IDs/names. Maintain a **property mapping table**: supplier hotel ID → master property ID, built offline (a commercial hotel content-mapping service, or matching on geo-coordinates, name similarity, address, reviewed by a content team). At search time, de-duplication is a cheap lookup; the cheapest offer per master property (or per room type and conditions) is shown.

**Price re-validation.** Cached prices are indicative. Before payment, the **price-check** step calls the supplier live (GDS fare re-price, hotel rate check) and returns the current total and conditions. If it changed, the customer sees the new price and must accept. Offers carry an expiry.

**Package booking saga.** The Booking Orchestrator persists booking state per component:
1. **Authorise** payment for the full amount (do not capture yet).
2. **Book the hotel** first if its rate is refundable/cancellable — or whichever component is most likely to fail and cheapest to undo; the order is a business decision based on cancellation rules.
3. **Book and ticket the flight** (create PNR, issue ticket).
4. On success: **capture** payment, send confirmation.
5. On failure: **compensate** — cancel the hotel booking (within free-cancellation terms), **void** tickets within the void window, release/cancel the payment authorisation; if compensation itself fails, raise an operations case (human handling) — the customer is informed honestly.
Each supplier call uses an **idempotency key**/booking reference; on timeouts, query the supplier for the booking by our reference before retrying (to avoid double bookings). Booking state transitions are recorded for audit and customer service.

**Non-functional concerns.** Horizontal scaling of search workers; memory-conscious DataWeave (streaming large GDS XML responses); correlation ID per search/booking across all suppliers; dashboards per supplier (latency, error rate, look-to-book); PCI DSS scope minimised by tokenising cards at the PSP; supplier credentials in a vault.
`,
  followUps: [
    { q: 'One supplier becomes very slow during peak. What happens?', a: 'Its timeout cuts it off from the synchronous response, the circuit breaker opens after repeated failures so it is skipped for a cool-down period, and the site keeps working with the other suppliers.' },
    { q: 'Why not capture payment first and refund on failure?', a: 'Refunds cost money (fees), take days to reach the customer and hurt trust; authorise-then-capture after successful booking keeps compensation cheap.' },
    { q: 'How do you load-test something with per-call supplier fees?', a: 'Use supplier certification/test environments with agreed limits, and for high-volume tests replace System APIs with simulators that reproduce recorded latencies and payloads.' },
  ],
}
