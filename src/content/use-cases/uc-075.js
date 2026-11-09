import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-075',
  category: 'use-cases',
  title: 'Order Confirmation Email and SMS from Store Webhooks',
  level: 'BEGINNER',
  tags: ['webhooks', 'notifications', 'e-commerce', 'idempotency', 'anypoint-mq'],
  estMinutes: 15,
  diagram: {
    task: 'draw the confirmation flow: the store platform webhook, the API that receives it, the queue, the consumer that checks for repeats against a store of processed order numbers, and the email and SMS providers behind a System API.',
    checks: [
      { label: 'The store platform calls a webhook API you expose', rule: { type: 'edge', from: 'saas', to: ['experience-api', 'api-gateway'] } },
      { label: 'The webhook API puts the order on a queue and replies at once', rule: { type: 'edge', from: 'experience-api', to: ['queue', 'cloud-queue'], kind: 'async' } },
      { label: 'The webhook API never waits on the email or SMS service', rule: { type: 'no-path', from: 'experience-api', to: 'notification', kind: 'sync' } },
      { label: 'A consumer Process API reads the queue', rule: { type: 'edge', from: ['queue', 'cloud-queue'], to: 'process-api' } },
      { label: 'Sent order numbers are recorded, so a repeated webhook sends nothing', rule: { type: 'edge', from: 'process-api', to: { type: ['cache', 'database'], label: ['sent', 'dedup', 'processed', 'idempot'] } } },
      { label: 'Both an email and an SMS are sent', rule: { type: 'path', from: 'process-api', to: 'notification', min: 2 } },
      { label: 'Email and SMS providers are reached only through a System API', rule: { type: 'only-via', target: 'notification', from: 'system-api' } },
      { label: 'Messages that keep failing end in a dead-letter queue', rule: { type: 'edge', from: ['queue', 'cloud-queue'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        shop: ['saas', 'Online store platform (orders/create webhook)'],
        wh: ['experience-api', 'exp-store-webhooks (HMAC check)'],
        q: ['queue', 'order-confirmations (Anypoint MQ)'],
        dlq: ['dlq', 'order-confirmations-dlq'],
        prc: ['process-api', 'prc-order-confirmation'],
        sent: ['cache', 'Sent confirmations (Object Store)'],
        snot: ['system-api', 'sys-notifications'],
        mail: ['notification', 'Email service'],
        sms: ['notification', 'SMS provider'],
      },
      ['shop -> wh', 'wh ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sent', 'prc -> snot', 'snot -> mail', 'snot -> sms'],
    ),
  },
  description: `
A homeware brand sells through a hosted online store platform (Shopify style). It takes **about 4,000 orders a day**, with peaks of **300 orders a minute** during promotions.

The brand wants to send its own order confirmations with branded templates, instead of the platform's default email:
- An **email** to every customer.
- An **SMS** to customers who ticked "text me updates" at checkout (about 40 %).

Facts:
- The platform sends an **orders/create webhook** for each order. The request carries an **HMAC signature** header made with a shared secret.
- The platform waits **5 seconds** for a 200 reply. Without one it retries the same webhook up to **19 times over 48 hours**, so the same order can arrive more than once.
- The email service has a REST API (100 requests a second). The SMS provider has a REST API (20 messages a second).
- The confirmation should reach the customer within **2 minutes** of the order.

**Questions:**
1. How do you receive the webhook safely and reply in time?
2. How do you make sure a customer never gets two confirmations for one order?
3. How do you cope with the SMS provider limit during a promotion peak?
4. What happens when the email service is down for an hour?
`,
  answerTemplate: `## Receiving the webhook

## Queue and consumer

## Repeats

## Sending email and SMS

## Failures
`,
  keyPoints: [
    'The webhook API checks the HMAC signature, puts the order on an Anypoint MQ queue and replies 200 within a second.',
    'Sending happens in a separate consumer, so slow providers never make the platform retry.',
    'The order ID is stored in a persistent Object Store before sending, so a repeated webhook sends nothing.',
    'One System API wraps the email and SMS providers, with templates and rate limits in one place.',
    'Failed sends are retried with backoff by redelivery; after the limit the message goes to a dead-letter queue for support.',
  ],
  solution: `
**Receiving the webhook.** exp-store-webhooks exposes POST /webhooks/orders. It computes the HMAC of the raw body with the shared secret and compares it with the header. A bad signature gets 401 and nothing else happens. A good one is published to the **order-confirmations** queue in Anypoint MQ, and the API replies 200. This takes well under a second, so the platform never times out.

**Queue and consumer.** prc-order-confirmation subscribes to the queue. The queue absorbs the promotion peak: 300 orders a minute arrive, and the consumer works through them at its own pace.

**Repeats.** The platform retries, and it may also send the same webhook twice on its own. The consumer looks up the order ID in a **persistent Object Store** (sent confirmations). If it is there, the message is acknowledged and dropped. If not, the consumer sends, then stores the ID with a TTL of 7 days. The store is written after a successful email, so a crash in between can at worst send one repeat. That is much better than sending none.

**Sending.** sys-notifications hides the two providers. It renders the template (order number, items, delivery estimate) and calls the email API. It sends the SMS only when the order says the customer opted in. The SMS limit of 20 a second is kept with a fixed number of consumer threads (for example 4 threads, each about 5 calls a second), so the peak is spread over a few minutes and still inside the 2 minute target for most customers.

**Failures.**
- Email service down: the consumer does not acknowledge, so Anypoint MQ redelivers after the acknowledgement timeout. After 10 deliveries the message moves to **order-confirmations-dlq**. Support can replay it from there once the provider is back.
- A bad payload (missing email) goes straight to the DLQ, since retrying cannot fix it.
- An alert fires when the DLQ holds more than 20 messages.
`,
  followUps: [
    { q: 'Why not send the email inside the webhook call?', a: 'The platform waits only 5 seconds. A slow email service would cause timeouts and platform retries. Queuing first keeps the reply fast and the work safe.' },
    { q: 'Where do you keep the HMAC secret?', a: 'In a secure property, encrypted with the Secure Configuration Properties module. The key comes from the runtime at deploy time, never from the repository.' },
    { q: 'Why record the order ID after sending and not before?', a: 'Recording first means a crash after recording loses the confirmation forever. Recording after sending risks one duplicate in a rare crash, which customers forgive more easily.' },
    { q: 'How would you add push notifications later?', a: 'Add a push provider behind sys-notifications and a channel rule in the consumer. The webhook API and the queue stay unchanged.' },
  ],
}
