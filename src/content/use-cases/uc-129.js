import { diagram } from '../../arch/dsl.js'

const leakDb = { type: 'database', label: 'leak' }
const readings = { name: 'sensor readings', from: 'device', rps: 300, to: leakDb, kind: 'write' }
const alerts = { name: 'confirmed leaks', from: 'device', rps: 0.05, to: 'saas', kind: 'write' }

export default {
  id: 'uc-129',
  category: 'use-cases',
  title: 'Acoustic Leak Sensors to Field Crews: Thousands of Readings a Minute, One Work Order per Leak',
  level: 'ADVANCED',
  tags: ['iot', 'kafka', 'event-stream', 'deduplication', 'field-service', 'utilities'],
  estMinutes: 45,
  diagram: {
    task: 'draw the leak pipeline: the sensors send readings to an Experience API, which publishes them to an event stream. A leak detector Process API reads the stream and keeps leak candidates in its own leak database. When it confirms a leak, it puts it on a work order queue (with a DLQ) for a work order Process API that creates the job in the field service app through a System API. A second consumer archives every reading to a bucket for the analysts.',
    checks: [
      { label: 'The sensors send readings to an Experience API', rule: { type: 'edge', from: 'device', to: 'experience-api' } },
      { label: 'Readings go onto an event stream', rule: { type: 'edge', from: 'experience-api', to: 'event-stream', kind: 'async' } },
      { label: 'A leak detector reads the stream', rule: { type: 'edge', from: 'event-stream', to: { type: 'process-api', label: 'detector' }, kind: 'async' } },
      { label: 'The detector keeps leak candidates in its own leak database', rule: { type: 'edge', from: { type: 'process-api', label: 'detector' }, to: leakDb } },
      { label: 'Confirmed leaks reach the field service app through a queue', rule: { type: 'path', from: { type: 'process-api', label: 'detector' }, via: 'queue', to: 'saas' } },
      { label: 'No chain of sync calls joins a sensor to the field service app', rule: { type: 'no-path', from: 'device', to: 'saas', kind: 'sync' } },
      { label: 'The field service app is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'A second consumer archives the readings to a bucket', rule: { type: 'path', from: 'event-stream', via: { type: 'process-api', label: 'archive' }, to: 's3-bucket' } },
      { label: 'The work order queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every line to or from the stream, a queue or a DLQ is an async message', rule: { type: 'lines', touching: ['event-stream', 'queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        sen: ['device', 'Acoustic leak sensors (20,000)'],
        exp: ['experience-api', 'exp-sensor-readings', { vCores: '1' }],
        es: ['event-stream', 'leak-readings'],
        det: ['process-api', 'prc-leak-detector', { vCores: '1' }],
        ldb: ['database', 'Leak candidates database'],
        q: ['queue', 'confirmed-leaks', { maxRedelivery: 300 }],
        dlq: ['dlq', 'confirmed-leaks DLQ'],
        wo: ['process-api', 'prc-leak-work-orders'],
        sys: ['system-api', 'sys-field-service'],
        fsa: ['saas', 'Field service app (work orders)'],
        arc: ['process-api', 'prc-readings-archive', { vCores: '1' }],
        s3: ['s3-bucket', 'Readings archive bucket'],
      },
      ['sen -> exp', 'exp ~> es', 'es ~> det', 'det -> ldb', 'det ~> q', 'q ~> wo', 'q ~> dlq', 'wo -> sys', 'sys -> fsa', 'es ~> arc', 'arc -> s3'],
    ),
    simulation: {
      systems: [
        { match: 'saas', latencyMs: 600, maxRps: 5 },
        { match: 'database', latencyMs: 5 },
        { match: 's3-bucket', latencyMs: 30 },
      ],
      tests: [
        {
          name: 'An ordinary night',
          about: 'The sensors send 300 readings a second. Each reading is taken at once and reaches the leak detector, and every confirmed leak becomes a work order.',
          traffic: [readings, alerts],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 300 }], delivered: [{ flow: 'sensor readings', to: leakDb, min: 0.99 }, { flow: 'confirmed leaks', to: 'saas', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The field service app is down for three hours',
          about: 'The field service vendor has a long outage. Readings and detection carry on. Confirmed leaks wait on the queue, none goes to the DLQ, and every one becomes a work order once the app is back.',
          traffic: [readings, alerts],
          incidents: [{ down: 'saas', at: 10, forMin: 180 }],
          durationMin: 220,
          expect: { delivered: [{ flow: 'confirmed leaks', to: 'saas', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 }, backlog: [{ queue: 'queue', maxEnd: 0 }] },
        },
      ],
    },
  },
  description: `
A water company has fitted **20,000 acoustic leak sensors** to its pipes. Each sensor listens at night and sends a short reading every minute or so: about **300 readings a second** across the network. A leak shows as a steady noise in a sensor and its neighbours over several nights.

Field crews work from a **field service app** (a SaaS product), where each job is a **work order**. Its API takes at most **5 requests a second**, and the vendor has had outages of up to **three hours**.

The first version sent every reading that crossed a noise threshold straight to the field service app as a work order. Crews got 40 work orders for one leak, many for traffic noise, and stopped trusting them.

The new plan:
- A **leak detector** reads every reading, keeps **leak candidates** in its own database, and only confirms a leak when the noise persists over three nights at neighbouring sensors. Confirmed leaks are few: a few dozen on a bad night.
- One leak gives **one work order**, however many sensors hear it.
- The analysts want every reading kept in an **archive** bucket for their models.

**Questions:**
- Draw the pipeline.
- How do you get one work order per leak?
- What happens when the field service app is down for three hours?
- Why an event stream for the readings and a queue for the work orders?
`,
  answerTemplate: `## Design

## Detecting a leak

## One work order per leak

## When the field service app is down

## Stream or queue
`,
  keyPoints: [
    'Most readings are not leaks. Detect in your own Process API with its own store, and send the field service app only what a crew must act on.',
    'An event stream suits the readings: high volume, several consumers (detector and archive), and the option to replay a night after the detection rules change.',
    'A queue suits confirmed leaks: few messages, each one a task that must be done once, with a DLQ for those that fail.',
    'One work order per leak: the detector gives each leak an ID from its area and pipe, and the work order step creates the order only if none is open for that leak ID.',
    'The work order consumer works at the vendor\'s 5 a second, and the redelivery limit rides out a three-hour outage.',
    'Size the reading path for 300 a second: the Experience API, the detector and the archive consumer each need a full vCore in this model.',
  ],
  solution: `
**Design**
\`\`\`
Sensors ─► exp-sensor-readings ~► leak-readings (event stream) ─┬~► prc-leak-detector ─► Leak candidates database
                                                                │          ~► confirmed-leaks ~► prc-leak-work-orders ─► sys-field-service ─► Field service app
                                                                │                  ~► DLQ
                                                                └~► prc-readings-archive ─► Readings archive bucket
\`\`\`

**Detecting a leak.** \`prc-leak-detector\` keeps a candidate per pipe section in its database, with the nights and sensors that heard it. When a candidate passes the rule, three nights and at least two neighbouring sensors, it publishes one confirmed leak with a leak ID such as the pipe section and the week.

**One work order per leak.** \`prc-leak-work-orders\` asks the field service app, through \`sys-field-service\`, whether an open work order exists for that leak ID, and creates one only if not. A repeat from a redelivery or from a second sensor confirming the same leak finds the open order and stops.

**When the field service app is down.** Readings, detection and the archive carry on: none of them touch the vendor. Confirmed leaks wait on \`confirmed-leaks\`. With a limit of 300 deliveries they ride out three hours. When the app is back, the consumer creates the waiting orders within the vendor's 5 a second.

**Stream or queue.** The readings are a stream of facts several consumers read in their own way, and that the analysts may replay. The confirmed leaks are tasks, each to be done once, so they go on a queue with a DLQ.
`,
  followUps: [
    {
      q: 'Why not filter the readings in the Experience API?',
      a: 'The archive needs every reading, and the detection rule needs the quiet readings too, to tell a persistent noise from a passing one. The Experience API only takes readings in quickly.',
    },
    {
      q: 'What if the detection rules change?',
      a: 'Deploy the new detector with a new consumer group, replay the last few nights from the stream into a fresh candidates table, and compare before switching over.',
    },
    {
      q: 'How would you tell the crews a leak was fixed?',
      a: 'The field service app sends a completion event when the job is closed. The detector marks the candidate fixed, and stops raising it unless the noise comes back.',
    },
  ],
}
