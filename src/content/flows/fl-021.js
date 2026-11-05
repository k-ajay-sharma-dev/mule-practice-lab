import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-021',
  category: 'flows',
  title: 'Throttling Outbound Calls to a Partner Rate Limit',
  level: 'ADVANCED',
  tags: ['throttling', 'rate-limit', '429', 'anypoint-mq', 'backpressure'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The burst is buffered in a queue consumed by an MQ Subscriber', rule: { type: 'source', component: 'mq-subscriber' } },
    {
      label: 'The subscriber uses manual acknowledgement',
      rule: { type: 'exists', component: 'mq-subscriber', where: { acknowledgementMode: 'MANUAL' } },
    },
    {
      label: 'The last-sent version per SKU is checked before calling the partner',
      rule: { type: 'before', first: ['os-retrieve', 'idempotent', 'db-select'], then: 'http-request' },
    },
    { label: 'The message is acknowledged only after the partner call', rule: { type: 'before', first: 'http-request', then: 'mq-ack' } },
    {
      label: '429 Too Many Requests has its own error handler',
      rule: { type: 'handler', component: ['on-error-continue', 'on-error-propagate'], errorType: 'HTTP:TOO_MANY_REQUESTS' },
    },
    {
      label: 'On 429 the message goes back to the queue instead of being retried in place',
      rule: { type: 'inside', component: 'mq-nack', within: ['on-error-continue', 'on-error-propagate'] },
    },
    {
      label: 'A 429 records a shared "pause until" so every replica backs off',
      rule: { type: 'inside', component: 'os-store', within: ['on-error-continue', 'on-error-propagate'] },
    },
  ],
  referenceFlow: design(
    flow(
      'partner-price-push',
      source('mq-subscriber', { destination: 'price-updates', acknowledgementMode: 'MANUAL' }),
      [
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('set-variable', { variableName: 'update', value: '#[payload]' }),
        step('os-retrieve', {
          key: 'partner-pause-until',
          defaultValue: '#[|1970-01-01T00:00:00Z|]',
          objectStore: 'partner-throttle',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[(payload as DateTime) > now()]' }, [
              step('logger', { level: 'DEBUG', message: '#["Partner back-off active, returning message"]' }),
              step('mq-nack', { ackToken: '#[vars.ackToken]' }),
            ]),
          ],
          {
            otherwise: [
              step('os-retrieve', {
                key: '#["last-sent-" ++ vars.update.sku]',
                defaultValue: '#[|1970-01-01T00:00:00Z|]',
                objectStore: 'sku-versions',
              }),
              router(
                'choice',
                {},
                [
                  route({ expression: '#[(vars.update.effectiveAt as DateTime) <= (payload as DateTime)]' }, [
                    step('logger', { level: 'INFO', message: '#["Stale price for " ++ vars.update.sku ++ " skipped"]' }),
                    step('mq-ack', { ackToken: '#[vars.ackToken]' }),
                  ]),
                ],
                {
                  otherwise: [
                    step('http-request', { method: 'PUT', path: '/prices/{sku}', responseTimeout: 5000 }),
                    step('os-store', {
                      key: '#["last-sent-" ++ vars.update.sku]',
                      value: '#[vars.update.effectiveAt]',
                      objectStore: 'sku-versions',
                    }),
                    step('mq-ack', { ackToken: '#[vars.ackToken]' }),
                  ],
                },
              ),
            ],
          },
        ),
      ],
      [
        handler('on-error-continue', { type: 'HTTP:TOO_MANY_REQUESTS' }, [
          step('os-store', {
            key: 'partner-pause-until',
            value: '#[now() + (("PT" ++ (error.errorMessage.attributes.headers."retry-after" default "1") ++ "S") as Period)]',
            objectStore: 'partner-throttle',
          }),
          step('mq-nack', { ackToken: '#[vars.ackToken]' }),
        ]),
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#[error.description]' }),
          step('mq-nack', { ackToken: '#[vars.ackToken]' }),
        ]),
      ],
    ),
  ),
  description: `
Your company pushes **product price updates** to a marketplace partner API.

**Partner contract**
- **Max 20 requests/second** and **max 5 concurrent connections** per client ID.
- Violations return **429 Too Many Requests** with a \`Retry-After\` header.
- Repeated abuse suspends the account.

**Load**
- Usually 2–5 updates/s.
- The pricing engine sometimes publishes **150,000 updates in 10 minutes**.
- The integration app runs on **3 replicas**.

**Ordering rule**

Updates for the same SKU must not be applied out of order (an older price must not overwrite a newer one).

**Design the flow(s):**
- Buffering
- Enforcing the rate and concurrency limit across replicas
- Handling 429
- Preserving per-SKU correctness
`,
  answerTemplate: `## Buffering the burst

## Enforcing 20 req/s and 5 connections

## Coordinating 3 replicas

## Handling 429 and Retry-After

## Per-SKU correctness

## Monitoring
`,
  keyPoints: [
    'Bursts are absorbed by a queue (Anypoint MQ) between the pricing engine and the partner caller; the inbound side never calls the partner directly.',
    'Concurrency is limited (subscriber concurrency / flow maxConcurrency and HTTP Request maxConnections) so total across replicas is ≤ 5.',
    'Rate is paced to stay below 20/s overall (budget split per replica, or batching updates where the partner supports bulk).',
    'A 429 response is not counted as a failure: the message is retried after Retry-After (Nack/redelivery or delayed requeue), and consumption slows.',
    'Out-of-order updates are prevented with a version/timestamp per SKU (skip stale updates) or by coalescing to the latest price per SKU.',
  ],
  solution: `
1. **Buffer:** pricing engine → **Anypoint MQ** queue \`price-updates\` (via a small ingest API or direct publish). 150k messages wait in the queue instead of hitting the partner.
2. **Concurrency:** consumer app with **Anypoint MQ Subscriber**, concurrency/flow \`maxConcurrency\` and HTTP Request config \`maxConnections\` such that replicas × concurrency ≤ 5 (e.g. 1 + 2 + 2, or simply run the partner-caller as a single replica with concurrency 5).
3. **Rate:** with 5 in-flight calls at ~200 ms each you get ~25/s — above the limit. Pace it: e.g. a **Scheduler** every 1 s that consumes up to N messages (\`Consume\` operation) per replica where N × replicas ≤ 18 (headroom), or add a fixed minimum time per call. For stronger guarantees use a shared token bucket (counter in a shared store/Redis) checked before each call.
4. **Coalesce:** many updates for the same SKU in a burst can be collapsed — DataWeave \`groupBy\` SKU over a consumed batch, keeping the newest by \`effectiveAt\`; fewer calls and no stale overwrite. If the partner supports bulk price updates, send 100 SKUs per call.
5. **429 handling:** HTTP Request \`responseValidator\` treats 429 as an error; On Error Continue for \`HTTP:TOO_MANY_REQUESTS\` reads \`Retry-After\`, Nacks the message (or republishes with a delay), and sets a shared "pause until" timestamp so all workers back off — instead of hammering the partner.
6. **Per-SKU correctness:** include \`effectiveAt\`/version in each message; keep the last-sent version per SKU in an Object Store and skip older ones. FIFO queues are an alternative if throughput allows.
7. **Monitoring:** alert on queue depth/age (SLA for price propagation), 429 count, DLQ size.
`,
  followUps: [
    { q: 'Can the API Manager Rate Limiting policy solve this?', a: 'No — API Manager policies protect your own APIs from inbound traffic. Outbound limits to a partner must be enforced by your integration design.' },
    { q: 'What if you scale to 6 replicas?', a: 'Per-replica budgets must be recalculated or replaced by a shared rate limiter; otherwise each replica\'s local limit multiplies and you exceed the partner contract.' },
    { q: 'Why not retry 429 immediately with Until Successful?', a: 'Immediate retries ignore Retry-After, keep threads busy and look like abuse to the partner; backing off and slowing the whole consumer is the correct reaction.' },
  ],
}
