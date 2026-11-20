import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const repair = (repairId, priority) => ({ http: { method: 'POST', path: '/repairs', body: { repairId, propertyId: 'PR-1180', priority, fault: 'No heating', reportedAt: '2026-11-13T06:40:00Z' } } })

export default {
  id: 'fl-156',
  category: 'flows',
  title: 'Emergency Repairs Stuck Behind Routine Ones: Two Anypoint MQ Queues as Priority Lanes',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'queues', 'anypoint-mq', 'priority', 'http', 'housing'],
  estMinutes: 25,
  flowChecks: [
    { label: 'Repairs come in on POST /repairs', rule: { type: 'source', component: 'http-listener', where: { path: '/repairs', allowedMethods: 'POST' } } },
    { label: 'Emergency repairs are published to repairs-emergency', rule: { type: 'inside', component: 'mq-publish', within: 'choice', where: { destination: 'repairs-emergency' } } },
    { label: 'All other repairs are published to repairs-routine', rule: { type: 'inside', component: 'mq-publish', within: 'choice', where: { destination: 'repairs-routine' } } },
    { label: 'A subscriber of its own reads repairs-emergency', rule: { type: 'source', component: 'mq-subscriber', where: { destination: 'repairs-emergency' } } },
    { label: 'A second subscriber reads repairs-routine', rule: { type: 'source', component: 'mq-subscriber', where: { destination: 'repairs-routine' } } },
  ],
  simulation: {
    systems: { http: [{ method: 'POST', path: '/field-service/v1/jobs', respond: { status: 201, body: { jobId: 'J-44120' } } }] },
    tests: [
      {
        name: 'A burst pipe',
        about: 'An EMERGENCY repair goes on the emergency queue, is answered with 202, and its job is created by the emergency subscriber.',
        trigger: repair('RP-8812', 'EMERGENCY'),
        expect: {
          status: 202,
          bodyHas: { repairId: 'RP-8812', lane: 'emergency' },
          sent: [{ destination: 'repairs-emergency', count: 1 }],
          notSent: ['repairs-routine'],
          calls: [{ method: 'POST', path: '/field-service/v1/jobs', count: 1, has: { repairId: 'RP-8812', priority: 'EMERGENCY' } }],
        },
      },
      {
        name: 'A dripping tap',
        about: 'A ROUTINE repair goes on the routine queue.',
        trigger: repair('RP-8813', 'ROUTINE'),
        expect: { status: 202, bodyHas: { lane: 'routine' }, sent: [{ destination: 'repairs-routine', count: 1 }], notSent: ['repairs-emergency'], calls: [{ method: 'POST', path: '/field-service/v1/jobs', count: 1 }] },
      },
      {
        name: 'A repair with no priority',
        about: 'The old contact centre screen leaves priority out. It is treated as routine.',
        trigger: repair('RP-8814'),
        expect: { status: 202, sent: [{ destination: 'repairs-routine', count: 1 }], notSent: ['repairs-emergency'] },
      },
    ],
  },
  referenceFlow: design(
    flow('repair-intake', source('http-listener', { path: '/repairs', allowedMethods: 'POST' }), [
      step('set-variable', { variableName: 'repairId', value: '#[payload.repairId]' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[upper(payload.priority default "") == "EMERGENCY"]' }, [
            step('mq-publish', { destination: 'repairs-emergency' }),
            step('set-variable', { variableName: 'lane', value: 'emergency' }),
          ]),
        ],
        { otherwise: [step('mq-publish', { destination: 'repairs-routine' }), step('set-variable', { variableName: 'lane', value: 'routine' })] },
      ),
      step('set-variable', { variableName: 'httpStatus', value: '202' }),
      step('set-payload', { value: '#[output application/json --- { repairId: vars.repairId, lane: vars.lane }]' }),
    ]),
    flow('emergency-repairs', source('mq-subscriber', { destination: 'repairs-emergency', acknowledgementMode: 'AUTO' }), [
      step('http-request', { method: 'POST', path: '/field-service/v1/jobs' }),
    ]),
    flow('routine-repairs', source('mq-subscriber', { destination: 'repairs-routine', acknowledgementMode: 'AUTO' }), [
      step('http-request', { method: 'POST', path: '/field-service/v1/jobs' }),
    ]),
  ),
  description: `
Brindle Homes, a fictional housing association, takes repair requests from tenants through \`POST /repairs\`:

\`{ "repairId": "RP-8812", "propertyId": "PR-1180", "priority": "EMERGENCY", "fault": "No heating", "reportedAt": "..." }\`

Every repair went on one Anypoint MQ queue, and a subscriber created a job in the field service system with \`POST /field-service/v1/jobs\`. After a storm, 3,000 routine repairs arrived in one morning. A burst pipe reported at 09:00 waited behind them until the afternoon.

The team asked whether Anypoint MQ can give some messages a higher priority. It does not offer message priority, so you give emergencies a lane of their own.

**Requirements**
- \`EMERGENCY\` repairs go to the queue \`repairs-emergency\`. Everything else, including a repair with no priority, goes to \`repairs-routine\`.
- Answer **202** with \`{ repairId, lane }\`, where lane is \`emergency\` or \`routine\`.
- Each queue has a subscriber flow of its own that creates the job, so the emergency lane can be given more consumers and never waits on the routine one.

**Facts**
- Publish the repair as it arrived. The subscriber sends that message as the body of \`POST /field-service/v1/jobs\`, which answers 201.
- Match \`EMERGENCY\` in any case (\`emergency\` counts too).

**How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`.

**Design the flows.**
`,
  answerTemplate: `## Choosing the lane

## Answering the caller

## Two subscribers

## Sizing the lanes
`,
  keyPoints: [
    'A FIFO style queue serves messages in arrival order. To let urgent work overtake, give it a queue of its own.',
    'Two subscriber flows mean the emergency lane keeps its own consumers. A routine backlog cannot use them up.',
    'Treat a missing or unknown priority as routine, so a typo cannot jump the queue.',
    'Answer 202: the repair is accepted, and the job is created a moment later by the subscriber.',
    'In Anypoint MQ, each queue can have its own DLQ and delivery limit, so the lanes can be tuned apart.',
  ],
  solution: `
**Flow \`repair-intake\`**
1. **HTTP Listener** \`POST /repairs\`.
2. **Set Variable** \`repairId\`.
3. **Choice**: \`#[upper(payload.priority default "") == "EMERGENCY"]\` publishes to \`repairs-emergency\` and sets \`lane\`. Otherwise publish to \`repairs-routine\`.
4. \`httpStatus\` = \`202\`, then \`{ repairId, lane }\`.

**Flow \`emergency-repairs\`**: **Anypoint MQ Subscriber** on \`repairs-emergency\`, **HTTP Request** \`POST /field-service/v1/jobs\`.

**Flow \`routine-repairs\`**: the same on \`repairs-routine\`.

**Sizing.** Give the emergency subscriber more concurrency than it needs on a quiet day, because it is idle most of the time and must be fast when it is not. Limit the routine subscriber so it does not swamp the field service system after a storm.
`,
  followUps: [
    {
      q: 'JMS has a priority header. Would it solve this on ActiveMQ?',
      a: 'Partly. The broker tries to deliver higher priority first among waiting messages, but it is not a strict promise, and messages already sent to a consumer are not overtaken. Separate queues give a firmer guarantee.',
    },
    {
      q: 'Could one subscriber read both queues, emergency first?',
      a: 'A subscriber listens on one queue. You could poll with Consume operations, emergency first, but two subscribers are clearer to run and to scale.',
    },
  ],
}
