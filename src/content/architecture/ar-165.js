import { diagram } from '../../arch/dsl.js'

const invoices = { name: 'month-end invoices', from: 'saas', rps: 150, to: 'erp', kind: 'write' }
const poster = { type: 'process-api', label: 'invoice' }

export default {
  id: 'ar-165',
  category: 'architecture',
  title: 'Month-End Invoices Must Be Posted by 06:00: Scale the Poster as Competing Consumers on One Queue, Not as Two Subscribers That Post Everything Twice',
  level: 'ADVANCED',
  tags: ['competing-consumers', 'queue', 'scaling', 'replicas', 'erp', 'finance'],
  estMinutes: 40,
  diagram: {
    task: 'draw the billing platform publishing each invoice to a queue. One invoice poster Process API reads the queue and posts each invoice to the general ledger through a System API.',
    checks: [
      { label: 'The billing platform publishes invoices to a queue', rule: { type: 'edge', from: 'saas', to: 'queue', kind: 'async' } },
      { label: 'Invoices reach the ledger through the queue', rule: { type: 'path', from: 'saas', via: 'queue', to: 'erp' } },
      { label: 'One invoice poster app reads the queue', rule: { type: 'each', of: 'queue', edgeTo: 'process-api', max: 1 } },
      { label: 'The poster posts through a System API', rule: { type: 'path', from: poster, via: 'system-api', to: 'erp' } },
      { label: 'The ledger is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Every line to or from the queue is an async message', rule: { type: 'lines', touching: 'queue', kind: 'async' } },
    ],
    reference: diagram(
      {
        bill: ['saas', 'Billing platform'],
        q: ['queue', 'invoices-to-post'],
        prc: ['process-api', 'prc-invoice-poster', { replicas: 2, vCores: '0.5' }],
        sys: ['system-api', 'sys-ledger', { replicas: 2, vCores: '0.5' }],
        gl: ['erp', 'General ledger'],
      },
      ['bill ~> q', 'q ~> prc', 'prc -> sys', 'sys -> gl'],
    ),
    simulation: {
      systems: [{ match: 'erp', latencyMs: 200, maxRps: 300 }],
      tests: [
        {
          name: 'The month-end run',
          about: 'The billing platform publishes 150 invoices a second for an hour. Each invoice is posted once, the queue never holds much, and it is empty at the end.',
          traffic: [invoices],
          durationMin: 60,
          expect: { delivered: [{ to: 'erp', min: 0.99, max: 1.01 }], backlog: [{ queue: 'queue', maxPeak: 5000, maxEnd: 0 }], lost: { max: 0 } },
        },
        {
          name: 'The ledger stops for 20 minutes',
          about: 'The ledger has a lock during a close step. Invoices wait in the queue, then the posters clear the backlog before the run window ends, and none is posted twice.',
          traffic: [invoices],
          incidents: [{ down: 'erp', at: 10, forMin: 20 }],
          durationMin: 90,
          expect: { delivered: [{ to: 'erp', min: 0.99, max: 1.01 }], backlog: [{ queue: 'queue', maxEnd: 0 }], lost: { max: 0 } },
        },
        {
          name: 'An availability zone goes down',
          about: 'One zone fails during the run. The poster replica in the other zone keeps taking invoices, so they do not pile up, and every invoice is still posted.',
          traffic: [{ ...invoices, rps: 100 }],
          incidents: [{ zone: true, at: 10, forMin: 20 }],
          durationMin: 60,
          expect: { delivered: [{ to: 'erp', min: 0.99, max: 1.01 }], backlog: [{ queue: 'queue', maxPeak: 5000 }], lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A telecoms company bills a million customers at month end. The **billing platform** publishes each invoice as a message, and a Mule **invoice poster** posts it to the **general ledger**. Finance must see every invoice in the ledger by 06:00.

Last month the poster could not keep up and the run finished at 11:00. To go faster, a developer deployed a second copy of the poster under another name and subscribed it to the same **topic**. The run was fast, and every invoice was posted **twice**. Finance spent a week reversing them.

**Numbers**
- About **150 invoices a second** for about an hour at month end.
- The ledger takes about 200 ms per posting and up to **300 postings a second**.
- The ledger sometimes stops for up to 20 minutes during a close step.

**Questions:**
- Draw the design.
- Why did the second subscriber post everything twice, and how do you scale out safely?
- How much capacity do the posters need, and why?
- What happens during a ledger stop and a zone outage?
`,
  answerTemplate: `## Design

## Queue or topic

## Scaling the poster

## Stops and outages
`,
  keyPoints: [
    'A topic gives every subscriber its own copy of each message. Two subscribers that do the same job do it twice.',
    'A queue gives each message to one of its consumers. Several consumers on one queue share the work: the competing consumers pattern.',
    'Scale out by adding replicas of the one poster app reading the queue, not new apps with new subscriptions.',
    'Size the posters for the peak and the catch up after a stop, up to what the ledger can take. Faster than the ledger only fills the ledger\'s own queue.',
    'Two replicas also keep the run going when an availability zone fails.',
    'Make each posting safe to repeat, keyed by invoice number. A redelivery after a crash would otherwise post twice too.',
  ],
  solution: `
**Design**
\`\`\`
Billing platform ~► invoices-to-post (queue) ~► prc-invoice-poster (2 replicas) ─► sys-ledger ─► General ledger
\`\`\`

**Queue or topic.** The invoices go on a queue. Each invoice is delivered to one replica of \`prc-invoice-poster\`. If another team later needs the invoices too, such as a data warehouse, that is the case for a topic or an exchange: one queue per kind of consumer, bound to the exchange, with competing replicas on each queue.

**Scaling the poster.** 150 invoices a second at the smallest size, about 50 a second in this model, would leave a backlog of hundreds of thousands. Two replicas of half a vCore take up to about 500 a second, the System API the same, and the ledger limit of 300 a second is the real ceiling. After a 20 minute stop, 180,000 invoices wait, and the spare room of about 100 a second clears them in about half an hour.

**Order.** Competing consumers do not keep order. Postings of different invoices do not depend on each other here, so that is fine. If two messages for one invoice must stay in order, such as an invoice and its credit note, key them so they go to one consumer, or let the ledger reject a credit note for an invoice it does not have yet and redeliver it.
`,
  followUps: [
    {
      q: 'Could the posters use more replicas to finish faster?',
      a: 'Only up to the ledger limit. Beyond 300 a second the extra calls fail or slow the ledger for everyone. Raise the limit with the ledger team, or post in batches if the ledger has a batch API.',
    },
    {
      q: 'How would you have caught the double posting before production?',
      a: 'A test that counts postings against invoices sent, and a unique constraint on invoice number in the ledger, which would have refused the second posting instead of accepting it.',
    },
  ],
}
