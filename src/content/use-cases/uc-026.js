import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-026',
  category: 'use-cases',
  title: 'Hotel Channel Manager: Rates, Availability and Reservations',
  level: 'EXPERT',
  tags: ['hospitality', 'ota', 'event-ordering', 'overbooking', 'channel-manager'],
  estMinutes: 45,
  diagram: {
    task: 'draw the channel-manager hub: RMS and PMS feeding an ordered ARI stream, the ARI process with its central store, channel adapters for the OTAs, the reservation path back into the PMS, the direct booking engine and the full-sync job.',
    checks: [
      { label: 'RMS rate changes flow through an ordered stream/queue to the channels', rule: { type: 'path', from: { type: ['saas', 'erp', 'legacy', 'database'], label: ['rms', 'revenue'] }, via: ['event-stream', 'queue', 'topic'], to: 'external-api' } },
      { label: 'A central ARI store keeps the last values sent (for deltas)', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['ari', 'inventory', 'availability'] } } },
      { label: 'Each OTA is reached only through its own adapter (System API)', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Channel reservations are persisted on a queue before PMS delivery', rule: { type: 'path', from: 'external-api', via: ['queue', 'event-stream', 'topic'], to: { type: ['saas', 'erp', 'legacy', 'database'], label: ['pms', 'opera', 'property'] } } },
      { label: 'The PMS is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'erp', 'legacy', 'database'], label: ['pms', 'opera', 'property'] }, from: 'system-api' } },
      { label: 'A new reservation triggers an availability push to the channels', rule: { type: 'path', from: { type: 'process-api', label: ['reserv', 'booking'] }, to: 'external-api' } },
      { label: 'The direct booking engine goes through an Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], edgeTo: 'experience-api' } },
      { label: 'A periodic full sync corrects drift on the channels', rule: { type: 'path', from: 'batch-job', to: 'external-api' } },
    ],
    reference: diagram(
      {
        rms: ['saas', 'Revenue management system (RMS)'],
        pms: ['saas', 'OPERA Cloud PMS'],
        srms: ['system-api', 'sys-rms-api'],
        spms: ['system-api', 'sys-opera-pms-api'],
        ariq: ['event-stream', 'ARI changes (partitioned by hotel+room)'],
        ari: ['process-api', 'prc-ari-distribution (coalesce, fast lane)'],
        store: ['database', 'Central ARI store'],
        resq: ['queue', 'reservations-q'],
        resp: ['process-api', 'prc-reservation-delivery'],
        cbk: ['system-api', 'sys-booking-com-adapter'],
        cexp: ['system-api', 'sys-expedia-adapter'],
        bk: ['external-api', 'Booking.com'],
        ex: ['external-api', 'Expedia'],
        be: ['web-app', 'Booking engine'],
        ebe: ['experience-api', 'exp-booking-engine-api'],
        recon: ['batch-job', 'Nightly full ARI sync & reconciliation'],
      },
      [
        'rms -> srms', 'srms ~> ariq', 'pms ~> spms', 'spms ~> ariq', 'ariq ~> ari', 'ari -> store', 'ari -> cbk', 'ari -> cexp',
        'cbk -> bk', 'cexp -> ex', 'bk ~> cbk', 'ex ~> cexp', 'cbk ~> resq', 'cexp ~> resq', 'be -> ebe', 'ebe ~> resq', 'resq ~> resp',
        'resp -> spms', 'spms -> pms', 'resp -> store', 'resp ~> ariq', 'recon -> cbk', 'recon -> cexp', 'recon -> spms',
      ],
    ),
  },
  description: `
A hotel group with **120 hotels** wants to replace its third-party channel manager with its own integration hub. Each hotel runs a **PMS** (Oracle OPERA Cloud in 90 hotels, a smaller cloud PMS in 30). Rates are set by a **revenue management system (RMS)**. Rooms are sold on:

- The group's own **booking engine** (website/app).
- OTAs: **Booking.com**, **Expedia**, and a GDS connection for corporate travel — each with its own APIs (several use **OpenTravel Alliance (OTA) XML** messages for availability/rate notifications and reservations).

Facts and constraints:
- ARI (availability, rates, inventory) changes: the RMS re-prices several times a day — up to **2 million rate/availability cells** (hotel × room type × rate plan × date for 365 days) per run; bookings change availability constantly.
- ~25,000 reservations/day across channels including modifications and cancellations.
- Channels must reflect availability changes within **60 seconds** — every minute of stale availability risks **overbooking**.
- OTAs rate-limit ARI updates and **penalise** (ranking, fees) on failed or late reservation confirmations; reservations must be confirmed with a PMS confirmation number.
- Last room on a busy night may be booked on two channels within seconds.

**Design the hub:**
- Overall architecture and the source of truth for inventory.
- How do you push ARI updates efficiently (deltas, batching, ordering) within rate limits?
- How do you ingest reservations from all channels reliably into the right PMS (including modifications/cancellations)?
- How do you minimise and handle overbooking?
- How do you onboard a new hotel or channel?
`,
  answerTemplate: `## Architecture and source of truth

## ARI distribution

## Reservation delivery

## Overbooking

## Reliability and reconciliation

## Onboarding hotels and channels
`,
  keyPoints: [
    'Inventory source of truth defined (PMS for physical inventory and reservations, RMS for rates) with a central ARI state in the hub to compute deltas.',
    'ARI pushed as coalesced deltas: changes per hotel/room/rate/date range merged into ranges, latest value wins, batched per channel within its rate limits — not 2M individual calls.',
    'Ordering guaranteed per hotel+room type (partitioned queue/message groups or version numbers) so an older availability value never overwrites a newer one.',
    'Reservations from each channel normalised to a canonical model, persisted before acknowledgement, de-duplicated by channel reservation ID + version, and delivered to the PMS with confirmation numbers returned to the channel.',
    'Overbooking minimised by immediate availability decrement on each reservation, channel-specific allotments/buffers for the last rooms, and stop-sell on low inventory; residual conflicts routed to the hotel with an alert.',
    'Periodic full-sync/reconciliation of ARI and reservations per channel; adapters per PMS and per channel behind canonical contracts make onboarding configuration-driven.',
  ],
  solution: `
**Architecture and source of truth.**
- **PMS** = system of record for physical room inventory and reservations; **RMS** = system of record for prices/restrictions (min stay, closed-to-arrival).
- The **hub** keeps a **central ARI store** (fast database keyed by hotel/room type/rate plan/date) with the last value sent to each channel — that is how deltas are computed and how you answer "what does Booking.com currently think?"
- Layers: **PMS System APIs** (OPERA Cloud APIs/OXI-style interfaces and the other PMS's API), **channel adapters** (Booking.com, Expedia, GDS; OTA XML like \`OTA_HotelAvailNotifRQ\`, \`OTA_HotelRateAmountNotifRQ\`, \`OTA_HotelResNotifRQ\` or channel-specific JSON), **ARI Process** and **Reservation Process** services. Events flow through a durable broker (Kafka or Anypoint MQ with FIFO/message groups where ordering matters).

**ARI distribution.**
- Inputs: RMS rate runs (bulk files/API), PMS availability changes (events on every booking, cancellation, room out of order).
- **Delta + coalescing**: compare incoming values with the ARI store, keep only changes, and **merge consecutive dates with the same value into date ranges** (one message for 14 nights at the same price). 2M cells often shrink to tens of thousands of range updates.
- **Prioritise availability over rates**: availability changes (especially low inventory) go on a fast lane; rate changes on a bulk lane.
- **Batch per channel** within its rate limits (e.g. multiple hotels/room types per request where the API allows). If a newer value for the same cell arrives before sending, send only the newest (**latest wins**).
- **Ordering**: partition by hotel+room type so updates are processed in order; include a version/sequence and drop stale updates. Never let a delayed "5 rooms left" overwrite a newer "0 rooms".
- Channel acknowledgements update the "last sent" state; failures retry with backoff; persistent failures alert and trigger a resync for that hotel/channel.

**Reservation delivery.**
- Channels push reservations (or the hub polls, depending on the channel's model). The adapter validates, **persists the raw message**, and acknowledges per the channel's protocol.
- Normalise to a **canonical reservation** (channel, channel reservation ID, version/modification number, hotel, stay dates, rooms, guests, rate, payment/virtual card token, commission).
- **De-duplicate** by channel + reservation ID + version; process **new → modify → cancel** in order per reservation.
- Deliver to the right PMS via its System API; on success, return the **PMS confirmation number** to the channel (confirmation message) within its deadline. PMS outage → reservations queue up and the hotel is alerted; channels still get an acknowledgement of receipt if their protocol allows, and confirmation later.
- Each new reservation immediately **decrements availability** in the ARI store and triggers a fast-lane availability push to all other channels.
- Card data: use channel virtual cards/tokens; keep the hub out of PCI scope where possible (tokenisation, no PAN in logs or queues).

**Overbooking.**
- Speed: event-driven availability updates, fast lane, measured end-to-end latency (< 60 s target, alert at 30 s).
- **Buffers and allotments**: when inventory drops below a threshold (e.g. last 2 rooms), close lower-priority channels (stop-sell) or keep the last rooms for the direct booking engine; configurable per hotel.
- Some overbooking will still happen (two channels sell the last room within seconds). Detect it (PMS rejects or availability goes negative), **alert the hotel** with both reservations so front office can relocate a guest, and record the case for analysis. Do not auto-cancel a confirmed OTA reservation — penalties and guest impact are worse.

**Reliability and reconciliation.**
- Nightly (and on demand) **full ARI sync** per hotel/channel to correct drift; reservation reconciliation (channel extranet/report vs PMS) to find missing or mismatched bookings.
- Monitoring per hotel and channel: queue lag, update latency, rejection rates, unconfirmed reservations older than N minutes.
- Idempotent processing everywhere so replays from the broker are safe.

**Onboarding hotels and channels.** Hotel onboarding is **configuration**: room type and rate plan **mapping tables** per channel (hotel's codes ↔ channel's codes), PMS connection details, buffers. A new channel means a new adapter implementing the canonical ARI and reservation contracts plus a certification process with the channel. A new PMS type means a new PMS System API — the core processes stay untouched.
`,
  followUps: [
    { q: 'The RMS sends a full re-price for all 120 hotels at 06:00. How long until channels are updated, and how do you avoid starving availability updates?', a: 'Coalesced deltas shrink the volume, rate updates go to a bulk lane with its own consumers and rate-limit budget, and availability keeps a reserved fast lane, so a re-price may take tens of minutes without delaying availability.' },
    { q: 'An OTA sends a modification before the original reservation was processed. What happens?', a: 'Per-reservation ordering by version: the modification waits (or is parked and retried) until the original is applied; if the original never arrives, fetch it from the channel or alert.' },
    { q: 'How do you test this before go-live?', a: 'Channel certification/test environments, a PMS test property, replay of recorded production-like traffic at peak volume, and race-condition tests where the last room is booked on two channels simultaneously.' },
  ],
}
