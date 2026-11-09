import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-109',
  category: 'case-studies',
  title: 'Hotel Group Pushing Rates and Availability to 40 OTAs Through a Channel Manager',
  level: 'INTERMEDIATE',
  tags: ['hospitality', 'channel-manager', 'async', 'anypoint-mq', 'rate-limiting', 'idempotency', 'burst-load'],
  estMinutes: 40,
  diagram: {
    task: 'draw the two flows: ARI (availability, rates, inventory) changes from the CRS queued and pushed to the channel manager at its rate limit, and OTA reservations from the channel manager queued and written to the CRS.',
    checks: [
      { label: 'ARI changes leave the CRS System API as async messages through a queue to the distribution Process API', rule: { type: 'path', from: { type: 'system-api', label: 'crs' }, via: 'queue', to: { type: 'process-api', label: ['ari', 'distribution'] }, kind: 'async' } },
      { label: 'The distribution Process API keeps the latest ARI per room and date to merge bursts', rule: { type: 'edge', from: { type: 'process-api', label: ['ari', 'distribution'] }, to: 'cache' } },
      { label: 'The channel manager is called only through its System API, where the 50 calls per second limit is enforced', rule: { type: 'only-via', target: { type: 'saas', label: 'channel manager' }, from: 'system-api' } },
      { label: 'The CRS is reached only through its System API', rule: { type: 'only-via', target: { type: 'saas', label: ['crs', 'central reservation'] }, from: 'system-api' } },
      { label: 'Reservations from the channel manager are queued before they reach the CRS (no synchronous chain)', rule: { type: 'no-path', from: { type: 'saas', label: 'channel manager' }, to: { type: 'saas', label: ['crs', 'central reservation'] }, kind: 'sync' } },
      { label: 'Imported reservations are written to the CRS through a System API', rule: { type: 'path', from: { type: 'process-api', label: ['reservation', 'import'] }, via: 'system-api', to: { type: 'saas', label: ['crs', 'central reservation'] } } },
      { label: 'ARI distribution and reservation import are separate Process APIs', rule: { type: 'node', match: 'process-api', min: 2 } },
      { label: 'Reservations that keep failing go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'Lines to and from queues and topics are async messages', rule: { type: 'lines', touching: ['queue', 'topic', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        crs: ['saas', 'CRS (central reservation system)'],
        scrs: ['system-api', 'sys-crs-api'],
        ariq: ['queue', 'ari-changes'],
        pari: ['process-api', 'prc-ari-distribution-api'],
        cache: ['cache', 'Latest ARI per hotel, room and date'],
        scm: ['system-api', 'sys-channel-manager-api'],
        cm: ['saas', 'Channel manager'],
        ota: ['external-api', 'OTAs (Booking.com, Expedia and 38 more)'],
        hook: ['experience-api', 'exp-channel-reservation-api'],
        resq: ['queue', 'ota-reservations'],
        pres: ['process-api', 'prc-reservation-import-api'],
        dlq: ['dlq', 'ota-reservations DLQ'],
      },
      [
        'scrs -> crs', 'scrs ~> ariq', 'ariq ~> pari', 'pari -> cache', 'pari -> scm', 'scm -> cm', 'cm -> ota', 'cm -> hook',
        'hook ~> resq', 'resq ~> pres', 'resq ~> dlq', 'pres -> scrs',
      ],
    ),
  },
  description: `
**Context.** A hotel group runs 320 hotels. Its **central reservation system (CRS)**, a SaaS product, is the master for availability and rates. A **revenue management system** sets prices and loads them into the CRS. Hotels sell through the group website (connected to the CRS already) and through about 40 online travel agencies (OTAs) such as Booking.com and Expedia, reached through a **channel manager** SaaS.

**ARI** means availability, rates and inventory: for each hotel, room type, rate plan and date, how many rooms are free and at what price.

**Today.** A vendor script polls the CRS every 20 minutes and sends full ARI files to the channel manager. OTAs sell rooms that were sold out 15 minutes earlier: 1,100 overbookings last quarter, each costing on average 180 EUR in walk fees and compensation. OTA reservations are e-mailed to hotels and keyed into the CRS by hand.

**Volumes**
- 2.5 million ARI changes a day.
- Every morning at 06:00 revenue management republishes prices for 365 days ahead: about **800,000 changes in 30 minutes**.
- 45,000 OTA reservations, modifications and cancellations a day.

**Constraints**
- The channel manager API allows **50 calls per second** for the whole group, each call carrying up to 100 ARI items.
- The CRS exposes a change feed (polled every 30 seconds) and a reservation API.
- The channel manager pushes reservations to a webhook and retries for up to 24 hours if the webhook does not answer 200.
- Reservations may arrive more than once, and a modification can arrive before its original booking.

**Your task.** Design the ARI distribution and reservation import, and explain how you survive the 06:00 burst without breaking the channel manager limit.
`,
  answerTemplate: `## ARI distribution flow

## Handling the 06:00 burst and the 50 calls per second limit

## Reservation import flow

## Duplicates and out-of-order messages

## Monitoring overbookings
`,
  keyPoints: [
    'The CRS System API reads the change feed and publishes ARI changes to a queue; the distribution Process API drains it at a controlled rate.',
    'The distribution Process API keeps the latest value per hotel, room, rate plan and date, so 20 changes to the same night become one update, and batches up to 100 items per call.',
    'Only the channel manager System API calls the channel manager, so the 50 calls per second limit is enforced in one place.',
    'The reservation webhook returns 200 quickly after writing to a queue; the import Process API writes to the CRS with retries and a DLQ.',
    'Reservations are idempotent on the OTA reservation ID and version, and a modification that arrives first is held and retried.',
  ],
  solution: `
**ARI distribution.** \`sys-crs-api\` polls the CRS change feed every 30 seconds and publishes each change to the \`ari-changes\` queue. \`prc-ari-distribution-api\` consumes in batches, writes the newest value for each key \`hotel|roomType|ratePlan|date\` to Object Store, and every second sends what has changed since the last send, in calls of 100 items, through \`sys-channel-manager-api\`.

**The 06:00 burst.** 800,000 changes at 100 items per call is 8,000 calls; at 50 calls per second that is under 3 minutes, before merging. The queue absorbs the burst, and merging means a price republished twice is sent once. Availability changes (a room sold) are sent ahead of rate changes because they cause overbookings, using two queues or a priority field.

**Rate limit.** The System API holds the limit with a throttle in front of the outbound calls, and backs off on HTTP 429. No other app calls the channel manager.

**Reservation import.** \`exp-channel-reservation-api\` checks the signature, writes the message to \`ota-reservations\` and returns 200. \`prc-reservation-import-api\` maps the OTA format to the CRS reservation, and writes it through \`sys-crs-api\`. A modification for an unknown booking is retried with a delay; after 5 attempts it goes to the DLQ and the reservations desk is alerted.

**Monitoring.** Queue depth and age of the oldest ARI change are the key numbers; the target is every availability change at the channel manager within 60 seconds.
`,
  followUps: [
    { q: 'Why merge ARI changes instead of sending each one?', a: 'Many changes hit the same room and night within seconds. Only the latest value matters to the OTA, so merging cuts thousands of calls and keeps the group under its limit.' },
    { q: 'What if the reservation webhook is down for an hour?', a: 'The channel manager retries for 24 hours, so nothing is lost. Once the webhook is back, the queue absorbs the backlog and the import catches up at its own pace.' },
    { q: 'How do you stop a duplicate reservation creating two bookings?', a: 'Keep the OTA reservation ID and version in an idempotency store. A message with an ID and version already processed is acknowledged and skipped.' },
    { q: 'Why send availability ahead of rate changes?', a: 'A stale price costs some margin, while stale availability creates an overbooking that costs walk fees. Ordering by business impact protects the bigger loss.' },
  ],
}
