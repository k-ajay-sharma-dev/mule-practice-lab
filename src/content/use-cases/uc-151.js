import { diagram } from '../../arch/dsl.js'

const lims = { type: 'legacy', label: 'LIMS' }
const scans = { name: 'sample scans', from: 'device', rps: 5, to: lims, kind: 'write' }

export default {
  id: 'uc-151',
  category: 'use-cases',
  title: 'Lab Sample Scans Keep Flowing During the Weekly LIMS Upgrade: A Queue Between the Ward Scanners and the Lab System',
  level: 'BEGINNER',
  tags: ['myproject', 'queues', 'store-and-forward', 'dlq', 'healthcare', 'legacy'],
  estMinutes: 25,
  diagram: {
    task: 'draw the ward scanners calling a lab samples Experience API, which puts each scan on a queue with a dead-letter queue. A lab samples Process API reads the queue and records each scan in the LIMS through a System API.',
    checks: [
      { label: 'The scanners call an Experience API', rule: { type: 'edge', from: 'device', to: 'experience-api' } },
      { label: 'Scans wait on a queue before they reach the LIMS', rule: { type: 'path', from: 'device', via: 'queue', to: lims } },
      { label: 'The scanners never wait on the LIMS', rule: { type: 'no-path', from: 'device', to: lims, kind: 'sync' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The LIMS is reached only through a System API', rule: { type: 'only-via', target: lims, from: 'system-api' } },
    ],
    reference: diagram(
      {
        scn: ['device', 'Ward sample scanners'],
        exp: ['experience-api', 'exp-lab-samples'],
        q: ['queue', 'lab-sample-scans', { maxRedelivery: 200 }],
        dlq: ['dlq', 'lab-sample-scans DLQ'],
        prc: ['process-api', 'prc-lab-samples'],
        sys: ['system-api', 'sys-lims'],
        lims: ['legacy', 'Hospital LIMS'],
      },
      ['scn -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> lims'],
    ),
    simulation: {
      systems: [{ match: lims, latencyMs: 400, maxRps: 30 }],
      tests: [
        {
          name: 'A normal morning',
          about: 'Nurses scan about 5 samples a second. Each scan is answered within half a second and reaches the LIMS.',
          traffic: [scans],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 500 }], delivered: [{ to: lims, min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The Sunday LIMS upgrade',
          about: 'The LIMS is down for three hours. Nurses keep scanning, scans wait on the queue, and every one reaches the LIMS when it is back. None goes to the dead-letter queue.',
          traffic: [scans],
          incidents: [{ down: lims, at: 5, forMin: 180 }],
          durationMin: 240,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: lims, min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A scan for a closed ward',
          about: 'One scan in 500 names a ward that was closed, and the LIMS refuses it every time. Those scans end up on the dead-letter queue for the lab office instead of being tried for ever.',
          traffic: [{ ...scans, poison: 0.002 }],
          durationMin: 235,
          expect: { dlq: { min: 10 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
Elmbridge General, a fictional hospital, labels every blood sample on the ward and scans it with a **ward sample scanner**. The scan tells the lab that the sample is on its way. It is recorded in the **LIMS**, the laboratory information system, an old system in the hospital data centre.

The scanners call the LIMS through Mule today. Every Sunday the LIMS is **upgraded for three hours**. Scans fail, nurses write sample numbers on paper, and the lab types them in on Monday.

**Numbers**
- About **5 scans a second** on a normal day.
- The LIMS answers in about 400 ms and takes up to 30 scans a second.
- The Sunday upgrade lasts up to **3 hours**.
- About 1 scan in 500 names a ward that has closed. The LIMS refuses those every time.

In this model, a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- How do nurses keep scanning during the upgrade?
- How many deliveries should a scan get before it goes to the dead-letter queue, and why?
- What happens to a scan the LIMS will never accept?
`,
  answerTemplate: `## Design

## During the upgrade

## The redelivery limit

## Scans that can never succeed
`,
  keyPoints: [
    'A queue between the scanners and the LIMS lets nurses keep scanning while the LIMS is down. The scan is answered once it is on the queue.',
    'The queue gives each scan to the Process API, which records it in the LIMS. While the LIMS is down, deliveries fail and the scans wait.',
    'The redelivery limit must outlast the longest planned outage. At about one try a minute, three hours needs well over 180 deliveries.',
    'A limit is still needed. Without one, a scan the LIMS refuses is tried for ever and never reaches anyone who can fix it.',
    'The dead-letter queue is where those scans wait for the lab office.',
  ],
  solution: `
**Design**
\`\`\`
Ward sample scanners ─► exp-lab-samples ~► lab-sample-scans ~► prc-lab-samples ─► sys-lims ─► Hospital LIMS
                                                   ~► DLQ
\`\`\`

**During the upgrade.** The Experience API puts the scan on the queue and answers "received". The Process API's deliveries fail while the LIMS is down, and the queue keeps the scans. When the LIMS is back they flow in at the 30 a second it takes.

**The limit.** 200 deliveries, at about one a minute, covers more than three hours with room to spare. A limit of 10 would send every scan from the upgrade to the DLQ.

**Scans that can never succeed.** After 200 tries a refused scan moves to the DLQ. A lab clerk fixes the ward and moves it back, or deletes it.

**Better still.** Let the Process API tell a refusal (a bad ward) from an outage. It can send a refusal straight to the DLQ, without waiting for 200 tries.
`,
  followUps: [
    {
      q: 'The upgrade overruns to five hours. What happens?',
      a: 'Scans that have been waiting longest reach the 200 delivery limit and move to the DLQ, although nothing is wrong with them. Support moves them back after the upgrade. A longer limit, or a pause of the consumer during planned work, avoids it.',
    },
    {
      q: 'Why not let the scanners keep scans themselves until the LIMS is back?',
      a: 'Every scanner would need storage and retry logic, and a scanner that is switched off loses what it holds. One queue in the middle does it once, for all of them.',
    },
  ],
}
