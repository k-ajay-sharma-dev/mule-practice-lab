import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-116',
  category: 'flows',
  title: 'Delivery Slot Updates to 250 Franchise Stores: Parallel For Each Capped at the Partner Connection Limit',
  level: 'INTERMEDIATE',
  tags: ['parallel-for-each', 'performance', 'throttling', 'scheduler', 'http-request', 'error-handling', 'retail'],
  estMinutes: 25,
  flowChecks: [
    { label: 'A Scheduler starts the run', rule: { type: 'source', component: 'scheduler' } },
    { label: 'Pending updates are selected before the loop', rule: { type: 'before', first: 'db-select', then: 'parallel-foreach' } },
    {
      label: 'Store calls run in a Parallel For Each, not a sequential For Each',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'http-request', within: 'parallel-foreach' },
          { type: 'absent', component: 'http-request', within: 'foreach' },
        ],
      },
    },
    {
      label: 'Max concurrency is between 6 and 8: fast enough for the 90 second window, inside the limit of 8 connections',
      rule: { type: 'exists', component: 'parallel-foreach', where: { maxConcurrency: { gte: 6, lte: 8 } } },
    },
    {
      label: 'Each store call has a response timeout of 5 seconds or less',
      rule: { type: 'inside', component: 'http-request', within: 'parallel-foreach', where: { responseTimeout: { gte: 1, lte: 5000 } } },
    },
    {
      label: 'A failed store is caught inside the loop with On Error Continue, so the other stores still get their update',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'http-request', within: 'try' },
          { type: 'inside', component: 'on-error-continue', within: 'parallel-foreach' },
        ],
      },
    },
    {
      label: 'Sent rows are marked once, in bulk, after the loop',
      rule: { type: 'before', first: 'parallel-foreach', then: 'db-bulk-update', outside: true },
    },
  ],
  simulation: {
    systems: {
      db: {
        tables: {
          slot_updates: {
            key: 'update_id',
            rows: [
              { update_id: 'U-501', store_id: 'S-101', slots_json: '{"date":"2026-11-14","slots":["09:00","11:00"]}', status: 'PENDING', created_at: '2026-11-13T09:55:00Z', sent_at: null },
              { update_id: 'U-502', store_id: 'S-118', slots_json: '{"date":"2026-11-14","slots":["10:00"]}', status: 'PENDING', created_at: '2026-11-13T09:56:00Z', sent_at: null },
              { update_id: 'U-503', store_id: 'S-240', slots_json: '{"date":"2026-11-14","slots":["13:00","15:00"]}', status: 'PENDING', created_at: '2026-11-13T09:57:00Z', sent_at: null },
              { update_id: 'U-490', store_id: 'S-101', slots_json: '{"date":"2026-11-13","slots":["17:00"]}', status: 'SENT', created_at: '2026-11-13T09:40:00Z', sent_at: '2026-11-13T09:45:00Z' },
            ],
          },
        },
      },
      http: [{ method: 'PUT', path: '/franchise/v1/stores/{storeId}/delivery-slots', latencyMs: 2000, respond: { status: 200, body: { accepted: true } } }],
    },
    tests: [
      {
        name: 'Every store takes its update',
        about: 'Three pending rows go to their stores and are all marked as sent.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          calls: [{ method: 'PUT', path: '/franchise/v1/stores/{storeId}/delivery-slots', count: 3 }],
          db: { slot_updates: { has: [{ update_id: 'U-501', status: 'SENT' }, { update_id: 'U-502', status: 'SENT' }, { update_id: 'U-503', status: 'SENT' }] } },
        },
      },
      {
        name: 'One store is offline',
        about: 'The second store refuses the connection. The other two still get their update, and its row stays pending.',
        trigger: { schedule: {} },
        overrides: {
          systems: {
            http: [
              {
                method: 'PUT',
                path: '/franchise/v1/stores/{storeId}/delivery-slots',
                latencyMs: 2000,
                responses: [{ status: 200, body: { accepted: true } }, { fault: 'CONNECTIVITY' }, { status: 200, body: { accepted: true } }],
              },
            ],
          },
        },
        expect: {
          noError: true,
          calls: [{ method: 'PUT', path: '/franchise/v1/stores/{storeId}/delivery-slots', count: 3 }],
          db: {
            slot_updates: {
              has: [{ update_id: 'U-501', status: 'SENT' }, { update_id: 'U-502', status: 'PENDING' }, { update_id: 'U-503', status: 'SENT' }],
            },
          },
        },
      },
      {
        name: 'One store hangs',
        about: 'The first store takes 20 seconds to answer. Its call times out, its row stays pending, and the others are sent.',
        trigger: { schedule: {} },
        overrides: {
          systems: {
            http: [
              {
                method: 'PUT',
                path: '/franchise/v1/stores/{storeId}/delivery-slots',
                responses: [{ status: 200, body: { accepted: true }, latencyMs: 20000 }, { status: 200, body: { accepted: true }, latencyMs: 2000 }],
              },
            ],
          },
        },
        expect: {
          noError: true,
          db: {
            slot_updates: {
              has: [{ update_id: 'U-501', status: 'PENDING' }, { update_id: 'U-502', status: 'SENT' }, { update_id: 'U-503', status: 'SENT' }],
            },
          },
        },
      },
      {
        name: 'The gateway turns the run away',
        about: 'Every store call gets 503 from the partner gateway. The run still ends cleanly and no row is marked as sent.',
        trigger: { schedule: {} },
        overrides: { systems: { http: [{ method: 'PUT', path: '/franchise/v1/stores/{storeId}/delivery-slots', respond: { status: 503, body: { message: 'Too many connections' } } }] } },
        expect: {
          noError: true,
          db: { slot_updates: { lacks: [{ update_id: 'U-501', status: 'SENT' }, { update_id: 'U-502', status: 'SENT' }, { update_id: 'U-503', status: 'SENT' }] } },
        },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'push-delivery-slots',
      source('scheduler', { strategy: 'fixed-frequency', frequency: 5, timeUnit: 'MINUTES' }),
      [
        step('db-select', {
          database: 'SQL Server',
          sql: "SELECT TOP 300 update_id, store_id, slots_json FROM slot_updates WHERE status = 'PENDING' ORDER BY created_at",
        }),
        scope('parallel-foreach', { collection: '#[payload]', maxConcurrency: 8, timeout: 60000 }, [
          step('set-variable', { variableName: 'updateId', value: '#[payload.update_id]' }),
          scope(
            'try',
            {},
            [
              step('http-request', { method: 'PUT', path: '/franchise/v1/stores/{storeId}/delivery-slots', responseTimeout: 4000 }),
              step('set-payload', { value: '#[{ updateId: vars.updateId, status: "SENT" }]' }),
            ],
            {
              errorHandlers: [
                handler('on-error-continue', { type: 'ANY' }, [
                  step('logger', { level: 'WARN', message: '#["Store update " ++ vars.updateId ++ " failed: " ++ error.description]' }),
                  step('set-payload', { value: '#[{ updateId: vars.updateId, status: "FAILED" }]' }),
                ]),
              ],
            },
          ),
        ]),
        step('transform', {
          script: '%dw 2.0\noutput application/java\n---\n(payload map $.payload) filter ($.status == "SENT") map { updateId: $.updateId }',
        }),
        step('db-bulk-update', { database: 'SQL Server', sql: "UPDATE slot_updates SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE update_id = :updateId" }),
        step('logger', { level: 'INFO', message: '#["Marked " ++ sizeOf(payload) ++ " slot updates as sent"]' }),
      ],
    ),
  ),
  description: `
A grocery chain has **250 franchise stores**. Each store runs its own click-and-collect system behind a partner gateway. When delivery slots change, a row with the status \`PENDING\` is written to the \`slot_updates\` table in SQL Server (\`update_id\`, \`store_id\`, \`slots_json\`, \`status\`), and Mule must push it with \`PUT /franchise/v1/stores/{storeId}/delivery-slots\`.

Facts:
- A run every 5 minutes finds up to **250 pending rows**.
- Each store call takes about **2 seconds**. A few stores are slow or offline at any time.
- The partner gateway allows **at most 8 open connections** from the chain. Above that it returns 503 to every caller.
- The business wants each run to finish in **90 seconds**.

The first version used For Each. It took over 8 minutes, so runs overlapped. A developer then tried Parallel For Each with no limit, and the gateway started returning 503 to everyone.

**Parallel For Each** runs the steps inside it for several items at the same time. **Max concurrency** sets how many items run at once.

**Requirements**
- Send each pending row to its store.
- Respect the gateway limit and still finish in 90 seconds.
- One slow or failed store must not stop the others.
- Set the status of the rows that were sent to \`SENT\`, and leave failed rows as \`PENDING\` for the next run.

**Design the flow.** What value do you choose for max concurrency, and why?
`,
  answerTemplate: `## Trigger and selection

## Choosing max concurrency

## Handling one bad store

## What the payload is after the loop

## Marking rows as sent
`,
  keyPoints: [
    '250 calls at 2 seconds each take about 500 seconds one by one. With 8 at a time it is about 63 seconds, and with 6 it is about 84 seconds.',
    'With 4 at a time a run takes about 125 seconds and misses the window. With no limit, which is the default, all items start at once and break the gateway limit.',
    'A short response timeout stops one offline store from holding a slot for a long time.',
    'Without error handling inside the loop, one failure makes Parallel For Each raise MULE:COMPOSITE_ROUTING after all items finish.',
    'A Try with On Error Continue per item turns a failure into a FAILED result, so the run still completes.',
    'After the loop the payload is a list with one message per item, so read each result with $.payload.',
    'Variables set inside Parallel For Each are not visible after it. Return what you need in the payload of each item.',
    'Mark sent rows in one bulk update after the loop, so failed rows stay pending and are retried next run.',
  ],
  solution: `
1. **Scheduler** every 5 minutes.
2. **Database Select** of up to 300 rows with status \`PENDING\`, oldest first.
3. **Parallel For Each** over the rows, **max concurrency 8**, with a timeout of 60 seconds. Inside it:
   - **Set Variable** \`updateId\`.
   - **Try** with **HTTP Request** \`PUT /franchise/v1/stores/{storeId}/delivery-slots\`, response timeout 4 seconds, then **Set Payload** \`{ updateId, status: "SENT" }\`.
   - **On Error Continue** for \`ANY\` on that Try: log a warning and set the payload to \`{ updateId, status: "FAILED" }\`.
4. **Transform Message**: \`(payload map $.payload) filter ($.status == "SENT")\`, keeping only the IDs.
5. **Database Bulk Update** that sets those rows to \`SENT\`.
6. **Logger** with the count.

**Why 8.** The gateway allows 8 connections in total, so 8 is the ceiling. 250 calls in batches of 8 is 32 rounds of about 2 seconds, so about 63 seconds. If other apps share the same gateway, use 6 and keep about 84 seconds. Set the HTTP requester connection pool to the same size, so the limit holds even if the code changes.

**Why a Try per item.** Parallel For Each collects every result first. If any item failed, it raises \`MULE:COMPOSITE_ROUTING\` at the end, and the whole run would fail and mark nothing. With On Error Continue inside, each item ends with a result and the run marks what was sent.

**Overlapping runs.** With the cap, a run takes about a minute, so it finishes before the next 5 minute tick. Keep the Scheduler on one node, for example with the primary node only setting on a cluster.
`,
  followUps: [
    {
      q: 'Why not keep For Each and run the Scheduler more often?',
      a: 'One run would still take more than 8 minutes for 250 rows. Runs would overlap and send the same rows twice.',
    },
    {
      q: 'How is Parallel For Each different from Scatter-Gather?',
      a: 'Parallel For Each runs the same steps for each item of a list. Scatter-Gather runs different routes with the same input. Both collect all results before they continue.',
    },
    {
      q: 'A store gets the update but the bulk update fails. What happens next run?',
      a: 'The row is still PENDING, so the store gets the same update again. The PUT replaces the slots with the same values, so a repeat is harmless.',
    },
    {
      q: 'Does the order of results after the loop match the input?',
      a: 'Yes. The results come back in the same order as the input list, even though the items ran at the same time.',
    },
  ],
}
