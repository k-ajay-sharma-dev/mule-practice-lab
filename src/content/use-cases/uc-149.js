import { diagram } from '../../arch/dsl.js'

const store = { type: 'database', label: 'answer' }
const submissions = { name: 'submissions', from: 'web-app', rps: 3, to: store, kind: 'write', spikes: [{ at: 20, forMin: 3, rps: 200 }] }

export default {
  id: 'uc-149',
  category: 'use-cases',
  title: 'Twelve Thousand Students Press Submit at 12:00: Give Each a Receipt at Once, Never Lose an Answer Sheet, and Feed an Answer Store That Takes 30 a Second',
  level: 'EXPERT',
  tags: ['myproject', 'education', 'burst', 'queue', 'persistence', 'jwt', 'availability', 'sizing'],
  estMinutes: 55,
  diagram: {
    task: 'draw the exam website calling an API gateway that checks tokens, then a submissions Experience API. That API puts each answer sheet on a queue with a dead-letter queue, and a submissions Process API reads the queue and saves each sheet in the exam answer store through a System API.',
    checks: [
      { label: 'The exam website comes in through the API gateway', rule: { type: 'edge', from: 'web-app', to: 'api-gateway' } },
      { label: 'The Experience API is reached only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'Answer sheets wait on a queue before they reach the answer store', rule: { type: 'path', from: 'web-app', via: 'queue', to: store } },
      { label: 'Students never wait on the answer store', rule: { type: 'no-path', from: 'web-app', to: store, kind: 'sync' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The answer store is reached only through a System API', rule: { type: 'only-via', target: store, from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Exam website'],
        gw: ['api-gateway', 'API gateway', { auth: 'jwt' }],
        exp: ['experience-api', 'exp-exam-submissions', { replicas: 2, vCores: '0.5' }],
        q: ['queue', 'exam-submissions', { persistent: 'yes', maxRedelivery: 120 }],
        dlq: ['dlq', 'exam-submissions DLQ'],
        prc: ['process-api', 'prc-exam-submissions', { replicas: 2 }],
        sys: ['system-api', 'sys-exam-store', { replicas: 2 }],
        db: ['database', 'Exam answer store'],
      },
      ['web -> gw', 'gw -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> db'],
    ),
    simulation: {
      systems: [{ match: store, latencyMs: 200, maxRps: 30 }],
      tests: [
        {
          name: 'The 12:00 deadline',
          about: 'A few sheets a second come in early, then 200 a second for three minutes at the deadline. Every student gets a receipt within half a second, every sheet is saved, and the answer store never gets more than 30 a second.',
          traffic: [submissions],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 500 }], delivered: [{ to: store, min: 0.99 }], peakRps: [{ node: store, max: 30 }], lost: { max: 0 }, backlog: [{ queue: 'queue', maxEnd: 0 }] },
        },
        {
          name: 'The broker restarts with a backlog',
          about: 'Five minutes after the deadline, while thousands of sheets wait, the broker restarts for a patch nobody planned. Not one sheet is lost.',
          traffic: [submissions],
          incidents: [{ restart: 'queue', at: 25 }],
          durationMin: 60,
          expect: { lost: { max: 0 }, delivered: [{ to: store, min: 0.99 }] },
        },
        {
          name: 'An availability zone goes down at the deadline',
          about: 'A zone fails a minute before 12:00. The replicas in the other zone take the whole rush, and every student still gets a receipt.',
          traffic: [submissions],
          incidents: [{ zone: true, at: 19, forMin: 10 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: store, min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'A submission without a token',
          about: 'A script posts answer sheets without a student\'s token. The gateway refuses them, and nothing reaches the queue.',
          traffic: [{ ...submissions, name: 'no token', rps: 5, spikes: undefined, auth: 'none' }],
          durationMin: 10,
          expect: { answers: [{ flow: 'no token', minRefused: 0.99 }], notReached: [{ flow: 'no token', node: 'queue' }] },
        },
      ],
    },
  },
  description: `
A university runs its first-year exams online. About **12,000 students** take each paper on the **exam website**, and almost all of them press **submit** in the last minutes before the 12:00 deadline.

Each answer sheet is saved in the **exam answer store**, a database run by the exams office, which takes about **30 saves a second**. Last term the website saved each sheet directly. At 11:59 the answer store slowed down, students saw spinners and errors, and 800 of them emailed their answers in a panic. The exams office had to decide which late answers to accept.

Students sign in through the university's identity service, which issues a JWT.

**Numbers**
- A few sheets a second during the exam, then about **200 a second for three minutes** at the deadline.
- The answer store takes about 200 ms per sheet and up to **30 a second**.
- The rule from the exams office: every student gets a **receipt with a time** within a second of pressing submit. That time decides whether the sheet was on time.
- Marking starts an hour after the deadline.

**Questions:**
- Draw the design.
- How does every student get a receipt at once, when the store takes 30 a second?
- How do you make sure no answer sheet is ever lost?
- What happens if a zone fails, or the broker restarts, at the deadline?
- How is the submission time decided fairly?
`,
  answerTemplate: `## Design

## The receipt

## Never losing a sheet

## Failures at the worst moment

## The submission time
`,
  keyPoints: [
    'Accept fast, save at the store\'s pace: the Experience API puts each sheet on a queue and answers with a receipt; a consumer feeds the answer store at 30 a second.',
    'The receipt time is set when the sheet is accepted, before it is queued, so a backlog never makes a sheet late.',
    'The queue must be persistent, so a broker restart keeps every waiting sheet, with a redelivery limit long enough for an answer store outage and a DLQ for what still fails.',
    'Size the Experience API for the deadline rush in one zone: 200 a second needs half a vCore per replica in this model, with two replicas.',
    'The backlog of about 36,000 sheets clears in about 25 minutes, well before marking starts.',
    'Each sheet carries the student and paper IDs, so a student who presses submit twice has one saved sheet, the latest.',
  ],
  solution: `
**Design**
\`\`\`
Exam website ─► API gateway (JWT) ─► exp-exam-submissions ~► exam-submissions (persistent) ~► prc-exam-submissions ─► sys-exam-store ─► Exam answer store
                                                                          ~► DLQ
\`\`\`

**The receipt.** \`exp-exam-submissions\` checks the token, stamps the sheet with the time it was received, publishes it and answers \`{ receiptId, receivedAt }\`. The website shows the receipt, and an email copy follows.

**Never losing a sheet.** The queue is persistent and the consumer acknowledges a sheet only after the answer store has saved it. A failed save is tried again; in this model about once a minute, so 120 deliveries cover two hours. A sheet still failing after that goes to the DLQ, and the exams office is alerted at once.

**Failures at the worst moment.** Two replicas of each API in two zones: one zone alone takes the rush. A broker restart loses nothing that was persisted.

**The submission time.** The receipt time comes from the server, not the student's laptop, and is saved with the sheet. A sheet received at 11:59:58 is on time even if it is saved at 12:20.
`,
  followUps: [
    {
      q: 'Should the website also save the answers in the browser while the student works?',
      a: 'Yes. Saving drafts locally, and sending them every few minutes during the exam, means a student who loses Wi-Fi at 11:59 has most of the work kept, and spreads the load before the deadline.',
    },
    {
      q: 'The exams office wants to know at 12:05 that every sheet has arrived. How?',
      a: 'Count receipts issued against students who started the paper, and compare the queue\'s backlog and DLQ with zero. A small dashboard on those numbers answers "are we safe?" while the backlog drains.',
    },
  ],
}
