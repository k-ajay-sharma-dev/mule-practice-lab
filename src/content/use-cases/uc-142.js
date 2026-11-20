import { diagram } from '../../arch/dsl.js'

const warnings = { name: 'weather warnings', from: 'external-api', rps: 2, kind: 'write' }
const lifts = { type: 'legacy', label: 'lift' }

export default {
  id: 'uc-142',
  category: 'use-cases',
  title: 'Weather Warnings for a Ski Resort: One Topic Feeds the Lift Control System, the Website and the Staff App, and a Lift System Outage Delays Nobody Else',
  level: 'BEGINNER',
  tags: ['myproject', 'topic', 'publish-subscribe', 'fan-out', 'dlq', 'notifications', 'leisure'],
  estMinutes: 20,
  diagram: {
    task: 'draw the weather service calling a weather alerts Experience API, which publishes each warning to a topic. Three System APIs subscribe to the topic directly, each with its own copy: one for the lift control system, one for the resort website and one for the staff app notifications. The topic has a dead-letter queue.',
    checks: [
      { label: 'The weather service calls an Experience API', rule: { type: 'edge', from: 'external-api', to: 'experience-api' } },
      { label: 'The Experience API publishes warnings to a topic', rule: { type: 'edge', from: 'experience-api', to: 'topic', kind: 'async' } },
      { label: 'The topic feeds three System APIs', rule: { type: 'each', of: 'topic', edgeTo: 'system-api', count: 3 } },
      { label: 'The lift control system is reached only through a System API', rule: { type: 'only-via', target: lifts, from: 'system-api' } },
      { label: 'The topic has a dead-letter queue', rule: { type: 'each', of: 'topic', edgeTo: 'dlq' } },
      { label: 'Every line to or from the topic is an async message', rule: { type: 'lines', touching: ['topic', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        wx: ['external-api', 'Weather service'],
        exp: ['experience-api', 'exp-weather-alerts'],
        t: ['topic', 'weather-warnings', { maxRedelivery: 60 }],
        dlq: ['dlq', 'weather-warnings DLQ'],
        sysL: ['system-api', 'sys-lift-control'],
        sysW: ['system-api', 'sys-resort-website'],
        sysS: ['system-api', 'sys-staff-alerts'],
        lift: ['legacy', 'Lift control system'],
        site: ['saas', 'Resort website'],
        push: ['notification', 'Staff app notifications'],
      },
      ['wx -> exp', 'exp ~> t', 't ~> sysL', 't ~> sysW', 't ~> sysS', 't ~> dlq', 'sysL -> lift', 'sysW -> site', 'sysS -> push'],
    ),
    simulation: {
      systems: [{ match: 'legacy', latencyMs: 300 }],
      tests: [
        {
          name: 'A stormy morning',
          about: 'The weather service sends 2 warnings a second during a storm. Every warning reaches the lifts, the website and the staff app.',
          traffic: [warnings],
          durationMin: 30,
          expect: { delivered: [{ to: lifts, min: 0.99 }, { to: 'saas', min: 0.99 }, { to: 'notification', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The lift control system is down for 20 minutes',
          about: 'The lift system restarts after an update. The website and the staff app get every warning as usual. The lift system gets its warnings once it is back, and none is lost.',
          traffic: [warnings],
          incidents: [{ down: lifts, at: 5, forMin: 20 }],
          durationMin: 60,
          expect: { delivered: [{ to: 'saas', min: 0.99 }, { to: 'notification', min: 0.99 }, { to: lifts, min: 0.99 }], lost: { max: 0 }, dlq: { max: 0 } },
        },
        {
          name: 'A warning that cannot be read',
          about: 'One warning in 50 comes in a format the subscribers cannot read. Those warnings move to the dead-letter queue instead of being tried for ever.',
          traffic: [{ ...warnings, poison: 0.02 }],
          durationMin: 120,
          expect: { dlq: { min: 50 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A ski resort gets **weather warnings** from a **weather service**: high wind, heavy snow, avalanche risk. Each warning must reach three places:

- The **lift control system**, which slows or stops lifts in high wind.
- The **resort website**, which shows the warning to guests.
- The **staff app notifications**, which tell lift operators and ski patrol.

Today the weather service calls one Mule flow that updates the three in turn. When the lift control system restarts after an update, the flow fails and the website and staff miss the warning too.

**Numbers**
- Usually a few warnings an hour, up to **2 a second** in a storm.
- The lift control system restarts for up to 20 minutes after an update.
- Now and then a warning comes in a format nobody can read.
- No warning may be lost. A failed message is redelivered about once a minute, and every delivery counts toward the redelivery limit. No good warning may reach the DLQ during a 20-minute restart, and unreadable ones must reach the DLQ.

**Questions:**
- Draw the design.
- Why does a topic suit this better than one flow calling three systems?
- What happens to warnings while the lift control system is down?
- What happens to a warning that can never be read?
`,
  answerTemplate: `## Design

## Why a topic

## When one system is down

## Warnings that cannot be read
`,
  keyPoints: [
    'Publish each warning once to a topic. Each subscriber gets its own copy and works at its own pace.',
    'A subscriber that is down only holds up its own copies. The others carry on.',
    'Copies wait on the broker while their subscriber is down, and arrive once it is back.',
    'A redelivery limit and a dead-letter queue move a warning that fails every time aside, so it is not tried for ever.',
    'Adding a fourth system later, such as the snow cannons, is one more subscriber. Nothing else changes.',
  ],
  solution: `
**Design**
\`\`\`
Weather service ─► exp-weather-alerts ~► weather-warnings (topic) ~► sys-lift-control ─► Lift control system
                                                              ~► sys-resort-website ─► Resort website
                                                              ~► sys-staff-alerts ──► Staff app notifications
                                                              ~► DLQ
\`\`\`

**Why a topic.** In Anypoint MQ this is an exchange bound to three queues, one per subscriber. The Experience API answers the weather service as soon as the warning is published.

**When one system is down.** The lift subscriber's copies stay on its queue and are delivered again. In this model a failed delivery is tried about once a minute, so a limit of 60 covers an hour, well beyond a 20 minute restart.

**Warnings that cannot be read.** After 60 failed deliveries a warning moves to the DLQ, and the duty manager is alerted.
`,
  followUps: [
    {
      q: 'An old wind warning arrives at the lifts after a 20 minute outage. Is that a problem?',
      a: 'It can be. Each warning carries the time it was issued and how long it is valid, and the lift subscriber ignores a warning that has already expired.',
    },
    {
      q: 'Should the lift control system stop lifts on its own when it hears nothing for a while?',
      a: 'That is a safety decision for the resort. A heartbeat from the weather service, checked by the lift system, would let it tell "no warnings" from "no news".',
    },
  ],
}
