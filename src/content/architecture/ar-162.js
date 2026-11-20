import { diagram } from '../../arch/dsl.js'

const primary = { type: 'notification', label: 'main' }
const backup = { type: 'notification', label: 'backup' }
const texts = { name: 'ready texts', from: 'internal-app', rps: 40, to: 'notification', kind: 'write' }

export default {
  id: 'ar-162',
  category: 'architecture',
  title: 'Prescription Ready Texts Through a Backup SMS Provider: a Load Balancer in Failover Mode, So the Dearer Provider Is Used Only When the Main One Is Down',
  level: 'INTERMEDIATE',
  tags: ['failover', 'load-balancer', 'sms', 'third-party-api', 'cost', 'healthcare'],
  estMinutes: 30,
  diagram: {
    task: 'draw the dispensing system calling a notifications Process API, which sends each text through a load balancer. Behind the load balancer draw one System API for the main SMS provider and one for the backup SMS provider, each calling its provider. Put main or backup in the name of each System API and each provider, draw the load balancer\'s line to the main System API first, and set the load balancer\'s mode.',
    checks: [
      { label: 'The dispensing system calls a notifications Process API', rule: { type: 'edge', from: 'internal-app', to: 'process-api' } },
      { label: 'The Process API sends texts through a load balancer', rule: { type: 'edge', from: 'process-api', to: 'load-balancer' } },
      { label: 'The load balancer has a line to two System APIs', rule: { type: 'each', of: 'load-balancer', edgeTo: 'system-api', count: 2 } },
      { label: 'The main provider is reached through a System API', rule: { type: 'only-via', target: primary, from: 'system-api' } },
      { label: 'The backup provider is reached through a System API', rule: { type: 'only-via', target: backup, from: 'system-api' } },
      { label: 'The Process API never calls a provider\'s System API around the load balancer', rule: { type: 'no-edge', from: 'process-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        disp: ['internal-app', 'Dispensing system'],
        prc: ['process-api', 'prc-notifications'],
        lb: ['load-balancer', 'SMS failover', { mode: 'failover' }],
        sysA: ['system-api', 'sys-sms-main'],
        sysB: ['system-api', 'sys-sms-backup'],
        smsA: ['notification', 'Main SMS provider'],
        smsB: ['notification', 'Backup SMS provider'],
      },
      ['disp -> prc', 'prc -> lb', 'lb -> sysA', 'lb -> sysB', 'sysA -> smsA', 'sysB -> smsB'],
    ),
    simulation: {
      systems: [{ match: 'notification', latencyMs: 150 }],
      tests: [
        {
          name: 'A normal day',
          about: 'The pharmacies send 40 texts a second at the evening peak. Every text goes out through the main provider, and none through the dearer backup.',
          traffic: [texts],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: primary, min: 0.99 }], peakRps: [{ node: backup, max: 0 }] },
        },
        {
          name: 'The main provider is down for 20 minutes',
          about: 'The main provider has an outage, so the health check of its System API fails. Texts go through the backup provider while it lasts, so patients still hear that their prescription is ready.',
          traffic: [texts],
          incidents: [{ down: { type: 'system-api', label: 'main' }, at: 5, forMin: 20 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], peakRps: [{ node: backup, min: 30 }] },
        },
      ],
    },
  },
  description: `
A pharmacy chain texts patients when their **prescription is ready** to collect. The **dispensing system** asks Mule to send each text.

The chain has a contract with a **main SMS provider** at a low price per text. Last winter that provider was down for an afternoon and 30,000 patients were not told. The chain has now signed a **backup SMS provider**. It costs three times as much per text, so it must be used **only while the main provider cannot send**.

**Numbers**
- About **40 texts a second** at the evening peak.
- Both providers answer in about 150 ms.
- The main provider has had outages of up to a few hours.

**Questions:**
- Draw the design.
- How are texts sent to only one provider at a time, and moved to the backup when the main one fails?
- Why does a load balancer in its usual mode not fit this contract?
- What does each provider need from Mule?
`,
  answerTemplate: `## Design

## Failover, not sharing

## Detecting that the main provider is down

## What each provider needs
`,
  keyPoints: [
    'Two providers behind one load balancer give the Process API one place to send to. It does not need to know which provider is used.',
    'In its usual mode a load balancer spreads requests over every healthy box behind it. Here that would send half the texts to the dearer provider every day.',
    'In failover mode it sends everything to the first box and moves to the next only when the first is down. That matches a main and a backup contract.',
    'Each provider has its own System API, with its own credentials, message format and error codes. The Process API sends one shape to both.',
    'The health check decides when to fail over. Make it reflect the provider, for example a System API health endpoint that fails while the provider is unreachable, not only whether Mule is up.',
  ],
  solution: `
**Design**
\`\`\`
Dispensing system ─► prc-notifications ─► SMS failover (load balancer, failover mode) ─► sys-sms-main ─► Main SMS provider
                                                                                     └► sys-sms-backup ─► Backup SMS provider
\`\`\`

**Failover, not sharing.** The load balancer is set to send to \`sys-sms-main\` while it is healthy. When its health check fails, traffic moves to \`sys-sms-backup\`. When the main one is healthy again, traffic moves back.

**Detecting that the main provider is down.** \`sys-sms-main\` has a readiness endpoint that calls the provider's status endpoint, or counts recent failures, and answers 503 when the provider cannot send. The load balancer checks it every few seconds. In this model the outage is shown as \`sys-sms-main\` being down.

**What each provider needs.** Each System API maps the one text shape \`{ to, message, reference }\` to its provider's API, keeps its own key, and turns its provider's errors into the same few error types. A wrong phone number is a 400 from either, and is not a reason to fail over.

**Without a load balancer.** The same can be built in the Process API with a Try around the main call and the backup call in its error handler. That works too, but every text waits for the main provider to fail first during an outage, and the rule is hidden in code.
`,
  followUps: [
    {
      q: 'A text was sent by the main provider, but the answer timed out. Should it go to the backup?',
      a: 'Not at once, or the patient may get two texts. Treat a timeout as unknown: check the main provider\'s status for that reference first, or accept a rare duplicate for a message like this one.',
    },
    {
      q: 'How do you know the backup still works after months unused?',
      a: 'Send a small share of test texts through it every day to a test number, and alert if they fail. A backup nobody has used for a year often has an expired key.',
    },
  ],
}
