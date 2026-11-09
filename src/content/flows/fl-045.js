import { design, flow, handler, route, router, scope, source, step, subFlow } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-045',
  category: 'flows',
  title: 'Inventory Holds with Retries, Release on Failure and Expiry Sweeper',
  level: 'ADVANCED',
  tags: ['inventory', 'until-successful', 'compensation', 'scheduler', 'reservation'],
  estMinutes: 45,
  flowChecks: [
    {
      label: 'The hold is recorded (with an expiry) before the warehouse is called',
      rule: { type: 'before', first: ['db-insert', 'os-store'], then: ['until-successful', 'foreach', 'http-request'] },
    },
    { label: 'Calls to the flaky WMS are retried with Until Successful', rule: { type: 'inside', component: 'http-request', within: 'until-successful' } },
    {
      label: 'Out-of-stock is turned into a business error outside the retry scope, so it is never retried',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'raise-error', within: 'choice' },
          { type: 'absent', component: 'raise-error', within: 'until-successful' },
        ],
      },
    },
    {
      label: 'On failure, lines already reserved are released (compensation from the error handler)',
      rule: {
        type: 'inside',
        component: 'http-request',
        where: { method: 'DELETE' },
        within: ['on-error-propagate', 'on-error-continue'],
        withinWhere: { type: { oneOf: ['APP:', 'RETRY_EXHAUSTED', 'ANY'] } },
      },
    },
    {
      label: 'A rejected hold is answered with 409',
      rule: handlerStatus({ oneOf: ['APP:', 'ANY'] }, '409'),
    },
    {
      label: 'A release that keeps failing is parked on a queue for later retry',
      rule: { type: 'inside', component: ['mq-publish', 'vm-publish', 'jms-publish'], within: ['on-error-continue', 'on-error-propagate'] },
    },
    { label: 'A Scheduler sweeper releases holds that expired without checkout', rule: { type: 'source', component: 'scheduler' } },
    {
      label: 'The sweeper runs often enough to free expired stock within 2 minutes',
      rule: {
        type: 'any',
        rules: [
          { type: 'source', component: 'scheduler', where: { strategy: 'fixed-frequency', timeUnit: 'MINUTES', frequency: { gte: 1, lte: 2 } } },
          { type: 'source', component: 'scheduler', where: { strategy: 'fixed-frequency', timeUnit: 'SECONDS', frequency: { gte: 1, lte: 120 } } },
          { type: 'source', component: 'scheduler', where: { strategy: 'cron' } },
        ],
      },
    },
    {
      label: 'A commit endpoint converts the hold only if it has not expired',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'http-listener', min: 2 },
          { type: 'before', first: 'http-listener', then: 'db-update', thenWhere: { sql: { all: ['COMMITTED', 'expires_at'] } } },
        ],
      },
    },
  ],
  referenceFlow: design(
    flow(
      'create-hold',
      source('http-listener', { path: '/inventory/v1/holds', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'holdId', value: '#[uuid()]' }),
        step('set-variable', { variableName: 'reserved', value: '#[[]]' }),
        step('set-variable', { variableName: 'cart', value: '#[payload]' }),
        step('db-insert', {
          sql: "INSERT INTO inventory_hold (hold_id, cart_id, status, expires_at) VALUES (:holdId, :cartId, 'PENDING', CURRENT_TIMESTAMP + INTERVAL '15' MINUTE)",
        }),
        scope('foreach', { collection: '#[vars.cart.lines]', batchSize: 1 }, [
          scope('until-successful', { maxRetries: 3, millisBetweenRetries: 2000 }, [
            step('http-request', { method: 'POST', path: '/wms/api/reservations', responseTimeout: 3000 }),
          ]),
          router(
            'choice',
            {},
            [
              route({ expression: '#[attributes.statusCode == 409]' }, [
                step('raise-error', { type: 'APP:OUT_OF_STOCK', description: 'Insufficient stock for a cart line' }),
              ]),
            ],
            { otherwise: [step('set-variable', { variableName: 'reserved', value: '#[vars.reserved << payload.reservationId]' })] },
          ),
        ]),
        step('db-update', {
          sql: "UPDATE inventory_hold SET status = 'HELD', wms_refs = :reserved WHERE hold_id = :holdId",
        }),
        step('set-variable', { variableName: 'httpStatus', value: '201' }),
        step('set-payload', { value: '#[output application/json --- { holdId: vars.holdId, status: "HELD" }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'APP:OUT_OF_STOCK, MULE:RETRY_EXHAUSTED' }, [
          step('flow-ref', { name: 'release-reservations' }),
          step('db-update', { sql: "UPDATE inventory_hold SET status = 'RELEASED' WHERE hold_id = :holdId" }),
          step('set-variable', { variableName: 'httpStatus', value: '409' }),
          step('set-payload', { value: '#[output application/json --- { holdId: vars.holdId, status: "REJECTED", reason: error.description }]' }),
        ]),
      ],
    ),
    subFlow('release-reservations', [
      scope('foreach', { collection: '#[vars.reserved]', batchSize: 1 }, [
        scope('try', { transactionalAction: 'INDIFFERENT' }, [
          scope('until-successful', { maxRetries: 3, millisBetweenRetries: 2000 }, [
            step('http-request', { method: 'DELETE', path: '/wms/api/reservations/{reservationId}', responseTimeout: 3000 }),
          ]),
        ], {
          errorHandlers: [
            handler('on-error-continue', { type: 'ANY' }, [
              step('set-payload', { value: '#[output application/json --- { holdId: vars.holdId, reservationId: payload }]' }),
              step('mq-publish', { destination: 'wms-release-retry' }),
            ]),
          ],
        }),
      ]),
    ]),
    flow('expired-hold-sweeper', source('scheduler', { strategy: 'fixed-frequency', frequency: 1, timeUnit: 'MINUTES' }), [
      step('db-select', {
        sql: "SELECT hold_id, wms_refs FROM inventory_hold WHERE status IN ('PENDING', 'HELD') AND expires_at < CURRENT_TIMESTAMP FOR UPDATE SKIP LOCKED",
      }),
      scope('foreach', { collection: '#[payload]', batchSize: 1 }, [
        step('set-variable', { variableName: 'holdId', value: '#[payload.hold_id]' }),
        step('set-variable', { variableName: 'reserved', value: '#[payload.wms_refs default []]' }),
        step('flow-ref', { name: 'release-reservations' }),
        step('db-update', { sql: "UPDATE inventory_hold SET status = 'EXPIRED' WHERE hold_id = :holdId AND status <> 'COMMITTED'" }),
      ]),
    ]),
    flow(
      'commit-hold',
      source('http-listener', { path: '/inventory/v1/holds/{holdId}/commit', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'holdId', value: '#[attributes.uriParams.holdId]' }),
        step('db-update', {
          sql: "UPDATE inventory_hold SET status = 'COMMITTED' WHERE hold_id = :holdId AND status = 'HELD' AND expires_at > CURRENT_TIMESTAMP",
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[payload.affectedRows == 0]' }, [
              step('set-variable', { variableName: 'httpStatus', value: '410' }),
              step('set-payload', { value: '#[output application/json --- { message: "Hold expired or unknown" }]' }),
            ]),
          ],
          {
            otherwise: [
              step('http-request', { method: 'POST', path: '/wms/api/reservations/commit', responseTimeout: 3000 }),
              step('set-payload', { value: '#[output application/json --- { holdId: vars.holdId, status: "COMMITTED" }]' }),
            ],
          },
        ),
      ],
    ),
  ),
  description: `
An online shop reserves stock when a customer enters checkout, so items are not sold twice during payment.

- The cart has 1–20 lines; the **Warehouse Management System (WMS)** reserves **one line per call** (\`POST /reservations\` → \`reservationId\`, \`409\` if insufficient stock, \`DELETE /reservations/{id}\` to release).
- The WMS is flaky: ~2% of calls fail with 503 or time out.
- A hold must be **all or nothing**: if any line cannot be reserved, lines already reserved must be released and the shop gets 409.
- A hold **expires after 15 minutes** if checkout is not completed (abandoned carts, browser closed, Mule restart mid-request). Expired stock must go back on sale within 2 minutes.
- Checkout completion calls a **commit** endpoint; a hold that has already expired must not be committed.
- Peak: 50 holds/s during sales events.

**Facts**
- Holds are kept in the table \`inventory_hold\` with columns \`hold_id\`, \`cart_id\`, \`status\` and \`expires_at\`.
- A hold's \`status\` is \`PENDING\`, \`HELD\`, \`COMMITTED\`, \`RELEASED\` or \`EXPIRED\`.

**Design the flow(s):** hold creation, retries, out-of-stock handling, compensation, expiry and commit.
`,
  answerTemplate: `## Hold record and lifecycle

## Reserving lines

## Retries vs business errors

## Releasing on failure

## Expiry sweeper

## Commit
`,
  keyPoints: [
    'Persist the hold (PENDING, expires_at) before calling the WMS so a crash mid-request still leaves something the sweeper can clean up.',
    'Until Successful retries only transient failures; a 409 is treated as a successful HTTP response and turned into APP:OUT_OF_STOCK with Raise Error, so it is not retried.',
    'The error handler calls a release sub-flow that deletes every reservation already made (compensation) and marks the hold RELEASED.',
    'Releases are retried too; one that still fails is published to a retry queue rather than leaking stock.',
    'A Scheduler sweeper releases holds past expires_at; commit uses a conditional UPDATE (status = HELD and not expired) so commit and sweeper cannot both win.',
  ],
  solution: `
**Hold lifecycle:** \`PENDING → HELD → COMMITTED\`, or \`→ RELEASED / EXPIRED\`. The row (with \`expires_at = now + 15 min\`) is inserted **first**.

**create-hold** — \`POST /inventory/v1/holds\`
1. Insert hold row (PENDING).
2. **For Each** line: **Until Successful** (3 × 2 s) around \`POST /reservations\`. Configure the HTTP Request so 409 is not an error (success codes 200..299,409) — Until Successful must not burn retries on a business rejection.
3. **Choice**: 409 → **Raise Error** \`APP:OUT_OF_STOCK\`; else append \`reservationId\` to \`vars.reserved\`.
4. Update the hold to HELD with the WMS references → 201.
5. **On Error Propagate** (\`APP:OUT_OF_STOCK, MULE:RETRY_EXHAUSTED\`): flow-ref \`release-reservations\` → mark RELEASED → 409.

**release-reservations** (sub-flow) — For Each reserved id → Try → Until Successful \`DELETE /reservations/{id}\`; **On Error Continue** publishes \`{ holdId, reservationId }\` to \`wms-release-retry\` (worker with DLQ) so a failed release is never forgotten.

**expired-hold-sweeper** — Scheduler every minute (primary node) → select expired PENDING/HELD holds (\`FOR UPDATE SKIP LOCKED\` if several replicas run it) → release → EXPIRED.

**commit-hold** — conditional \`UPDATE ... WHERE status = 'HELD' AND expires_at > now\`. 0 rows → **410 Gone** (the shop must re-reserve); 1 row → confirm with the WMS. Because both commit and sweeper use conditional updates, exactly one of them wins a race.
`,
  followUps: [
    {
      q: 'Why not rely on the WMS to expire reservations itself?',
      a: 'If the WMS supports a TTL on reservations, use it — it is the safest. Many legacy WMSs do not, and even then you still need the local hold state to reject late commits and report status.',
    },
    {
      q: 'What exactly does Until Successful retry, and what error do you get at the end?',
      a: 'It re-runs its whole scope on any error until it succeeds or maxRetries is reached, then raises MULE:RETRY_EXHAUSTED rather than the last error type. That is why business errors must not be raised inside it.',
    },
    {
      q: 'How would you reserve 20 lines faster?',
      a: 'Use Parallel For Each with a bounded concurrency (the WMS calls are independent), collecting reservation IDs from the results; compensation then releases whatever succeeded. Or ask for a WMS multi-line endpoint.',
    },
  ],
}
