import { diagram } from '../../arch/dsl.js'

const migration = { name: 'archive migration', from: 'batch-job', rps: 250, to: ['file-store', 'azure-blob'], kind: 'write' }
const live = { name: 'case worker saves', from: 'internal-app', rps: 300, to: 'azure-blob', kind: 'write', spikes: [{ at: 10, forMin: 30, rps: 600 }] }

export default {
  id: 'uc-162',
  category: 'use-cases',
  title: 'Forty Million Archived Documents to Azure Blob Storage in One Weekend, While Case Workers Keep Saving New Ones: Size the Migration, Protect the Live Path, Survive a Zone Outage',
  level: 'EXPERT',
  tags: ['myproject', 'azure-blob', 'migration', 'batch', 'sizing', 'availability', 'retry', 'public-sector'],
  estMinutes: 55,
  diagram: {
    task: 'draw a migration job that reads each archived document from the on-premises document share and writes it to Azure Blob Storage through a blob System API. Draw the case worker app saving new documents through a case documents Experience API and the same blob System API.',
    checks: [
      { label: 'The migration job reads the on-premises share', rule: { type: 'edge', from: 'batch-job', to: 'file-store' } },
      { label: 'The migration writes to blob storage through the System API', rule: { type: 'path', from: 'batch-job', via: 'system-api', to: 'azure-blob' } },
      { label: 'Case workers save through an Experience API', rule: { type: 'path', from: 'internal-app', via: 'experience-api', to: 'azure-blob' } },
      { label: 'Case workers never wait on the old share', rule: { type: 'no-path', from: 'internal-app', to: 'file-store' } },
      { label: 'Blob storage is reached only through a System API', rule: { type: 'only-via', target: 'azure-blob', from: 'system-api' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'archive-migration', { vCores: '1' }],
        share: ['file-store', 'On-premises document share'],
        app: ['internal-app', 'Case worker app'],
        exp: ['experience-api', 'exp-case-documents', { replicas: 2, vCores: '2' }],
        sysB: ['system-api', 'sys-case-archive', { replicas: 2, vCores: '2', retries: 2 }],
        blob: ['azure-blob', 'case-archive container'],
      },
      ['job -> share', 'job -> sysB', 'app -> exp', 'exp -> sysB', 'sysB -> blob'],
    ),
    simulation: {
      systems: [
        { match: 'file-store', latencyMs: 80, maxRps: 400 },
        { match: 'azure-blob', latencyMs: 250, maxRps: 1000 },
      ],
      tests: [
        {
          name: 'Saturday morning',
          about: 'The migration copies 250 documents a second. Case workers save 300 a second, and 600 a second for half an hour after the weekend shift starts. Both get through, case workers wait under a second, and storage stays within its 1,000 a second.',
          traffic: [migration, live],
          durationMin: 60,
          expect: {
            answers: [{ flow: 'archive migration', minSuccess: 0.99 }, { flow: 'case worker saves', minSuccess: 0.99, maxMs: 800 }],
            peakRps: [{ node: 'azure-blob', max: 1000 }, { node: 'file-store', max: 400 }],
          },
        },
        {
          name: 'A zone fails during the busy half hour',
          about: 'An availability zone goes down for 15 minutes at the busiest time. The migration job may pause and resume from its progress table, but case workers keep saving through the replicas in the other zone.',
          traffic: [migration, live],
          incidents: [{ zone: true, at: 15, forMin: 15 }],
          durationMin: 45,
          expect: { answers: [{ flow: 'case worker saves', minSuccess: 0.99 }] },
        },
        {
          name: 'Storage pushes back',
          about: 'For half an hour storage answers 1 write in 20 with "server busy". Retries in the blob System API get almost every document through.',
          traffic: [migration, live],
          incidents: [{ errors: 'azure-blob', rate: 0.05, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'archive migration', minSuccess: 0.99 }, { flow: 'case worker saves', minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Thornbury County Council, a fictional council, is closing its data centre. Its **on-premises document share** holds **40 million** archived case documents, which must move to **Azure Blob Storage** over one long weekend. The **case worker app** stays open all weekend, and new documents saved in it must go straight to blob storage.

A **migration job** in Mule will copy the archive. New saves go through a case documents Experience API. Both write through one blob System API, which owns the container, the naming and the retries.

**Numbers**
- 40 million documents in about 48 hours is about **250 a second**, all weekend.
- Case workers save about **300 documents a second**, and **600 a second** for half an hour when the weekend shift starts.
- The share serves up to 400 reads a second at about 80 ms. In this scenario, the storage account takes about **1,000 writes a second** at about 250 ms.
- On busy periods storage answers about **1 write in 20** with "server busy".
- A case worker's save must finish within **800 ms**.
- The APIs run on CloudHub 2.0 across availability zones, and a zone can fail for 15 minutes.
- In this model one vCore serves about 500 requests a second, the smallest size is 0.1 vCore, and an app with one replica stops when its zone fails.

**Questions:**
- Draw the design.
- Size the migration job, the Experience API and the blob System API. Show the sums.
- How do you keep the migration from slowing case workers down?
- What happens if a zone fails during the busy half hour?
- Where do retries belong?
`,
  answerTemplate: `## Design

## Sizing

## Protecting the live path

## A zone outage

## Retries
`,
  keyPoints: [
    'The migration rate is set by the deadline: 40 million in 48 hours is about 250 a second. The job needs about half a vCore; 1 vCore leaves room.',
    'Live and migration traffic meet at the blob System API: 300 to 600 live plus 250 migration is up to 850 a second, under the account\'s 1,000. Size that API for 850 even with one zone gone.',
    'Two replicas of 2 vCores give the System API about 1,000 a second in one zone. The Experience API needs 600 a second in one zone: two replicas of 2 vCores.',
    'The migration must not take what live needs. Keep its rate fixed, and lower it if storage starts pushing back while case workers are busy.',
    'Retry "server busy" in the System API, the one place that talks to storage, so both callers benefit.',
    'Make the migration rerunnable: same blob name for the same document, and a table of what was copied, so a crash resumes instead of restarting.',
  ],
  solution: `
**Design**
\`\`\`
archive-migration ─► On-premises document share
        └─► sys-case-archive ─► case-archive container
Case worker app ─► exp-case-documents ─┘
\`\`\`

**Sizing.** Migration job: 1 vCore (250 a second). Experience API: 2 replicas of 2 vCores (one zone serves about 1,000, the peak is 600). Blob System API: 2 replicas of 2 vCores, with 2 retries.

**A zone outage.** The two replicas of each API sit in different zones, so case workers keep saving. The migration job is one worker; if its zone fails it stops, and it resumes from the progress table when it is back. Losing 15 minutes of a 48 hour copy is acceptable.

**The live path first.** The migration runs at a fixed rate well under what is left after the live peak. If case workers complain, the migration is slowed, not the other way round.

**Tracking progress.** A table of documents copied, with their blob names and sizes, lets the job resume after a stop and gives the council a count for the cut over decision. A final pass compares the share's file list with what is in storage.

**After the weekend.** Scale the System API back down; the migration capacity is no longer needed.
`,
  followUps: [
    {
      q: 'Why not use a storage copy tool instead of Mule for the archive?',
      a: 'For a straight copy, a tool such as AzCopy is often the better choice: built for it, and fast. Mule earns its place when each document needs metadata from the case system, a new name, or a record in a database as it moves.',
    },
    {
      q: 'Case workers open an archived document that has not moved yet. What do they see?',
      a: 'Until cut over, reads go to the share. Or the read API tries storage first and falls back to the share, which works during the move.',
    },
  ],
}
