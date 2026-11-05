import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-012',
  category: 'use-cases',
  title: 'Shipping Labels through Multiple Carriers',
  level: 'INTERMEDIATE',
  tags: ['carrier', 'canonical-model', 'strategy', 'fallback', 'logistics'],
  estMinutes: 25,
  diagram: {
    task: 'draw the Shipping API: the WMS calling one Process API, the carrier rules and label stores, one System API per carrier, and the asynchronous tracking update to the e-commerce platform.',
    checks: [
      { label: 'The WMS calls a single Shipping API', rule: { type: 'edge', from: ['internal-app', 'legacy', 'erp'], to: ['process-api', 'experience-api'] } },
      { label: 'The Shipping Process API uses one System API per carrier', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'Carriers are reached only through System APIs (adapters)', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Carrier selection rules are externalised in a table/config', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['rule', 'config', 'selection', 'cost'] } } },
      { label: 'Parcel ID → label is stored so retries return the same label', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['parcel', 'label', 'shipment', 'idempot'] } } },
      { label: 'Shipment-created events are published asynchronously', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'Tracking numbers reach the e-commerce platform', rule: { type: 'path', from: ['queue', 'topic', 'event-stream'], to: ['saas', 'web-app', 'crm'] } },
    ],
    reference: diagram(
      {
        wms: ['internal-app', 'Warehouse WMS (packing station)'],
        p: ['process-api', 'prc-shipping-api'],
        rules: ['database', 'Carrier selection rules'],
        labels: ['database', 'Shipments (parcel ID → label)'],
        health: ['cache', 'Carrier health (circuit breaker)'],
        sdhl: ['system-api', 'sys-dhl-api'],
        sups: ['system-api', 'sys-ups-api'],
        scour: ['system-api', 'sys-courier-api'],
        dhl: ['external-api', 'DHL'],
        ups: ['external-api', 'UPS'],
        cour: ['external-api', 'Regional courier (SOAP)'],
        q: ['queue', 'shipment-created-q'],
        trk: ['process-api', 'prc-tracking-update'],
        secom: ['system-api', 'sys-ecommerce-orders-api'],
        ecom: ['saas', 'E-commerce platform'],
      },
      [
        'wms -> p', 'p -> rules', 'p -> labels', 'p -> health', 'p -> sdhl', 'p -> sups', 'p -> scour', 'sdhl -> dhl', 'sups -> ups',
        'scour -> cour', 'p ~> q', 'q ~> trk', 'trk -> secom', 'secom -> ecom',
      ],
    ),
  },
  description: `
An online home-goods retailer ships ~15,000 parcels/day from 2 warehouses using **three carriers** (e.g. DHL, UPS and a regional courier). Today each warehouse system has hard-coded carrier calls.

The business wants a single **Shipping API**:
- The **WMS** calls it when a parcel is packed and must print the label within **3 seconds** (packing station is waiting).
- Carrier choice depends on destination country, weight, service level (standard/express) and current carrier cost table.
- Each carrier has its own API: different auth (OAuth 2.0, API key), payload formats (JSON, one uses SOAP/XML), label formats (PDF, ZPL).
- Carriers occasionally have outages of 10–60 minutes; packing must not stop.
- Tracking numbers must be sent back to the **e-commerce platform** so customers get a tracking email.
- A fourth carrier will be added next year.

**Describe your solution:**
- What APIs do you build and what does the canonical shipment look like?
- How is the carrier selected and how do you add a carrier later?
- What happens when the chosen carrier is down?
- How do you avoid creating two labels (and paying twice) for one parcel?
`,
  answerTemplate: `## API structure and canonical model

## Carrier selection

## Carrier outages

## Duplicate labels

## Tracking updates
`,
  keyPoints: [
    'Process-level Shipping API with a canonical shipment model; one System API (or adapter) per carrier hiding auth, format and label differences.',
    'Carrier selection rules externalised (config/DB rule table) so adding a carrier means a new adapter plus rule rows, not changes to the WMS.',
    'Strict timeouts on carrier calls; on failure fall back to the next eligible carrier within the 3-second budget, or queue for later and print a placeholder only if business agrees.',
    'Idempotency key = parcel ID: before creating a label, check whether one already exists; store parcel → carrier/tracking number.',
    'Label normalised to what the station printer needs (e.g. ZPL) and tracking numbers published asynchronously to the e-commerce platform.',
  ],
  solution: `
**API structure and canonical model.**
- **Shipping Process API** — \`POST /shipments\` (from WMS) returns carrier, tracking number and label (base64 ZPL/PDF).
- **Carrier System APIs** — one per carrier (\`dhl-sapi\`, \`ups-sapi\`, \`courier-sapi\`), each implementing the *same* internal contract: create shipment, cancel shipment, get tracking. Each hides its own auth (OAuth token caching, API keys from secure properties), format (JSON/SOAP via Web Service Consumer) and quirks.
- Canonical shipment: parcel ID, order ID, warehouse, sender, receiver (address, phone, email), parcels (weight, dimensions), service level, declared value, customs data for non-EU.

**Carrier selection.** A rule table (database or config, editable by logistics) maps *country + weight band + service level* → ordered list of eligible carriers with cost. The Process API filters eligible carriers and picks the cheapest available. Adding the 4th carrier = new System API following the shared contract + new rule rows. This is the **strategy/adapter** pattern at API level.

**Carrier outages.** The WMS needs a label in 3 s, so:
- Set a short **timeout** (e.g. 1.5 s) on the carrier call.
- On timeout/5xx, try the **next eligible carrier** from the list.
- Track carrier health (a simple circuit breaker using an Object Store counter): after N failures in a minute, skip that carrier for a few minutes instead of waiting for timeouts every time.
- If no carrier is available, return a clear error so the parcel is set aside (or queue it for automatic label creation later if the business accepts re-labelling).

**Duplicate labels.** The WMS may retry when a response is slow. Use **parcel ID as idempotency key**: store parcel → carrier, tracking number, label in a DB. On a repeated request, return the stored label instead of calling the carrier again. If a timed-out call actually succeeded at the carrier, the stored state may be missing. So before falling back to another carrier, optionally query the first carrier by reference. Also run a daily job that **cancels unused labels** (carriers often charge only for scanned parcels, but void them anyway).

**Tracking updates.** After a label is created, publish a \`ShipmentCreated\` event (Anypoint MQ). A flow consumes it and updates the e-commerce platform order with carrier and tracking number. This is asynchronous so the packing station is not slowed down. Carrier tracking webhooks/polls later update delivery status the same way.
`,
  followUps: [
    { q: 'Labels come back as PDF from one carrier but the printers need ZPL. How?', a: 'Prefer requesting ZPL from the carrier API (most offer it as an option); otherwise convert in a dedicated service, since Mule/DataWeave should not render images. The System API exposes one output format.' },
    { q: 'How do you test without generating real paid labels?', a: 'Use each carrier\'s sandbox/test mode in lower environments, MUnit with mocked carrier responses for timeouts and fallbacks, and a contract test that every carrier adapter meets the shared interface.' },
    { q: 'How do you manage carrier OAuth tokens?', a: 'Cache the token (Object Store with TTL slightly below its expiry) and refresh on 401, so you do not request a token per label.' },
  ],
}
