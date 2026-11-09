import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-111',
  category: 'use-cases',
  title: 'Pharmacy Home Delivery: Carrier Labels at Packing and Signed Tracking Webhooks',
  level: 'INTERMEDIATE',
  tags: ['carrier', 'webhooks', 'hmac', 'logistics', 'anypoint-mq', 'healthcare'],
  estMinutes: 30,
  diagram: {
    task: 'draw both halves: the packing station creating a label through the API layers and the carrier System API, and the carrier tracking webhooks entering through gateway policies, queued by the webhook API, processed into the pharmacy system and SMS updates.',
    checks: [
      { label: 'Labels are created with sync calls from the packing station', rule: { type: 'path', from: 'internal-app', to: 'external-api', kind: 'sync' } },
      { label: 'The carrier API is called only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Carrier webhooks enter through the gateway policies', rule: { type: 'edge', from: 'external-api', to: 'api-gateway' } },
      { label: 'Nothing from the carrier gets past without the gateway', rule: { type: 'no-path', from: 'external-api', to: ['experience-api', 'queue', 'process-api'], unless: 'api-gateway' } },
      { label: 'The webhook API queues each event and answers at once', rule: { type: 'edge', from: 'experience-api', to: 'queue', kind: 'async' } },
      { label: 'Tracking updates are processed from the queue', rule: { type: 'edge', from: 'queue', to: 'process-api', kind: 'async' } },
      { label: 'The webhook request never waits on the pharmacy system', rule: { type: 'no-path', from: 'api-gateway', to: 'legacy', kind: 'sync' } },
      { label: 'The pharmacy system is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Patients get SMS updates from the tracking flow', rule: { type: 'path', from: 'queue', to: 'notification' } },
    ],
    reference: diagram(
      {
        pack: ['internal-app', 'Packing station app'],
        exp: ['experience-api', 'exp-packing-api'],
        prc: ['process-api', 'prc-shipments'],
        scar: ['system-api', 'sys-carrier-api'],
        car: ['external-api', 'Carrier API (labels, tracking webhooks)'],
        gw: ['api-gateway', 'Webhook policies (IP allow list, HMAC check)'],
        wh: ['experience-api', 'exp-carrier-webhook'],
        q: ['queue', 'tracking-events'],
        trk: ['process-api', 'prc-tracking-updates'],
        db: ['database', 'Shipments and labels'],
        sph: ['system-api', 'sys-pharmacy-api'],
        ph: ['legacy', 'Pharmacy dispensing system'],
        sms: ['notification', 'SMS to patients'],
      },
      [
        'pack -> exp', 'exp -> prc', 'prc -> scar', 'scar -> car', 'prc -> db', 'car -> gw', 'gw -> wh', 'wh ~> q', 'q ~> trk',
        'trk -> db', 'trk -> sph', 'sph -> ph', 'trk -> sms',
      ],
    ),
  },
  description: `
An online pharmacy delivers **prescription medicines** to patients' homes with one national carrier. Two integrations are needed.

**1. Labels at packing.** When a parcel is packed, the packer scans it and the packing station must print a **label within 3 seconds**.
- About **9,000 parcels per day**, 5 packing stations, peaks of 3 parcels per second.
- The carrier REST API returns the label as PDF or ZPL and a tracking number. It answers in 300 to 1,500 ms and has short outages a few times a month.
- Cold-chain parcels (insulin) must use the next-day service and must not be shipped on Fridays.

**2. Tracking webhooks.** The carrier calls a webhook URL for every tracking event: collected, out for delivery, delivered, delivery failed, returned.
- About **50,000 events per day**. The carrier retries a failed webhook 3 times in 10 minutes, then drops it.
- Each webhook carries an \`X-Signature\` header: HMAC-SHA256 of the body with a shared secret.
- Events can arrive out of order and twice.
- The **pharmacy dispensing system** (on-prem, legacy) must record "delivered" for each prescription. It is slow (2 to 4 s per call) and offline at night for backups.
- Patients get an SMS for "out for delivery" and "delivery failed".

**Describe your solution** for both flows, including what happens when the carrier or the pharmacy system is down.
`,
  answerTemplate: `## Label creation

## Webhook endpoint and security

## Processing tracking events

## Failures
`,
  keyPoints: [
    'Label creation is a sync chain (station → exp → prc → sys-carrier) with a short timeout, and the label and tracking number are stored with the shipment.',
    'Business rules (cold-chain service, no Friday shipping) are checked in the Process API before calling the carrier.',
    'Webhooks enter through gateway policies; the HMAC signature is verified on the raw body before anything else is done.',
    'The webhook API puts the event on a queue and returns 200 at once, so the carrier never waits on the slow pharmacy system.',
    'The consumer ignores duplicates and older statuses (by event time), updates the pharmacy system through its System API, and sends SMS.',
    'Events wait on the queue while the pharmacy system is offline at night; missed webhooks are recovered by polling the carrier tracking API.',
  ],
  solution: `
\`\`\`
 Packing station -> exp-packing-api -> prc-shipments -> sys-carrier-api -> Carrier API
                                                    -> Shipments and labels
 Carrier -> webhook policies -> exp-carrier-webhook ~> [tracking-events] ~> prc-tracking-updates -> sys-pharmacy-api -> pharmacy
                                                                                               -> SMS
\`\`\`

**Label creation.** prc-shipments loads the order, checks the rules (cold-chain → next-day service; cold-chain on a Friday → refuse with "hold until Monday"), and calls sys-carrier-api with a **2.5 second timeout**. It stores the tracking number and label against the shipment and returns the label to the station. Send the order number as the carrier's idempotency reference, so a retried call does not buy two labels. If the carrier is down, the station shows "label pending", the parcel goes to a holding shelf, and a retry flow prints the label when the carrier is back.

**Webhook endpoint and security.**
- Gateway policies: IP allow list for the carrier's ranges, payload size limit, rate limit.
- exp-carrier-webhook recomputes **HMAC-SHA256** over the **raw body** (before any parsing) with the secret from secure properties and compares it in constant time. Mismatch → 401.
- It validates the JSON, publishes it to \`tracking-events\` and returns **200** at once.

**Processing tracking events.** prc-tracking-updates:
1. drops the event if its \`eventId\` was already processed (Object Store with a 7 day TTL);
2. ignores it if the shipment already has a later status (compare event time), so "out for delivery" after "delivered" does not go backwards;
3. updates the shipment, then calls sys-pharmacy-api for delivered or returned parcels;
4. sends the SMS for "out for delivery" and "delivery failed".

**Failures.** The pharmacy system offline at night: the consumer retries with backoff, then stops and lets messages wait on the queue (Anypoint MQ keeps them for days). Poison messages go to a DLQ. If our endpoint was down longer than the carrier's 10 minute retry window, a scheduled job polls the carrier tracking API for parcels with no event in 24 hours.
`,
  followUps: [
    { q: 'Why verify the HMAC on the raw body?', a: 'Parsing and writing JSON again can change spaces or key order. The signature was computed on the exact bytes the carrier sent.' },
    { q: 'Why return 200 before updating the pharmacy system?', a: 'The pharmacy system takes seconds and is offline at night. The carrier would time out and retry, and after 3 failures the event is lost.' },
    { q: 'How do you stop a late "out for delivery" event from overwriting "delivered"?', a: 'Keep the event time of the current status and ignore any event that is older. Statuses only move forward.' },
    { q: 'How do you avoid buying two labels when the station retries?', a: 'Send the order number as the carrier reference or idempotency key. Check for an existing label on the shipment before calling the carrier.' },
  ],
}
