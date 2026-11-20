import { diagram } from '../../arch/dsl.js'

const dms = { type: 'saas', label: 'document' }
const uploads = { name: 'scanned documents', from: 'partner', rps: 250, to: dms, kind: 'write', forMin: 60 }

export default {
  id: 'uc-152',
  category: 'use-cases',
  title: 'A Night of Scanned Tax Documents: Accept 250 a Second From the Scanning Bureau and Have the Backlog Filed Before the Office Opens',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'queues', 'backlog', 'sizing', 'competing-consumers', 'client-id', 'finance'],
  estMinutes: 35,
  diagram: {
    task: 'draw the scanning bureau calling an API gateway that checks client IDs, then a document intake Experience API. It puts each document on a queue with a dead-letter queue. A document filing Process API reads the queue and files each document in the document management system through a System API.',
    checks: [
      { label: 'The bureau comes in through the API gateway', rule: { type: 'edge', from: 'partner', to: 'api-gateway' } },
      { label: 'The Experience API is reached only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'Documents wait on a queue before they are filed', rule: { type: 'path', from: 'partner', via: 'queue', to: dms } },
      { label: 'The bureau never waits on the document system', rule: { type: 'no-path', from: 'partner', to: dms, kind: 'sync' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The document system is reached only through a System API', rule: { type: 'only-via', target: dms, from: 'system-api' } },
    ],
    reference: diagram(
      {
        bur: ['partner', 'Scanning bureau'],
        gw: ['api-gateway', 'API gateway', { auth: 'client-id' }],
        exp: ['experience-api', 'exp-document-intake', { vCores: '1' }],
        q: ['queue', 'scanned-documents', { maxRedelivery: 30 }],
        dlq: ['dlq', 'scanned-documents DLQ'],
        prc: ['process-api', 'prc-document-filing', { replicas: 2, vCores: '0.2' }],
        sys: ['system-api', 'sys-document-store', { replicas: 2, vCores: '0.2' }],
        dm: ['saas', 'Client document management system'],
      },
      ['bur -> gw', 'gw -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> dm'],
    ),
    simulation: {
      systems: [{ match: dms, latencyMs: 300, maxRps: 200 }],
      tests: [
        {
          name: 'The January rush',
          about: 'The bureau sends 250 documents a second for an hour. Every upload is accepted at once, the document system never gets more than 200 a second, and the queue is empty two hours after the bureau started.',
          traffic: [uploads],
          durationMin: 120,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 500 }], peakRps: [{ node: dms, max: 200 }], backlog: [{ queue: 'queue', minPeak: 10000, maxEnd: 0 }], lost: { max: 0 } },
        },
        {
          name: 'A caller without a client ID',
          about: 'A test script from the bureau\'s developers posts without its client ID. The gateway refuses it and nothing is queued.',
          traffic: [{ ...uploads, name: 'no client ID', rps: 5, forMin: undefined, auth: 'none' }],
          durationMin: 10,
          expect: { answers: [{ flow: 'no client ID', minRefused: 0.99 }], notReached: [{ flow: 'no client ID', node: 'queue' }] },
        },
      ],
    },
  },
  description: `
Larkfield Tax Services, a fictional accountancy firm, sends its clients' paper records to a **scanning bureau** each January. The bureau scans them overnight and uploads each document to Larkfield through an API. Each one must be filed in the **client document management system**, a SaaS product, before the office opens.

Last year the upload API filed each document while the bureau waited. The document system slowed down, uploads timed out, and the bureau stopped sending at midnight.

**Numbers**
- The bureau sends about **250 documents a second for an hour**.
- The document system answers in about 300 ms and takes up to **200 a second**.
- Everything must be filed within **two hours** of the bureau starting, and no document may be lost.
- The bureau must get an answer to each upload within **500 ms**.
- In this model, one vCore serves about 500 simple requests a second, and the smallest size is 0.1 vCore.

**Questions:**
- Draw the design.
- How is every upload accepted at 250 a second, when the document system takes 200?
- How big must the consumer side be for the backlog to clear in time? Show the sum.
- Why must the consumer side not be bigger than the document system can take?
`,
  answerTemplate: `## Design

## Accepting the uploads

## Clearing the backlog

## Not swamping the document system
`,
  keyPoints: [
    'The queue takes the uploads at the bureau\'s pace, and the consumers file them at the document system\'s pace. The difference waits on the queue.',
    'An hour at 250 a second is 900,000 documents. At 200 a second they take 75 minutes to file, so the backlog clears within two hours.',
    'The consumer side must really reach 200 a second: here two replicas of 0.2 vCore for the Process API and the same for the System API.',
    'The Experience API needs a full vCore to take 250 uploads a second with room to spare.',
    'More consumers than the document system can take only produce failures and retries. Size them to the slowest system on the route.',
    'A client ID policy at the gateway keeps unknown callers out.',
  ],
  solution: `
**Design**
\`\`\`
Scanning bureau ─► API gateway (client ID) ─► exp-document-intake ~► scanned-documents ~► prc-document-filing ─► sys-document-store ─► Document system
                                                                          ~► DLQ
\`\`\`

**Accepting the uploads.** The Experience API (1 vCore, about 500 a second) puts each document on the queue and answers 202. The bureau never waits on the document system.

**Clearing the backlog.** The Process API and System API each run on 2 replicas of 0.2 vCore: about 200 a second, the document system's limit. 900,000 documents arrive in an hour, 200 a second are filed from the start, and the rest are filed in the following 15 minutes or so.

**The queue holds the documents, not the files.** In practice the bureau uploads the scan to storage and the message carries a reference, so the queue stays small.

**The DLQ.** A document the system refuses, such as one with no client number, goes to the DLQ after 30 tries for the office to look at.
`,
  followUps: [
    {
      q: 'The deadline moves to one hour. What changes?',
      a: 'Nothing on the Mule side helps: the document system takes 200 a second, and 900,000 documents need 75 minutes at that rate. Ask the vendor for more capacity, or ask the bureau to start earlier.',
    },
    {
      q: 'How would you watch the backlog during the night?',
      a: 'Alert on the queue depth and on the age of the oldest message. If the age passes an hour, the filing will miss the deadline and someone should look.',
    },
  ],
}
