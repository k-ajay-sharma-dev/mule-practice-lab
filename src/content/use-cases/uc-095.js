import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-095',
  category: 'use-cases',
  title: 'Salesforce CPQ Orders into Oracle EBS Order Management',
  level: 'INTERMEDIATE',
  tags: ['salesforce', 'oracle-ebs', 'oracle', 'stored-procedure', 'activemq', 'jms', 'status-sync', 'dlq'],
  estMinutes: 30,
  diagram: {
    task: 'draw how activated Salesforce CPQ orders become Oracle EBS sales orders and how booked, shipped and invoiced status flows back: the order events, the ActiveMQ queue, the Process API, the status job, both System APIs and the dead-letter queue.',
    checks: [
      { label: 'Activated orders leave Salesforce as events', rule: { type: 'edge', from: 'crm', to: ['system-api', 'process-api', 'queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'Orders wait on a queue while EBS is down', rule: { type: 'path', from: 'crm', via: ['queue', 'topic'], to: 'erp' } },
      { label: 'Salesforce never calls EBS in one synchronous chain', rule: { type: 'no-path', from: 'crm', to: 'erp', kind: 'sync' } },
      { label: 'Oracle EBS is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Salesforce is updated only through a System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'The EBS order number is written back to Salesforce', rule: { type: 'path', from: 'process-api', to: 'crm' } },
      { label: 'A scheduled job sends shipped and invoiced status back to Salesforce', rule: { type: 'path', from: 'batch-job', to: 'crm' } },
      { label: 'Orders that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'topic', 'process-api'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        sf: ['crm', 'Salesforce (CPQ orders)'],
        ssf: ['system-api', 'sys-salesforce-api'],
        q: ['queue', 'ORDERS.ACTIVATED (ActiveMQ)'],
        dlq: ['dlq', 'DLQ.ORDERS.ACTIVATED'],
        prc: ['process-api', 'prc-order-to-ebs'],
        sebs: ['system-api', 'sys-oracle-ebs-om-api'],
        ebs: ['erp', 'Oracle EBS Order Management'],
        job: ['batch-job', 'Order status job (every 5 min)'],
      },
      ['sf ~> ssf', 'ssf ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sebs', 'sebs -> ebs', 'prc -> ssf', 'ssf -> sf', 'job -> sebs', 'job -> ssf'],
    ),
  },
  description: `
An industrial equipment maker quotes in **Salesforce CPQ**. When a quote is accepted, sales activates an **Order** in Salesforce. Fulfilment, shipping and invoicing run in **Oracle E-Business Suite 12.2 Order Management** on Oracle 19c. Integration runs on Mule 4 with **ActiveMQ Artemis** as the company broker.

Facts:
- About **900 orders a day**, from 1 to 400 lines. Configured products carry option lines that must stay under their parent line.
- Orders must be **entered and booked** in EBS within 5 minutes; the EBS order number must appear on the Salesforce order.
- Sales reps want to see **Booked, Shipped (with tracking number) and Invoiced** status on the order in Salesforce, within 15 minutes of the change in EBS.
- EBS has a maintenance window every Sunday 02:00 to 06:00. Orders activated then must not be lost.
- The EBS team allows writes only through the public API \`OE_ORDER_PUB.PROCESS_ORDER\`, never inserts into base tables.

**Questions:**
1. How is an activated order picked up?
2. How do you create the order in EBS and make retries safe?
3. How does status come back to Salesforce?
4. What happens during the Sunday window and when EBS rejects an order?
`,
  answerTemplate: `## Pickup

## Creating the order in EBS

## Status back to Salesforce

## Downtime and errors
`,
  keyPoints: [
    'A Salesforce platform event or CDC on Order is received by sys-salesforce-api and put on an ActiveMQ queue.',
    'The Process API consumes in a transaction, maps header, lines and option lines, and calls a PL/SQL wrapper around OE_ORDER_PUB.PROCESS_ORDER through sys-oracle-ebs-om-api.',
    'The Salesforce order id is stored as ORIG_SYS_DOCUMENT_REF, so a redelivered message finds the existing EBS order instead of creating a second one.',
    'A status job every 5 minutes reads order, delivery and invoice changes from EBS views and updates Salesforce in bulk.',
    'During maintenance messages stay on the queue; rejected orders go to the DLQ and the rep sees the reason on the order.',
  ],
  solution: `
**Pickup.** Activating an order publishes the \`Order_Activated__e\` platform event. **sys-salesforce-api** subscribes, stores the replay id and puts one message on the \`ORDERS.ACTIVATED\` queue with the order id as a JMS property.

**Creating the order.** **prc-order-to-ebs** consumes the message in a local transaction. It reads the full order with lines from Salesforce, and maps it in DataWeave to the \`OE_ORDER_PUB\` header and line records, keeping option lines linked to their model line. **sys-oracle-ebs-om-api** calls a PL/SQL wrapper with \`db:stored-procedure\`. The wrapper calls \`PROCESS_ORDER\` and then books the order. The Salesforce order id goes into \`ORIG_SYS_DOCUMENT_REF\`. Before creating, the wrapper checks that reference; if an order already exists, it returns that order number instead. The number is written back to Salesforce, and only then is the transaction committed.

**Status back.** Every 5 minutes the status job asks **sys-oracle-ebs-om-api** for orders whose header, delivery or invoice changed since the last watermark. It sends the changes to Salesforce as one composite update per 200 orders. Tracking numbers come from the delivery details.

**Downtime.** On Sunday night the System API returns connectivity errors. The transaction rolls back and ActiveMQ redelivers with back-off; orders wait on the queue and flow once EBS is back. The status job skips its runs while EBS is down.

**Errors.** A business error from \`PROCESS_ORDER\` (inactive item, missing price list) is not retried. The message moves to \`DLQ.ORDERS.ACTIVATED\` and the Salesforce order gets an integration status of Failed with the message text, so the rep can fix it and reactivate.
`,
  followUps: [
    { q: 'Why wrap OE_ORDER_PUB in your own PL/SQL procedure?', a: 'The API takes complex PL/SQL record types that JDBC cannot pass. A wrapper with plain parameters or an XML input keeps the Mule side clean and holds the duplicate check in one place.' },
    { q: 'Why poll EBS for status instead of using database triggers?', a: 'Triggers on EBS base tables are not supported by Oracle and slow down order entry. A watermark query on last_update_date is cheap and restarts cleanly.' },
    { q: 'How would you avoid the 5 minute delay for shipping status?', a: 'Subscribe to EBS business events for ship confirm through Oracle Advanced Queuing and forward them to ActiveMQ.' },
  ],
}
