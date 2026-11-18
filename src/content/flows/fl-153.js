import { design, flow, scope, source, step } from '../../flow/dsl.js'

const batch = (sales) => ({ message: { kind: 'mq', destination: 'till-batches', payload: { storeId: 'ST-114', businessDate: '2026-11-12', sales } } })
const sale = (saleId, sku, qty, amount) => ({ saleId, sku, qty, amount })

export default {
  id: 'fl-153',
  category: 'flows',
  title: 'End of Day Till Batches: Split One Big Message Into One Anypoint MQ Message per Sale',
  level: 'BEGINNER',
  tags: ['myproject', 'queues', 'anypoint-mq', 'splitter', 'foreach', 'retail'],
  estMinutes: 15,
  flowChecks: [
    { label: 'Batches are read from till-batches', rule: { type: 'source', component: 'mq-subscriber', where: { destination: 'till-batches' } } },
    { label: 'The store ID is kept before the loop', rule: { type: 'before', first: 'set-variable', firstWhere: { value: 'storeId' }, then: 'foreach' } },
    { label: 'A For Each goes over the sales in the batch', rule: { type: 'exists', component: 'foreach', where: { collection: 'sales' } } },
    { label: 'Each sale is published to sale-lines inside the loop', rule: { type: 'inside', component: 'mq-publish', within: 'foreach', where: { destination: 'sale-lines' } } },
  ],
  simulation: {
    tests: [
      {
        name: 'A batch of three sales',
        about: 'Store ST-114 sends three sales. Three messages go to sale-lines, each with the store ID and the business date.',
        trigger: batch([sale('S-1', 'BRD-SOUR', 2, 7.2), sale('S-2', 'CAKE-LEM', 1, 14.5), sale('S-3', 'BRD-RYE', 1, 3.9)]),
        expect: {
          ack: 'acked',
          sent: [
            { destination: 'sale-lines', count: 3 },
            { destination: 'sale-lines', count: 1, has: { storeId: 'ST-114', businessDate: '2026-11-12', saleId: 'S-2', sku: 'CAKE-LEM' } },
          ],
        },
      },
      {
        name: 'A store with no sales',
        about: 'A store closed for the day sends an empty batch. Nothing is published and the flow ends without an error.',
        trigger: batch([]),
        expect: { noError: true, notSent: ['sale-lines'], ack: 'acked' },
      },
    ],
  },
  referenceFlow: design(
    flow('split-till-batches', source('mq-subscriber', { destination: 'till-batches', acknowledgementMode: 'AUTO' }), [
      step('set-variable', { variableName: 'storeId', value: '#[payload.storeId]' }),
      step('set-variable', { variableName: 'businessDate', value: '#[payload.businessDate]' }),
      scope('foreach', { collection: '#[payload.sales]' }, [
        step('set-payload', { value: '#[output application/json --- payload ++ { storeId: vars.storeId, businessDate: vars.businessDate }]' }),
        step('mq-publish', { destination: 'sale-lines' }),
      ]),
    ]),
  ),
  description: `
Larchmont Bakeries, a fictional chain, closes each shop's tills at night. The till system publishes one message per shop to the Anypoint MQ queue \`till-batches\`:

\`{ "storeId": "ST-114", "businessDate": "2026-11-12", "sales": [ { "saleId", "sku", "qty", "amount" }, ... ] }\`

A busy shop sends about 900 sales in one message. The stock and loyalty apps want **one message per sale** on the queue \`sale-lines\`, so they can work through them a few at a time and retry one sale without the rest.

**Requirements**
- Read \`till-batches\`.
- Publish each sale to \`sale-lines\`, with \`storeId\` and \`businessDate\` added to it.
- A shop that was closed sends an empty \`sales\` list. That is fine: publish nothing.

**Design the flow.**
`,
  answerTemplate: `## Reading the batch

## Splitting it

## What each message holds
`,
  keyPoints: [
    'This is the splitter pattern: one message in, many out.',
    'For Each sets the payload to one item at a time, so the shop fields must be kept in variables before the loop.',
    'Each message carries everything a consumer needs. The consumer never has to find the batch again.',
    'For Each over an empty list does nothing and does not fail.',
    'With AUTO acknowledgement the batch is acknowledged once every sale is published. A failed publish fails the flow, and the whole batch comes back.',
  ],
  solution: `
1. **Anypoint MQ Subscriber** on \`till-batches\`.
2. **Set Variable** \`storeId\` and **Set Variable** \`businessDate\` from the payload.
3. **For Each** over \`#[payload.sales]\`:
   - **Set Payload** \`#[output application/json --- payload ++ { storeId: vars.storeId, businessDate: vars.businessDate }]\`.
   - **Anypoint MQ Publish** to \`sale-lines\`.

**A batch that fails half way.** If the broker refuses the 400th publish, the batch is delivered again and the first 399 sales are published twice. Give each sale a stable ID (here \`saleId\`), so the consumers can ignore a repeat.

**Very large batches.** For thousands of sales, publish in groups with a Batch Job or publish several messages in one call where the connector allows it. Test the time a big batch takes against the queue's acknowledgement timeout.
`,
  followUps: [
    {
      q: 'Why not let the stock app read the whole batch itself?',
      a: 'A failure on one sale would send all 900 back. With one message per sale, a bad sale is retried or parked alone and the others go through.',
    },
    {
      q: 'Would Parallel For Each be faster?',
      a: 'It can be, but sales from one shop then reach the queue in a different order. If the consumers care about order, keep For Each.',
    },
  ],
}
