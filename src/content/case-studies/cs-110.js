import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-110',
  category: 'case-studies',
  title: 'E-Commerce Retailer Integrating 12 Parcel Carriers Behind One Shipping API',
  level: 'INTERMEDIATE',
  tags: ['logistics', 'carrier-integration', 'wms', 'canonical-model', 'track-and-trace', 'anypoint-mq', 'sftp'],
  estMinutes: 40,
  diagram: {
    task: 'draw label creation (the WMS calling one shipping Process API that chooses a carrier and calls one System API per carrier) and tracking (carrier webhooks and SFTP status files feeding one queue that a tracking Process API drains into the OMS).',
    checks: [
      { label: 'Every route from the WMS to a carrier passes the shipping Process API', rule: { type: 'no-path', from: 'wms', to: 'external-api', unless: 'process-api' } },
      { label: 'Carriers are called only by System APIs', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Each of at least three carriers is called by a System API', rule: { type: 'each', of: 'external-api', min: 3, edgeFrom: 'system-api' } },
      { label: 'No System API serves two carriers (one System API per carrier)', rule: { type: 'each', of: 'system-api', edgeTo: 'external-api', count: 0, max: 1 } },
      { label: 'The shipping Process API can choose among at least three carriers', rule: { type: 'edge', from: { type: 'process-api', label: ['label', 'shipping'] }, to: 'system-api', min: 3 } },
      { label: 'Label creation is a synchronous call for every carrier (the packer waits for the label)', rule: { type: 'path', from: 'wms', to: 'external-api', kind: 'sync', min: 3 } },
      { label: 'One tracking queue receives both webhook events and SFTP file events', rule: { type: 'each', of: 'queue', edgeFrom: ['experience-api', 'batch-job'], count: 2, some: true } },
      { label: 'The SFTP file poller reads the carrier status files', rule: { type: 'link', from: 'batch-job', to: 'sftp-server' } },
      { label: 'No synchronous chain runs from a carrier to the OMS', rule: { type: 'no-path', from: 'external-api', to: { type: 'saas', label: ['oms', 'order management'] }, kind: 'sync' } },
      { label: 'The OMS is updated only through a System API', rule: { type: 'only-via', target: { type: 'saas', label: ['oms', 'order management'] }, from: 'system-api' } },
      { label: 'Status events that cannot be processed go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        wms: ['wms', 'Manhattan WMS (pack stations)'],
        pl: ['process-api', 'prc-shipping-label-api'],
        rules: ['database', 'Carrier rules and rate cards'],
        sdhl: ['system-api', 'sys-carrier-dhl-api'],
        sups: ['system-api', 'sys-carrier-ups-api'],
        sdpd: ['system-api', 'sys-carrier-dpd-api'],
        dhl: ['external-api', 'DHL Parcel API'],
        ups: ['external-api', 'UPS API'],
        dpd: ['external-api', 'DPD API'],
        ev: ['experience-api', 'exp-carrier-events-api'],
        sftp: ['sftp-server', 'Carrier status files (SFTP)'],
        job: ['batch-job', 'carrier-file-poller'],
        tq: ['queue', 'tracking-events'],
        dlq: ['dlq', 'tracking-events DLQ'],
        pt: ['process-api', 'prc-tracking-api'],
        soms: ['system-api', 'sys-oms-api'],
        oms: ['saas', 'Order management (OMS)'],
        notif: ['notification', 'Customer e-mail and SMS'],
      },
      [
        'wms -> pl', 'pl -> rules', 'pl -> sdhl', 'pl -> sups', 'pl -> sdpd', 'sdhl -> dhl', 'sups -> ups', 'sdpd -> dpd',
        'dhl -> ev', 'ups -> ev', 'ev ~> tq', 'job -> sftp', 'job ~> tq', 'tq ~> pt', 'tq ~> dlq', 'pt -> soms',
        'soms -> oms', 'pt ~> notif',
      ],
    ),
  },
  description: `
**Context.** A fashion e-commerce retailer ships 180,000 parcels a day from three warehouses in Europe, rising to 450,000 on Black Friday. It uses 12 parcel carriers: DHL, UPS, DPD, GLS, PostNL, Colissimo and six regional ones.

**Today**
- Each carrier is integrated inside the **Manhattan WMS** as a custom extension written by the WMS vendor. Adding a carrier takes four months and costs about 80,000 EUR.
- The WMS always uses the carrier hard-coded per country, even when another carrier is cheaper or faster for that postcode.
- Tracking: eight carriers send status webhooks, four drop CSV status files on an SFTP server every 15 minutes. A nightly job loads both into the **order management system (OMS)**, so customers see "shipped" for a day after delivery.

**Goals**
- Add a new carrier in under four weeks, without changing the WMS.
- Choose the carrier per parcel using rules: destination, weight, service level, cost and carrier capacity.
- Fall back to a second carrier when the first carrier's API is down.
- Customers see delivery status within 15 minutes.

**Constraints**
- At the pack station the packer waits for the label: **2 seconds** at the 95th percentile.
- Peak label rate is 30 per second.
- Carrier APIs differ: REST and SOAP, ZPL or PDF labels, different status codes.
- Carrier status events are about 2 million a day, with bursts when a carrier sends a backlog after an outage.

**Your task.** Design the shipping and tracking integration, and describe the canonical model that makes a new carrier a four-week job.
`,
  answerTemplate: `## Label creation flow

## Carrier selection and fallback

## Canonical shipment and status model

## Tracking flow (webhooks and files)

## Onboarding a new carrier
`,
  keyPoints: [
    'The WMS calls one shipping Process API with a canonical shipment; it never knows which carriers exist.',
    'One System API per carrier implements the same canonical contract (create shipment, cancel, label) and hides the carrier protocol and label format.',
    'The Process API applies selection rules from a rules store and falls back to the next carrier when one fails or times out, within the 2 second budget.',
    'Webhook events and SFTP file rows are normalised to one canonical status and put on one queue; a tracking Process API updates the OMS and notifies customers.',
    'A new carrier is a new System API built from a template plus rule and status-code mapping data, with no change to the WMS or the Process API code.',
  ],
  solution: `
**Label creation.** The WMS sends \`POST /shipments\` with a canonical shipment (addresses, parcels, weights, service level) to \`prc-shipping-label-api\`. The Process API reads the carrier rules and rate cards, ranks candidate carriers, and calls the first one's System API with a 1.2 second timeout. If it fails or times out, it calls the next carrier. It returns the label (always ZPL for the pack station printers) and the tracking number.

**Carrier System APIs.** \`sys-carrier-<name>-api\` all implement one RAML from Exchange: create shipment, cancel shipment, get label. Each converts to the carrier's protocol, converts PDF labels to ZPL when needed, and has a circuit breaker so a failing carrier is skipped quickly.

**Canonical status.** A small status list (\`ACCEPTED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, FAILED_ATTEMPT, RETURNED\`) with a mapping table per carrier. Unknown codes are kept and flagged, not dropped.

**Tracking.** \`exp-carrier-events-api\` receives webhooks, checks each carrier's signature, maps the status and writes to \`tracking-events\`. \`carrier-file-poller\` reads SFTP files every 5 minutes and writes one message per row to the same queue. \`prc-tracking-api\` updates the OMS through \`sys-oms-api\` and sends delivery notifications. Duplicate events are ignored by tracking number, status and timestamp.

**New carrier.** Copy the System API template, map the carrier calls, load its status mapping and rules. Target three to four weeks including carrier certification.
`,
  followUps: [
    { q: 'Why one System API per carrier instead of one generic carrier API?', a: 'Each carrier has its own protocol, authentication and failure modes. Separate APIs deploy, scale and fail independently, while the shared RAML contract keeps them interchangeable for the Process API.' },
    { q: 'How do you meet 2 seconds when the first carrier times out?', a: 'Give the first carrier a short timeout and a circuit breaker. When the breaker is open, the Process API goes straight to the second carrier with no waiting.' },
    { q: 'What happens to tracking events if the OMS is down?', a: 'They stay on the queue and are retried with backoff. Once the OMS recovers the backlog drains, and only messages failing repeatedly reach the DLQ.' },
    { q: 'Why put file rows and webhook events on the same queue?', a: 'Both become the same canonical status event. One consumer applies the same rules, deduplication and OMS update, whatever the source.' },
  ],
}
