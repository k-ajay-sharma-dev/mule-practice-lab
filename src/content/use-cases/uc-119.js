import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-119',
  category: 'use-cases',
  title: 'Car Rental Booking Saga: Vehicle, Deposit and Insurance with Compensation',
  level: 'EXPERT',
  tags: ['saga', 'compensation', 'orchestration', 'idempotency', 'anypoint-mq', 'travel'],
  estMinutes: 45,
  diagram: {
    task: 'draw the orchestrated saga: the booking channels and Experience API, the request queue, the orchestrator with its saga state log, the three System APIs (fleet, payments, insurer) and their back ends, the booking events topic and notifications, the manual review queue, and the sweeper for stuck sagas.',
    checks: [
      { label: 'Booking requests are accepted and queued', rule: { type: 'edge', from: 'experience-api', to: 'queue', kind: 'async' } },
      { label: 'One orchestrator calls all three services', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api', count: 3, some: true } },
      { label: 'Fleet, payments and insurer are reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'payment', 'external-api'], from: 'system-api' } },
      { label: 'The services never call each other', rule: { type: 'no-path', from: 'system-api', to: 'system-api' } },
      { label: 'Saga state is recorded for every step', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'Sagas that cannot be compensated go to manual review', rule: { type: 'edge', from: 'process-api', to: 'dlq' } },
      { label: 'A sweeper finds sagas stuck in a step', rule: { type: 'edge', from: 'batch-job', to: ['database', 'process-api'] } },
      { label: 'Booking outcomes are published as events', rule: { type: 'edge', from: 'process-api', to: 'topic', kind: 'async' } },
      { label: 'The customer never waits on the insurer in a sync chain', rule: { type: 'no-path', from: ['web-app', 'mobile-app'], to: 'external-api', kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Booking website'],
        mob: ['mobile-app', 'Rental app'],
        exp: ['experience-api', 'exp-booking-api'],
        breq: ['queue', 'booking.requests'],
        orch: ['process-api', 'prc-booking-saga (orchestrator)'],
        st: ['database', 'Saga state log (per booking)'],
        sfleet: ['system-api', 'sys-fleet-api'],
        fleet: ['saas', 'Fleet management system'],
        spay: ['system-api', 'sys-payments-api'],
        pay: ['payment', 'Payment provider (deposit holds)'],
        sins: ['system-api', 'sys-insurer-api'],
        ins: ['external-api', 'Insurer SOAP API'],
        evt: ['topic', 'booking.events'],
        notif: ['notification', 'Email and push'],
        manual: ['dlq', 'saga-manual-review'],
        sweep: ['batch-job', 'Stuck saga sweeper (1 min)'],
      },
      [
        'web -> exp', 'mob -> exp', 'exp -> st', 'exp ~> breq', 'breq ~> orch', 'orch -> st', 'orch -> sfleet', 'sfleet -> fleet', 'orch -> spay', 'spay -> pay',
        'orch -> sins', 'sins -> ins', 'orch ~> evt', 'evt ~> notif', 'orch ~> manual', 'sweep -> st', 'sweep -> orch',
      ],
    ),
  },
  description: `
A car rental company takes **30,000 bookings per day** on its website and app (peaks of 25 per second during holiday sales). A booking needs three services, owned by three teams and vendors:

1. **Fleet**: reserve a vehicle of the chosen class at the pick-up branch (SaaS fleet system, REST, 300 ms).
2. **Payments**: place a **deposit hold** on the customer's card (payment provider, 1 to 3 s; holds expire after 7 days).
3. **Insurance**: buy the chosen cover from a partner insurer (**SOAP**, 2 to 20 s, occasional timeouts where the policy may or may not have been created).

Rules:
- A booking is **confirmed** only when all three succeed.
- If a later step fails, earlier steps must be undone: **release the vehicle**, **void the deposit hold**, **cancel the cover**. These are compensations, not rollbacks.
- The customer must never be charged a deposit for a booking that is not confirmed for more than 15 minutes.
- No two bookings may get the same vehicle.
- The insurer bills for every policy not cancelled within 24 hours.
- Today the website calls all three in one HTTP request and does nothing when step 3 fails. Finance finds **~200 orphan deposit holds and ~60 orphan policies per month**.

**Design the saga:**
- Orchestration or choreography, and why?
- The states of a booking and where they are stored.
- What each step does on failure, including a timeout where the outcome is unknown.
- How you make every step and every compensation safe to repeat.
- What the customer sees while the saga runs.
`,
  answerTemplate: `## Orchestration vs choreography

## Saga states and storage

## Steps and compensations

## Unknown outcomes and idempotency

## Customer experience

## Operations
`,
  keyPoints: [
    'Orchestration: one Process API owns the sequence and the state, because three external parties cannot publish and react to each other\'s events.',
    'The saga state log records each step before and after it runs (VEHICLE_HELD, DEPOSIT_HELD, COVER_BOUGHT, CONFIRMED, COMPENSATING, CANCELLED).',
    'Order the steps cheapest to undo first: vehicle, then deposit, then the insurer, whose cancellation is the most expensive.',
    'Every call carries an idempotency key built from booking ID and step, so retries and repeated compensations do no harm.',
    'A timeout is an unknown outcome: query the service by the key before deciding to retry or compensate.',
    'Compensations are retried until they succeed; those that still fail go to a manual review queue with full context.',
    'The API returns 202 with a booking ID; the customer gets "confirming" and then a push or email from the booking events.',
  ],
  solution: `
\`\`\`
 web / app -> exp-booking-api -> saga log (PENDING)  ~> [booking.requests] ~> prc-booking-saga
   prc-booking-saga -> saga log (every step)
                    -> sys-fleet-api -> fleet
                    -> sys-payments-api -> payment provider
                    -> sys-insurer-api -> insurer (SOAP)
                    ~> booking.events ~> email / push
                    ~> saga-manual-review
 stuck saga sweeper -> saga log, -> prc-booking-saga (resume)
\`\`\`

**Orchestration vs choreography.** The fleet system, the payment provider and the insurer do not publish events or listen to each other. Choreography would need adapters for each and leave the booking state spread over three systems. One orchestrator in a Process API holds the sequence, the state and the compensations in one place, which also makes support and audit simple to explain.

**Saga states and storage.** \`saga_log(booking_id, step, status, idempotency_key, request, response, updated_at, version)\`. The Experience API inserts \`PENDING\`, publishes to \`booking.requests\` and returns **202** with the booking ID. The orchestrator writes **before** each call (\`DEPOSIT_REQUESTED\`) and **after** it (\`DEPOSIT_HELD\`). On a crash, the log tells the next run exactly where to continue.

**Steps and compensations.**
| Step | Action | Compensation |
|---|---|---|
| 1 | Reserve vehicle (hold 30 min) | Release vehicle |
| 2 | Deposit hold | Void hold |
| 3 | Buy cover | Cancel policy (free within 24 h) |
| 4 | Confirm vehicle reservation, mark CONFIRMED, publish BookingConfirmed | none |
The vehicle hold is cheap and expires by itself, so it goes first. The insurer is last because it is the slowest and the costliest to undo. On a failure at step N the orchestrator sets \`COMPENSATING\` and runs the compensations of steps N-1 down to 1.

**Unknown outcomes and idempotency.** Each call sends \`Idempotency-Key: {bookingId}-{step}\` (payments) or the booking ID as the insurer's external reference. When the insurer call times out, the orchestrator does **not** assume failure: it asks \`getPolicyByReference\`. Found → continue. Not found after 2 checks → compensate. Compensations are idempotent too: voiding an already voided hold returns success.

**Stuck sagas.** The sweeper looks every minute for sagas with no progress for 2 minutes and sends them back to the orchestrator. Compensations that still fail after 1 hour of retries go to \`saga-manual-review\` with the full log, and finance gets an alert. The deposit rule (15 minutes) is enforced by the sweeper: any DEPOSIT_HELD saga not confirmed within 10 minutes is compensated.

**Customer experience.** The app shows "Confirming your booking" and polls \`GET /bookings/{id}\` or waits for a push. 95 % of sagas finish in under 25 seconds. A cancelled booking shows the reason and that no money was taken.

**Operations.** Dashboards per state, compensation rate per step, insurer timeout rate, and a daily reconciliation of holds and policies against the saga log. The 200 orphan holds and 60 orphan policies a month should drop to the few in manual review.
`,
  followUps: [
    { q: 'Why not use a distributed transaction across the three services?', a: 'The payment provider, the fleet SaaS and the insurer do not support XA. Holding locks across 20 second calls would also block other bookings.' },
    { q: 'Why is the insurer step last?', a: 'It is the slowest and most expensive to undo. Doing it last means it is skipped whenever an earlier step fails.' },
    { q: 'What do you do when the insurer call times out?', a: 'Query the insurer by the booking reference to learn the real outcome. Continue if the policy exists, otherwise compensate.' },
    { q: 'What happens when a compensation keeps failing?', a: 'Retry with backoff, then move the saga to a manual review queue with its full log. Alert the team that owns the money or policy involved.' },
    { q: 'Why write the saga log before each call and not only after?', a: 'A crash during the call leaves a record that the step was started. The next run then checks the outcome instead of guessing.' },
  ],
}
