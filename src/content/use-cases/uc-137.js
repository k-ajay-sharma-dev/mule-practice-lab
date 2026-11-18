import { diagram } from '../../arch/dsl.js'

const gps = { name: 'prescriptions', from: 'partner', rps: 60, to: 'legacy', kind: 'write' }

export default {
  id: 'uc-137',
  category: 'use-cases',
  title: 'Electronic Prescriptions From GP Surgeries to a Pharmacy Chain: Mutual TLS at the Gateway, and a Queue for When the Dispensing System Is Down',
  level: 'INTERMEDIATE',
  tags: ['healthcare', 'mtls', 'api-gateway', 'queue', 'dlq', 'partner-api'],
  estMinutes: 30,
  diagram: {
    task: 'draw the GP surgery systems calling an API gateway that checks client certificates, then an Experience API that puts each prescription on a queue with a dead-letter queue. An intake Process API takes prescriptions from the queue and writes them to the dispensing system through a System API.',
    checks: [
      { label: 'GP systems come in through the API gateway', rule: { type: 'edge', from: 'partner', to: 'api-gateway' } },
      { label: 'The Experience API is reached only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'Prescriptions wait on a queue before they reach the dispensing system', rule: { type: 'path', from: 'experience-api', via: 'queue', to: 'legacy' } },
      { label: 'No GP system waits on the dispensing system', rule: { type: 'no-path', from: 'partner', to: 'legacy', kind: 'sync' } },
      { label: 'The dispensing system is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        gp: ['partner', 'GP surgery systems'],
        gw: ['api-gateway', 'Prescriptions API gateway', { auth: 'mtls' }],
        exp: ['experience-api', 'exp-prescriptions', { vCores: '0.5' }],
        q: ['queue', 'prescriptions-in', { maxRedelivery: 60 }],
        dlq: ['dlq', 'prescriptions-in DLQ'],
        prc: ['process-api', 'prc-prescription-intake', { vCores: '0.5' }],
        sys: ['system-api', 'sys-dispensing', { vCores: '0.5' }],
        disp: ['legacy', 'Pharmacy dispensing system'],
      },
      ['gp -> gw', 'gw -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> disp'],
    ),
    simulation: {
      systems: [{ match: 'legacy', latencyMs: 300, maxRps: 150 }],
      tests: [
        {
          name: 'Monday morning',
          about: 'Surgeries send 60 prescriptions a second after the weekend. Each surgery gets its receipt at once, and every prescription reaches the dispensing system.',
          traffic: [gps],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 300 }], delivered: [{ to: 'legacy', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'A caller with no certificate',
          about: 'A script on the internet finds the API and posts to it without a client certificate. The gateway refuses it before any Mule app sees it.',
          traffic: [{ ...gps, name: 'unknown caller', rps: 20, auth: 'none' }],
          durationMin: 10,
          expect: { answers: [{ flow: 'unknown caller', minRefused: 0.99 }], notReached: [{ flow: 'unknown caller', node: 'experience-api' }] },
        },
        {
          name: 'The dispensing system is down for 30 minutes',
          about: 'The pharmacy chain patches its dispensing system in the evening. Surgeries keep sending, the prescriptions wait, and all of them arrive once it is back.',
          traffic: [{ ...gps, rps: 20 }],
          incidents: [{ down: 'legacy', at: 5, forMin: 30 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], lost: { max: 0 }, dlq: { max: 0 }, backlog: [{ queue: 'queue', maxEnd: 0 }] },
        },
        {
          name: 'A drug code the pharmacy does not know',
          about: 'One prescription in 500 has a drug code the dispensing system refuses every time. Those move to the dead-letter queue for a pharmacist to check, and the rest go through.',
          traffic: [{ ...gps, rps: 20, poison: 0.002 }],
          durationMin: 120,
          expect: { delivered: [{ to: 'legacy', min: 0.99 }], dlq: { min: 30 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A pharmacy chain receives **electronic prescriptions** from **GP surgery systems**. Patients choose a branch, and the prescription must reach that branch's queue in the **pharmacy dispensing system** before the patient walks in.

Each GP software supplier is issued a **client certificate** by the chain. The national rules for health data say every connection must use **mutual TLS**, so both sides prove who they are.

The dispensing system runs in the chain's data centre. It is patched one evening a month for up to 30 minutes, and today the surgeries get errors during that time and have to send again.

**Numbers**
- About **60 prescriptions a second** on Monday mornings.
- The dispensing system takes about 300 ms per prescription and up to 150 a second.
- About 1 prescription in 500 has a drug code the dispensing system does not know.

**Questions:**
- Draw the design.
- Where is the client certificate checked, and what does each Mule app trust after that?
- What does a surgery get back, and what happens during a patch window?
- What happens to a prescription the dispensing system refuses every time?
`,
  answerTemplate: `## Design

## Mutual TLS at the gateway

## The receipt and patch windows

## Refused prescriptions
`,
  keyPoints: [
    'Check the client certificate at the gateway, where the surgeries come in. A call without a trusted certificate is refused before any Mule app sees it.',
    'Mutual TLS proves which supplier is calling. Pass the identity from the certificate on, so the Experience API can record which supplier sent each prescription.',
    'The Experience API checks the prescription, puts it on a queue and answers with a receipt. The surgery never waits on the dispensing system.',
    'An intake Process API takes prescriptions at the pace the dispensing system can take, through one System API.',
    'During a patch window the prescriptions wait on the queue. A redelivery limit long enough for the window keeps them out of the dead-letter queue.',
    'A prescription refused every time moves to the dead-letter queue, and a pharmacist calls the surgery. It must never be dropped.',
  ],
  solution: `
**Design**
\`\`\`
GP surgery systems ─► Prescriptions API gateway (mTLS) ─► exp-prescriptions ~► prescriptions-in ~► prc-prescription-intake ─► sys-dispensing ─► Dispensing system
                                                                                 ~► DLQ
\`\`\`

**Mutual TLS at the gateway.** The gateway holds the chain's server certificate and a trust store with the CA that issued the suppliers' certificates. It refuses a TLS connection without a certificate from that CA. Behind it, traffic runs on the chain's private network, and the Experience API reads the supplier's identity from the certificate details the gateway passes on.

**The receipt and patch windows.** \`exp-prescriptions\` validates the message, puts it on \`prescriptions-in\` and answers 202 with a receipt number. During a patch, deliveries to the dispensing system fail and the prescriptions wait. In this model a failed delivery is tried again about once a minute, so a limit of 60 covers a 30 minute window with room to spare.

**Refused prescriptions.** After 60 failed deliveries, a prescription moves to the DLQ. An alert goes to the pharmacy support desk, who check the drug code with the surgery.

**Sizing.** 60 prescriptions a second is more than one 0.1 vCore replica takes in this model, so the Experience, Process and System APIs each get half a vCore.
`,
  followUps: [
    {
      q: 'How do you replace a supplier\'s certificate before it expires?',
      a: 'Trust the issuing CA rather than each certificate, so a supplier can move to a new certificate from the same CA with no change at the gateway. Track expiry dates and warn suppliers a month ahead.',
    },
    {
      q: 'A surgery sends the same prescription twice after a network error. What stops a double dispense?',
      a: 'Each prescription has a unique ID. The intake Process API checks it against the dispensing system, or a table of IDs it has written, and skips a repeat.',
    },
  ],
}
