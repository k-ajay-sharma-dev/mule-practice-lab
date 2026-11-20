import { diagram } from '../../arch/dsl.js'

const directory = { type: 'saas', label: 'directory' }
const badges = { type: 'legacy', label: 'badge' }
const payroll = { type: 'erp', label: 'payroll' }
const leavers = { name: 'leavers', from: { type: 'saas', label: 'HR' }, rps: 2, to: [directory, badges, payroll], kind: 'write' }

export default {
  id: 'uc-138',
  category: 'use-cases',
  title: 'Leavers Lose Access Everywhere by the End of Their Last Day: One Leaver Event, Three Systems, and a Badge System That Is Often Down',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'hr', 'offboarding', 'security', 'topic', 'fan-out', 'dlq'],
  estMinutes: 30,
  diagram: {
    task: 'draw the HR system sending leaver events to an Experience API, which publishes them to a topic. Draw three subscribers, one for the identity directory, one for the badge system and one for payroll, each calling its system through its own System API. The topic has a dead-letter queue.',
    checks: [
      { label: 'The HR system sends leavers to an Experience API', rule: { type: 'edge', from: { type: 'saas', label: 'HR' }, to: 'experience-api' } },
      { label: 'Leaver events go through a topic', rule: { type: 'path', from: 'experience-api', via: 'topic', to: [directory.type, badges.type, payroll.type], min: 3 } },
      { label: 'The topic has three subscribers', rule: { type: 'each', of: 'topic', edgeTo: 'process-api', count: 3 } },
      { label: 'No subscriber calls more than one System API', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api', max: 1 } },
      { label: 'The HR system never waits on the badge system', rule: { type: 'no-path', from: { type: 'saas', label: 'HR' }, to: badges, kind: 'sync' } },
      { label: 'The topic has a dead-letter queue', rule: { type: 'each', of: 'topic', edgeTo: 'dlq' } },
      { label: 'Every line to or from the topic is an async message', rule: { type: 'lines', touching: ['topic', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        hr: ['saas', 'HR system'],
        exp: ['experience-api', 'exp-hr-events'],
        t: ['topic', 'leaver-events', { maxRedelivery: 200 }],
        dlq: ['dlq', 'leaver-events DLQ'],
        subD: ['process-api', 'prc-leaver-directory'],
        subB: ['process-api', 'prc-leaver-badges'],
        subP: ['process-api', 'prc-leaver-payroll'],
        sysD: ['system-api', 'sys-directory'],
        sysB: ['system-api', 'sys-badges'],
        sysP: ['system-api', 'sys-payroll'],
        dir: ['saas', 'Identity directory'],
        badge: ['legacy', 'Building badge system'],
        pay: ['erp', 'Payroll'],
      },
      ['hr -> exp', 'exp ~> t', 't ~> dlq', 't ~> subD', 't ~> subB', 't ~> subP', 'subD -> sysD', 'subB -> sysB', 'subP -> sysP', 'sysD -> dir', 'sysB -> badge', 'sysP -> pay'],
    ),
    simulation: {
      systems: [{ match: 'legacy', latencyMs: 800, maxRps: 5 }],
      tests: [
        {
          name: 'A restructuring day',
          about: 'HR sends 2 leavers a second for half an hour. Every leaver is removed from the directory, the badge system and payroll.',
          traffic: [{ ...leavers, forMin: 30 }],
          durationMin: 60,
          expect: { delivered: [{ to: directory, min: 0.99 }, { to: badges, min: 0.99 }, { to: payroll, min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The badge system is down all afternoon',
          about: 'The badge system is down for 3 hours. Leavers still lose their directory account and payroll is told at once. Their badges wait, and none goes to the dead-letter queue.',
          traffic: [{ ...leavers, rps: 0.2 }],
          incidents: [{ down: badges, at: 10, forMin: 180 }],
          durationMin: 120,
          expect: { delivered: [{ to: directory, min: 0.99 }, { to: payroll, min: 0.99 }], lost: { max: 0 }, dlq: { max: 0 } },
        },
        {
          name: 'A leaver record that cannot be read',
          about: 'One leaver record in 100 is broken and fails every time. It moves to the dead-letter queue for the HR team, and the others are processed.',
          traffic: [{ ...leavers, rps: 0.5, poison: 0.01 }],
          durationMin: 240,
          expect: { delivered: [{ to: directory, min: 0.98 }], dlq: { min: 10 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
An insurance company must remove a **leaver's access** by the end of their last day: their account in the **identity directory**, their card in the **building badge system**, and their pay in **payroll**. Auditors check this every year.

Today the **HR system** calls one Mule flow that updates the three systems one after another. The badge system is an old server in the head office. It is often down for hours, and when it is, the whole flow fails. Leavers kept their directory accounts for days in the last audit, because the badge system failed first.

**Numbers**
- Usually a few leavers a day. On a restructuring day HR sends up to **2 leavers a second** for half an hour.
- The badge system takes about 800 ms per change, up to 5 a second, and can be down for an afternoon of up to **3 hours**.
- About 1 leaver record in 100 sent by HR is broken.
- No leaver may be lost. A failed message is redelivered about once a minute, and every delivery counts toward the redelivery limit. No good leaver may reach the DLQ during a 3-hour badge outage, and broken records must reach the DLQ for the HR team.

**Questions:**
- Draw the design.
- How does an outage of the badge system stop holding up the directory and payroll?
- How do you show the auditors that each leaver was removed from each system?
- What happens to a record that fails every time?
`,
  answerTemplate: `## Design

## One event, three subscribers

## When the badge system is down

## Proof for the auditors

## Broken records
`,
  keyPoints: [
    'Turn the leaver into one event on a topic. Each target system has its own subscriber, so each one succeeds or waits on its own.',
    'A subscriber for the badge system can wait for hours while the directory and payroll subscribers are already done.',
    'Each subscriber calls one System API. A subscriber that updates two systems brings back the old problem in a smaller form.',
    'The HR system only waits for the Experience API to publish the event. It never waits on the badge system.',
    'Set a redelivery limit longer than the longest badge outage, so leavers do not go to the dead-letter queue during one.',
    'Log a record for each leaver and each system when the change is done. The auditors get a report of leavers with all three done, and of anything still open at the end of the day.',
  ],
  solution: `
**Design**
\`\`\`
HR system ─► exp-hr-events ~► leaver-events (topic) ~► prc-leaver-directory ─► sys-directory ─► Identity directory
                                                    ~► prc-leaver-badges ───► sys-badges ────► Building badge system
                                                    ~► prc-leaver-payroll ──► sys-payroll ───► Payroll
                                                    ~► DLQ
\`\`\`

**One event, three subscribers.** \`exp-hr-events\` checks the leaver record and publishes one event. On Anypoint MQ this is an exchange bound to three queues, one per subscriber. Each queue holds its own copy, so each subscriber takes its copy at its own pace.

**When the badge system is down.** Only the badge subscriber fails. Its copies wait and are delivered again later. The directory and payroll copies are done within seconds. In this model a failed delivery is tried again about once a minute, so a limit of 200 covers an afternoon outage of 3 hours.

**Proof for the auditors.** Each subscriber writes a line to an audit log when its system confirms the change: leaver ID, system, time. A report at 17:00 lists any leaver missing one of the three, and the security desk acts on it the same evening.

**Broken records.** A record that fails at every delivery moves to the DLQ. The HR team fixes it and sends it again.
`,
  followUps: [
    {
      q: 'The badge system is down at 17:00 on a leaver\'s last day. What can the company do?',
      a: 'The 17:00 report shows the open badge, and the security desk disables the card by hand at the badge system\'s console, or collects it at the exit. The event stays queued and confirms the change later.',
    },
    {
      q: 'A leaver\'s last day is moved back after the event was sent. What then?',
      a: 'HR sends a correction event. The subscribers must handle it, for example by restoring access, and the audit log keeps both events.',
    },
  ],
}
