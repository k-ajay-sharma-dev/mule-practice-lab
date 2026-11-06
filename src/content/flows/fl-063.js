import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-063',
  category: 'flows',
  title: 'Store Stock Check over JMS Request-Reply with an Oracle Snapshot Fallback',
  level: 'INTERMEDIATE',
  tags: ['retail', 'store-inventory', 'activemq', 'jms', 'request-reply', 'oracle', 'fallback'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Stock checks are served over HTTP', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'Live stock is requested from the store system with JMS Publish-Consume',
      rule: { type: 'exists', component: 'jms-publish-consume' },
    },
    { label: 'The request-reply call is wrapped in a Try scope', rule: { type: 'inside', component: 'jms-publish-consume', within: 'try' } },
    {
      label: 'A reply timeout (JMS:TIMEOUT) is handled inside the Try with On Error Continue',
      rule: { type: 'inside', component: 'on-error-continue', within: 'try', where: { type: 'JMS:TIMEOUT' } },
    },
    {
      label: 'The fallback reads the last stock snapshot from Oracle',
      rule: { type: 'inside', component: 'db-select', within: 'on-error-continue' },
    },
    {
      label: 'One response mapping after the Try covers live and snapshot data',
      rule: { type: 'before', first: 'try', then: 'transform' },
    },
  ],
  referenceFlow: design(
    flow(
      'get-store-stock',
      source('http-listener', { path: '/api/stores/{storeId}/stock', allowedMethods: 'GET' }),
      [
        step('set-variable', {
          variableName: 'query',
          // "" splitBy "," gives [""], so drop empty entries or a missing skus parameter would pass the size check.
          value: '#[{ storeId: attributes.uriParams.storeId, skus: ((attributes.queryParams.skus default "") splitBy ",") filter ($ != "") }]',
        }),
        step('validation', { check: 'is-true', expression: '#[(sizeOf(vars.query.skus) >= 1) and (sizeOf(vars.query.skus) <= 50)]', message: '1 to 50 skus required' }),
        scope(
          'try',
          { transactionalAction: 'INDIFFERENT' },
          [
            step('transform', {
              script: '%dw 2.0\noutput application/json\n---\n{ storeId: vars.query.storeId, skus: vars.query.skus }',
            }),
            // Publishes to STORE.STOCK.REQUEST with a temporary reply-to queue; consumer maximumWait 2000 ms.
            // Selector on JMSCorrelationID is handled by the connector.
            step('jms-publish-consume', { destination: 'STORE.STOCK.REQUEST' }),
            step('set-variable', { variableName: 'source', value: 'LIVE' }),
          ],
          {
            errorHandlers: [
              handler('on-error-continue', { type: 'JMS:TIMEOUT, JMS:CONNECTIVITY' }, [
                step('logger', { level: 'WARN', message: '#["Store " ++ vars.query.storeId ++ " did not answer, using snapshot"]' }),
                step('db-select', {
                  // inputParameters: { storeId: vars.query.storeId, skuCsv: vars.query.skus joinBy "," }
                  sql: "SELECT SKU, ON_HAND_QTY AS QTY, SNAPSHOT_TS\nFROM STORE_STOCK_SNAPSHOT\nWHERE STORE_ID = :storeId\n  AND SKU IN (SELECT REGEXP_SUBSTR(:skuCsv, '[^,]+', 1, LEVEL) FROM DUAL\n              CONNECT BY REGEXP_SUBSTR(:skuCsv, '[^,]+', 1, LEVEL) IS NOT NULL)",
                }),
                step('set-variable', { variableName: 'source', value: 'SNAPSHOT' }),
              ]),
            ],
          },
        ),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\nvar items = if (vars.source == "LIVE") payload.items else (payload map (r) -> { sku: r.SKU, qty: r.QTY, asOf: r.SNAPSHOT_TS })\n---\n{\n  storeId: vars.query.storeId,\n  source: vars.source,\n  items: items map (i) -> {\n    sku: i.sku,\n    available: i.qty as Number,\n    asOf: i.asOf default now()\n  }\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'DB:CONNECTIVITY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { error: "Stock information unavailable" }]' }),
        ]),
      ],
    ),
  ),
  description: `
Store associates use a mobile app to answer "do you have this in stock?" — for their own store or a nearby one. Each store runs a **store inventory server** that listens on the **ActiveMQ** queue \`STORE.STOCK.REQUEST\` (one queue per region, store chosen by a message property) and answers on the \`JMSReplyTo\` destination with live on-hand quantities.

- Up to 50 SKUs per request; ~**40 requests/s** at peak across 600 stores.
- The app needs an answer within **2.5 seconds**.
- Store servers are on shop-floor networks and are **often slow or offline** (about 3% of requests get no reply in 2 s).
- Every night, store on-hand is copied to an **Oracle** table \`STORE_STOCK_SNAPSHOT\` (STORE_ID, SKU, ON_HAND_QTY, SNAPSHOT_TS).

When the store does not answer in time, the API should return the snapshot and make clear it is not live.

**Design the flow(s).**
`,
  answerTemplate: `## API and validation

## Request-reply over JMS

## Timeout and fallback

## Response shape

## Operational concerns
`,
  keyPoints: [
    'JMS Publish-Consume sends the request with a reply-to destination (temporary queue by default) and waits for the correlated reply.',
    'Bound the wait (consumer maximumWait ~2 s) so the API meets its 2.5 s budget; a missing reply raises JMS:TIMEOUT.',
    'Wrap the call in a Try; On Error Continue for JMS:TIMEOUT (and JMS:CONNECTIVITY) reads the Oracle snapshot instead of failing the request.',
    'A single DataWeave mapping after the Try normalises live and snapshot results and marks the source (LIVE vs SNAPSHOT) with an as-of time.',
    'Late replies to a temporary queue are discarded when it is deleted; with a fixed reply queue they must be cleaned up (message TTL).',
  ],
  solution: `
1. **HTTP Listener** \`GET /api/stores/{storeId}/stock?skus=A,B,C\`; validate 1–50 SKUs.
2. **Try**
   - Transform the request body.
   - **JMS Publish Consume** to \`STORE.STOCK.REQUEST\`, message property \`storeId\` (stores consume with a selector), reply-to = temporary queue, **maximumWait 2000 ms**, short **timeToLive** on the request (e.g. 3 s) so a store that comes back online does not process stale requests. The responder is not a Mule app, so set the consumer's **Content Type** to \`application/json\`: the config default for a message that does not state its type is \`*/*\`, and \`payload.items\` needs JSON.
   - \`vars.source = "LIVE"\`.
   - **On Error Continue** for \`JMS:TIMEOUT, JMS:CONNECTIVITY\` → log → **Database Select** from \`STORE_STOCK_SNAPSHOT\` → \`vars.source = "SNAPSHOT"\`.
3. **Transform Message** — one mapping for both shapes: \`{ storeId, source, items[{ sku, available, asOf }] }\`.
4. If Oracle is also down → 503.

**Why not a Scatter-Gather (live + snapshot in parallel)?** It would query Oracle for every request even though 97% are answered live; the fallback only on timeout is cheaper. If p99 matters more than load, run both in parallel and prefer live.

**Operations:** monitor the fallback rate per store (a store always on SNAPSHOT is probably offline). Keep the snapshot query indexed on \`(STORE_ID, SKU)\`. Pass the SKU list to Oracle as a collection or bind list rather than concatenating SQL.
`,
  followUps: [
    {
      q: 'How does JMS Publish Consume match the reply to the request?',
      a: 'It sets JMSReplyTo and a correlation ID on the request and waits on the reply destination for the message with that correlation ID; the responder must copy the correlation ID (or message ID) into the reply.',
    },
    {
      q: 'Why give the request message a time-to-live?',
      a: 'If a store server is offline, requests pile up in the queue. When it reconnects it would answer hundreds of requests nobody is waiting for; TTL lets the broker expire them.',
    },
    {
      q: 'Would you cache the live answers?',
      a: 'A very short cache (10–30 s per store and SKU) can absorb repeated lookups during a busy period, but stock changes quickly, so the response must still carry its as-of time.',
    },
  ],
}
