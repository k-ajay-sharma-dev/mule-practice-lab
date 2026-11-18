import { diagram } from '../../arch/dsl.js'

const works = { type: 'legacy', label: 'works' }
const reports = { name: 'pothole reports', from: 'mobile-app', rps: 15, to: ['file-store', works], kind: 'write' }
const intake = { type: 'process-api', label: ['street-reports', 'street reports'] }

export default {
  id: 'uc-143',
  category: 'use-cases',
  title: 'Pothole Reports With Photos From a Council App: Store the Photo at Once, Queue the Report for a Works System That Is Off Every Night, and Accept Only Signed-In Residents',
  level: 'INTERMEDIATE',
  tags: ['local-government', 'queue', 'file-storage', 'jwt', 'legacy', 'mobile'],
  estMinutes: 30,
  diagram: {
    task: 'draw the council app calling an API gateway that checks tokens, then a street reports Experience API and a street reports Process API. The Process API stores the photo in photo storage through one System API, and puts the report on a queue. A worker reads the queue and creates the job in the highways works system through another System API.',
    checks: [
      { label: 'The app comes in through the API gateway', rule: { type: 'edge', from: 'mobile-app', to: 'api-gateway' } },
      { label: 'The Experience API is reached only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'The photo is stored through a System API', rule: { type: 'path', from: intake, via: 'system-api', to: 'file-store' } },
      { label: 'Reports wait on a queue before they reach the works system', rule: { type: 'path', from: intake, via: 'queue', to: works } },
      { label: 'The app never waits on the works system', rule: { type: 'no-path', from: 'mobile-app', to: works, kind: 'sync' } },
      { label: 'The works system is reached only through a System API', rule: { type: 'only-via', target: works, from: 'system-api' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Council app'],
        gw: ['api-gateway', 'API gateway', { auth: 'jwt' }],
        exp: ['experience-api', 'exp-council-app'],
        prc: ['process-api', 'prc-street-reports'],
        sysP: ['system-api', 'sys-photos'],
        fs: ['file-store', 'Photo storage'],
        q: ['queue', 'street-reports', { maxRedelivery: 240 }],
        dlq: ['dlq', 'street-reports DLQ'],
        wrk: ['process-api', 'prc-works-orders'],
        sysW: ['system-api', 'sys-highways-works'],
        hw: ['legacy', 'Highways works system'],
      },
      ['app -> gw', 'gw -> exp', 'exp -> prc', 'prc -> sysP', 'sysP -> fs', 'prc ~> q', 'q ~> wrk', 'q ~> dlq', 'wrk -> sysW', 'sysW -> hw'],
    ),
    simulation: {
      systems: [
        { match: 'file-store', latencyMs: 250 },
        { match: works, latencyMs: 600, maxRps: 20 },
      ],
      tests: [
        {
          name: 'A wet Monday',
          about: 'After a frost, residents send 15 reports a second. Each one is answered within a second, every photo is stored and every report reaches the works system.',
          traffic: [reports],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1000 }], delivered: [{ to: 'file-store', min: 0.99 }, { to: works, min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The works system is off for the night',
          about: 'The works system is off for its nightly backup. Residents can still report, the reports wait on the queue, and they all reach the works system when it is back.',
          traffic: [{ ...reports, rps: 3 }],
          incidents: [{ down: works, at: 5, forMin: 120 }],
          durationMin: 180,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: works, min: 0.99 }], lost: { max: 0 }, dlq: { max: 0 } },
        },
        {
          name: 'A report without a token',
          about: 'A script posts reports without signing in. The gateway refuses them, and nothing is stored or queued.',
          traffic: [{ ...reports, name: 'no token', rps: 5, auth: 'none' }],
          durationMin: 10,
          expect: { answers: [{ flow: 'no token', minRefused: 0.99 }], notReached: [{ flow: 'no token', node: 'file-store' }, { flow: 'no token', node: 'queue' }] },
        },
      ],
    },
  },
  description: `
A city council's **council app** lets residents report a pothole with a photo and a location. Each report must become a job in the **highways works system**, an old system in the council's data centre. Photos go to **photo storage**, a cloud object store.

The works system is **switched off every night** from 01:00 to 03:00 for a backup. Today the app's reports fail during those hours, and residents who report on their way home from a late shift get an error.

Residents sign in to the app with the council's identity service, which issues a JWT.

**Numbers**
- About **15 reports a second** on a bad morning after a frost, a few a second at night.
- Photo storage answers in about 250 ms.
- The works system answers in about 600 ms and takes up to **20 jobs a second**.

**Questions:**
- Draw the design.
- How does a resident get an answer at once, even at 02:00?
- Where is the photo kept, and why is it not sent through the queue?
- How do you make sure only signed-in residents can report?
`,
  answerTemplate: `## Design

## Answering at once

## The photo

## Signed-in residents
`,
  keyPoints: [
    'Store the photo first, through a System API in front of photo storage, then queue the report with a link to the photo.',
    'Large files do not belong in a message. The queue carries a small report and a reference to the photo: the claim check pattern.',
    'The resident is answered once the photo is stored and the report is on the queue. The works system is not on that path.',
    'The queue holds reports through the nightly backup. Set the redelivery limit well above the two hour window, with a DLQ for reports that can never be created.',
    'The gateway checks the JWT, so only signed-in residents reach the API. The report records who sent it.',
  ],
  solution: `
**Design**
\`\`\`
Council app ─► API gateway (JWT) ─► exp-council-app ─► prc-street-reports ─► sys-photos ─► Photo storage
                                                          ~► street-reports ~► prc-works-orders ─► sys-highways-works ─► Highways works system
                                                                       ~► DLQ
\`\`\`

**Answering at once.** \`prc-street-reports\` stores the photo, puts \`{ reportId, location, description, photoKey, residentId }\` on the queue, and answers 202 with the report ID. The app says "thank you, we have your report".

**The night.** \`prc-works-orders\` fails to reach the works system and the report is delivered again later. In this model about once a minute, so a limit of 240 covers four hours. Reports that still fail, such as one with a location outside the city, go to the DLQ for the highways team.

**The photo.** Photos can be several megabytes. Kept in storage, they are written once and the works system links to them, instead of a big message moving through a broker.

**Signed-in residents.** The gateway validates the JWT: signature, issuer, audience and expiry. The Experience API takes the resident ID from the token, not from the request body.
`,
  followUps: [
    {
      q: 'The same pothole is reported by 40 people. What would you do?',
      a: 'Let the Process API look for an open report within a few metres of the same location and add the new photo to it, instead of creating 40 jobs.',
    },
    {
      q: 'How does the resident learn that the pothole was fixed?',
      a: 'When the works system closes the job, an event goes back through Mule to the app\'s push notifications, using the report ID that the app was given.',
    },
  ],
}
