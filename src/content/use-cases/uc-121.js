import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-121',
  category: 'use-cases',
  title: 'Library Holds Ready for Pickup: Text and Email Members Without Losing a Message',
  level: 'BEGINNER',
  tags: ['notifications', 'anypoint-mq', 'webhook', 'dlq', 'public-sector'],
  estMinutes: 20,
  diagram: {
    task: 'draw the hold notification flow: the library system sending its webhook to an Experience API, a queue between that API and a notification Process API, a dead-letter queue, the members database the Process API reads contact details from, and the SMS and email provider it calls.',
    checks: [
      { label: 'The library system sends its webhook to an Experience API', rule: { type: 'edge', from: 'saas', to: 'experience-api' } },
      { label: 'The Experience API puts each hold on a queue', rule: { type: 'edge', from: 'experience-api', to: 'queue', kind: 'async' } },
      { label: 'A Process API takes the holds from the queue', rule: { type: 'edge', from: 'queue', to: 'process-api', kind: 'async' } },
      { label: 'The Experience API never calls the provider itself', rule: { type: 'no-path', from: 'experience-api', to: 'notification', kind: 'sync' } },
      { label: 'The Process API sends the text or email through the provider', rule: { type: 'edge', from: 'process-api', to: 'notification' } },
      { label: 'The Process API looks up how each member wants to be told', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        lms: ['saas', 'Library management system'],
        exp: ['experience-api', 'exp-library-events'],
        q: ['queue', 'holds-ready', { maxRedelivery: 40 }],
        dlq: ['dlq', 'holds-ready DLQ'],
        prc: ['process-api', 'prc-member-notifications'],
        mem: ['database', 'Members database (contact preferences)'],
        sms: ['notification', 'SMS and email provider'],
      },
      ['lms -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> mem', 'prc -> sms'],
    ),
    simulation: {
      systems: [{ match: 'notification', latencyMs: 400 }],
      tests: [
        {
          name: 'The provider is down for 20 minutes',
          about: 'The library system reports 2 holds ready a second. The SMS and email provider is down from minute 5 to minute 25. Every hold is accepted, waits in the queue, and is sent once the provider is back. None goes to the DLQ.',
          traffic: [{ name: 'holds', from: 'saas', rps: 2, to: 'notification', kind: 'write' }],
          incidents: [{ down: 'notification', at: 5, forMin: 20 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'notification', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Some members have a wrong phone number',
          about: 'About 1 hold in 50 belongs to a member whose number the provider rejects every time. Those holds stop in the DLQ after their tries, and every other member is told.',
          traffic: [{ name: 'holds', from: 'saas', rps: 2, to: 'notification', kind: 'write', poison: 0.02 }],
          durationMin: 120,
          expect: { delivered: [{ to: 'notification', min: 0.97 }], dlq: { min: 50 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A city library service lets members reserve books. When a reserved book is back on the shelf for them, the **library management system** (a SaaS product) sends a webhook: "hold ready for member M-1042, *The Long Way Home*, at Central Library". The member should get a text or an email, as they chose, within a few minutes.

Today the webhook goes to a Mule API that calls the SMS and email provider straight away. When the provider is down, the API fails, the library system gives up after one try, and the member is never told. Books then go back to the shelf after seven days, unread.

Facts:
- About **2 holds a second** at busy times.
- Member contact details and preferences (text or email) are in a **members database**.
- The provider has an outage of up to half an hour a few times a year.
- Some members have an old phone number that the provider rejects every time.

**Questions:**
- Draw a design that never loses a "hold ready" message.
- What happens during a provider outage?
- What happens to a message that can never be sent?
`,
  answerTemplate: `## Design

## During a provider outage

## Messages that can never be sent
`,
  keyPoints: [
    'The Experience API only accepts the webhook and puts it on a queue. It answers the library system at once, whatever the provider is doing.',
    'A Process API reads the queue, looks up the member\'s preference and calls the provider.',
    'If the provider is down, the message goes back to the queue and is tried again later. Nothing is lost.',
    'The redelivery limit must outlast a normal outage, or good messages end up in the DLQ.',
    'A message that fails every time stops in the dead-letter queue, so it does not block the others. Someone fixes the number and sends it again.',
  ],
  solution: `
**Design**
\`\`\`
Library management system ─► exp-library-events ~► holds-ready ~► prc-member-notifications ─► Members database
                                                        ~► DLQ                     ─► SMS and email provider
\`\`\`

**How it works.**
1. \`exp-library-events\` receives the webhook, checks it and publishes it to the Anypoint MQ queue \`holds-ready\`. It answers 200 in a few milliseconds.
2. \`prc-member-notifications\` subscribes to the queue. For each hold it reads the member's preference and contact details, then asks the provider to send a text or an email.
3. When the provider answers, the message is acknowledged and removed from the queue.

**During a provider outage.** The call fails, so the Process API does not acknowledge the message. The queue delivers it again later. With 2 holds a second, a 20 minute outage leaves about 2,400 messages waiting, and they are all sent within minutes of the provider coming back. The redelivery limit of 40 tries is set so that a message is not given up during an outage like this.

**Messages that can never be sent.** A wrong phone number fails on every try. After 40 tries the queue moves it to \`holds-ready DLQ\`. The library team checks the DLQ each morning, fixes the member's details, and moves the message back to the queue.
`,
  followUps: [
    {
      q: 'Why not retry inside the Experience API until the provider answers?',
      a: 'The library system is waiting for its answer, and it gives up after one try. Holding the webhook open for minutes would fail it anyway. The queue keeps the message safe and lets the API answer at once.',
    },
    {
      q: 'Could a member get the same text twice?',
      a: 'Yes, if the provider sends it but its answer is lost, the message is tried again. Send the hold ID as a reference so the provider or the Process API can spot a repeat, or accept a rare second text.',
    },
  ],
}
