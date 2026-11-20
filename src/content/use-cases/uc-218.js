import { diagram } from '../../arch/dsl.js'

const contacts = { type: 'sql-server', label: 'contacts' }
const events = { name: 'bounce events', from: 'saas', rps: 5, to: contacts, kind: 'write' }
const storm = { ...events, spikes: [{ at: 5, forMin: 3, rps: 300 }] }

export default {
  id: 'uc-218',
  category: 'use-cases',
  title: 'Bounce Webhooks From the Email Provider: Answer Each Event Within Its Deadline, Queue It for the Contacts Database That Takes 50 Writes a Second, and Size the Webhook API for a Campaign to an Old List',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'webhook', 'bounce', 'queues', 'dlq', 'sizing', 'sql-server'],
  estMinutes: 35,
  diagram: {
    task: 'draw the email provider calling an email events Experience API. The API puts each event on a queue with a dead-letter queue. A bounce handler Process API reads the queue and updates the contact through a contacts System API in SQL Server. The provider never waits on SQL Server.',
    checks: [
      { label: 'Events wait on a queue before they reach SQL Server', rule: { type: 'path', from: 'saas', via: 'queue', to: contacts } },
      { label: 'The provider never waits on SQL Server', rule: { type: 'no-path', from: 'saas', to: contacts, kind: 'sync' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: contacts, from: 'system-api' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
    ],
    reference: diagram(
      {
        esp: ['saas', 'Email provider'],
        exp: ['experience-api', 'exp-email-events', { replicas: 2, vCores: '0.5' }],
        q: ['queue', 'email.bounces', { maxRedelivery: 60 }],
        dlq: ['dlq', 'email.bounces.dlq'],
        prc: ['process-api', 'prc-bounce-handler'],
        sys: ['system-api', 'sys-contacts'],
        sql: ['sql-server', 'Store contacts SQL Server'],
      },
      ['esp -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> sql'],
    ),
    simulation: {
      systems: [{ match: contacts, latencyMs: 60, maxRps: 50 }],
      tests: [
        {
          name: 'A normal day',
          about: 'About five events a second. Each gets its answer at once and each reaches the contacts database.',
          traffic: [events],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 5000 }], delivered: [{ to: contacts, min: 0.99 }] },
        },
        {
          name: 'A campaign to an old list',
          about: 'Marketing mails a list from three years ago. The provider sends 300 bounce events a second for three minutes. Every event is answered in time, the database never gets more than 50 writes a second, and every bounce is recorded within the hour.',
          traffic: [storm],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 5000 }], peakRps: [{ node: contacts, max: 50 }], delivered: [{ to: contacts, min: 0.99 }], dlq: { max: 0 } },
        },
        {
          name: 'The contacts database is patched',
          about: 'SQL Server is down for 40 minutes. The provider notices nothing, and every bounce is recorded afterwards.',
          traffic: [events],
          incidents: [{ down: contacts, at: 5, forMin: 40 }],
          durationMin: 100,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: contacts, min: 0.99 }], dlq: { max: 0 } },
        },
        {
          name: 'An event for an address that is not a contact',
          about: 'For an hour, one event in a hundred is for an address the database does not hold, and the update fails every time. Those events end on the dead-letter queue and the queue empties.',
          traffic: [{ ...events, poison: 0.01, forMin: 60 }],
          durationMin: 150,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 5 }] },
        },
      ],
    },
  },
  description: `
Marrow & Pine Home, a fictional home furnishings retailer, sends store and customer email through an **email provider**. The provider reports each bounce by calling a **webhook**: an HTTPS POST with the address and the bounce type. Mule must mark the contact in **SQL Server** so the next send skips it.

The provider's rules (check yours; most providers have similar ones):
- Answer each call with a 2xx within **5 seconds**, or the call counts as failed.
- Failed calls are retried for a while, then dropped. A webhook that keeps failing is switched off.

Today the webhook API updates SQL Server before it answers. After a campaign to an old list the provider sent 300 events a second, SQL Server slowed, answers took 20 seconds, and the provider switched the webhook off for two days.

**Numbers**
- About **5 events a second**; after a campaign to an old list, **300 a second** for three minutes.
- SQL Server takes about **50 contact updates a second** next to its other work, and is down for patching for up to **40 minutes**.
- About **1 event in 100** is for an address that is not a contact (a test send, a typo); its update fails every time. Such an event should reach the dead-letter queue within about an hour and a half.
- In this model one vCore serves about 500 requests a second, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why must the API answer before the database is updated?
- Size the webhook API for the 300 a second burst, and set the queue's redelivery limit.
`,
  answerTemplate: `## Design

## Answer first

## Sizing and settings
`,
  keyPoints: [
    'The provider\'s deadline is about the answer, not the update. Put the event on a queue, answer 200, and let the handler write at SQL Server\'s pace.',
    'The burst is 300 a second. The default tenth of a vCore serves about 50; two replicas of 0.5 vCore serve 500 and keep it up if a zone fails.',
    'The queue holds the burst: about 54,000 events, written at 50 a second in about 18 minutes.',
    '40 minutes of patching needs more than 40 deliveries; 60 covers it and still parks an unknown address within about an hour.',
    'Check the provider\'s signature on each call before queuing it, so nobody else can mark your customers as bounced.',
  ],
  solution: `
**Design**
\`\`\`
Email provider ─► exp-email-events ~► email.bounces ~► prc-bounce-handler ─► sys-contacts ─► Store contacts SQL Server
                                      email.bounces ~► email.bounces.dlq
\`\`\`

**Settings.** \`exp-email-events\`: 2 replicas of 0.5 vCore. \`email.bounces\`: 60 deliveries.

**A dropped event.** If the provider does drop events, most let you list recent bounces through their API. A nightly job that compares the list with SQL Server closes the gap.
`,
  followUps: [
    {
      q: 'The provider sends the same event twice. What happens?',
      a: 'The handler marks the contact BOUNCED twice, which changes nothing the second time. Setting a status is safe to repeat; adding to a bounce count is not, so key such counts on the event ID.',
    },
    {
      q: 'Could the provider write to the queue directly?',
      a: 'Providers call an HTTPS endpoint, not a broker. The thin API is also where the signature is checked and the event shape is validated.',
    },
  ],
}
