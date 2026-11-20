import { diagram } from '../../arch/dsl.js'

const primary = { type: 'azure-blob', label: 'primary' }
const secondary = { type: 'azure-blob', label: 'secondary' }
const reads = { name: 'document reads', from: 'web-app', rps: 30, to: 'azure-blob' }

export default {
  id: 'uc-212',
  category: 'use-cases',
  title: 'Delivery Notes Readable Through a Regional Storage Outage: Read From the Geo Redundant Secondary When the Primary Fails, Keep the Secondary Idle Otherwise, and Size the Timeouts and Replicas for a Slow Day',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-blob', 'ra-grs', 'failover', 'load-balancer', 'availability', 'timeout', 'replicas'],
  estMinutes: 45,
  diagram: {
    task: 'draw the driver app calling a documents Experience API, which calls a documents System API. The System API reaches the storage account\'s primary endpoint and its read-only secondary endpoint only through a failover box (draw it as a load balancer in failover mode).',
    checks: [
      { label: 'The driver app reaches the documents through a System API', rule: { type: 'path', from: 'web-app', via: 'system-api', to: 'azure-blob' } },
      { label: 'The System API calls the failover box', rule: { type: 'edge', from: 'system-api', to: 'load-balancer' } },
      { label: 'The failover box has a line to the primary and to the secondary', rule: { type: 'each', of: 'load-balancer', edgeTo: 'azure-blob', count: 2 } },
      { label: 'Both endpoints are reached only through the failover box', rule: { type: 'only-via', target: 'azure-blob', from: 'load-balancer' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Driver app'],
        exp: ['experience-api', 'exp-driver-documents', { replicas: 2, vCores: '0.5', timeoutMs: 20000 }],
        sys: ['system-api', 'sys-documents', { replicas: 2, vCores: '0.5', timeoutMs: 15000 }],
        lb: ['load-balancer', 'Endpoint failover', { mode: 'failover' }],
        blob1: ['azure-blob', 'Documents (primary region)'],
        blob2: ['azure-blob', 'Documents (secondary, read only)'],
      },
      ['web -> exp', 'exp -> sys', 'sys -> lb', 'lb -> blob1', 'lb -> blob2'],
    ),
    simulation: {
      systems: [{ match: 'azure-blob', latencyMs: 250 }],
      tests: [
        {
          name: 'A normal day',
          about: 'About 30 document reads a second. All of them are served by the primary, and the secondary gets none.',
          traffic: [reads],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: primary, min: 0.99 }], notReached: [{ node: secondary }] },
        },
        {
          name: 'The primary region fails',
          about: 'The primary storage region is out for 40 minutes. Reads go to the secondary, and drivers still open their delivery notes.',
          traffic: [reads],
          incidents: [{ down: primary, at: 5, forMin: 40 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'Large notes on a slow morning',
          about: 'Scanned notes with photos take about 12 seconds to read for half an hour. Drivers still get them.',
          traffic: [reads],
          incidents: [{ slow: primary, latencyMs: 12000, at: 0, forMin: 30 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'A zone fails at the morning peak',
          about: 'One availability zone goes down for 15 minutes. The replicas in the other zone serve every driver.',
          traffic: [reads],
          incidents: [{ zone: true, at: 10, forMin: 15 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Quayle Freight, a fictional haulier, keeps signed delivery notes as PDFs in **Azure Blob Storage**. Drivers and customer service open them all day through the **driver app**, which calls a documents Experience API and a documents System API.

The storage account uses read access geo redundant storage (**RA-GRS**): Azure copies every blob to a second region, and the copy can be read, not written, through a **secondary endpoint** (check your account's replication setting; the copy can lag the primary by some minutes).

Last spring the primary region had a four hour storage outage. The notes were safe, but nobody could open them, and drivers could not prove deliveries at the gate.

**Numbers**
- About **30 reads a second** in the day; a slow read holds a thread for as long as it takes. A read takes about 250 ms.
- A large scanned note takes about **12 seconds** to read, for up to half an hour on a busy morning.
- A regional outage can last **hours**; the test uses 40 minutes.
- Both APIs run on CloudHub; an availability zone can fail.
- In this model calls time out after 10 seconds unless set otherwise, each replica has 128 threads plus 256 per vCore (the smallest is 0.1 vCore), and a read holds a thread in every API it passes while it waits.

**Questions:**
- Draw the design. In Mule the failover box is a First Successful over two connector configurations, or a choice on the error; draw it as a load balancer in failover mode.
- Why failover and not spreading reads over both endpoints?
- Set the timeouts and replicas, and say on which box each goes.
- What must the app tell a user while it reads from the secondary?
`,
  answerTemplate: `## Design

## Failover, not spread

## Settings

## Reading a copy
`,
  keyPoints: [
    'The secondary is a read only copy that can be minutes behind. Spread reads would show a note signed a minute ago as missing, half the time. Failover reads it only when the primary is gone.',
    'Uploads cannot fail over: the secondary takes no writes. New notes wait, or go to a holding store, until the primary is back.',
    'A 12 second read needs timeouts above it on both APIs, the outer one longer than the inner one, or the Experience API gives up first.',
    'Slow reads hold threads: 30 reads a second for 12 seconds is about 360 waiting at once. Two replicas of 0.1 vCore give about 300 threads, too few. Two of 0.5 vCore give 512, and one of them alone can carry the load when a zone fails.',
    'Failover needs a clear signal: a timeout or a connection error from the primary. A 404 is not an outage and must not send the read to the copy.',
  ],
  solution: `
**Design**
\`\`\`
Driver app ─► exp-driver-documents ─► sys-documents ─► Endpoint failover ─► Documents (primary region)
                                                                          ─► Documents (secondary, read only)
\`\`\`

**Settings.** \`exp-driver-documents\`: 2 replicas of 0.5 vCore, timeout 20 seconds. \`sys-documents\`: the same, with a 15 second timeout. Failover mode on the failover box.

**While on the copy.** The System API adds a flag to the answer, and the app shows "a note signed in the last few minutes may not appear yet".
`,
  followUps: [
    {
      q: 'Microsoft can fail the account over to the secondary region for you. Why build failover in the API at all?',
      a: 'An account failover is a large step that someone decides on, and it can take a while. Reading from the secondary in the API keeps reads working from the first minute, while that decision is made.',
    },
    {
      q: 'How do you know the primary is back?',
      a: 'The failover box tries the primary first on every read, so reads move back by themselves. With a circuit breaker, a short probe interval decides how soon.',
    },
  ],
}
