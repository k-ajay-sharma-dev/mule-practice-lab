import { diagram } from '../../arch/dsl.js'

const relay = { name: 'store sales relay', from: 'batch-job', rps: 2, to: [{ type: 'sftp-server', label: 'hub' }, { type: 'sftp-server', label: 'planning' }], kind: 'write' }

export default {
  id: 'uc-177',
  category: 'use-cases',
  title: 'Store Sales From the Stores\' FTP Hub to the Planning Platform\'s FTP Server: a Relay Job That Survives a Zone Outage and Waits Long Enough for Monday\'s Files',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'ftp', 'relay', 'availability', 'timeout', 'sales', 'planning'],
  estMinutes: 35,
  diagram: {
    task: 'draw the store tills uploading their sales files to the stores\' FTP hub, and one relay job that reads each file from the hub and writes it to the planning platform\'s FTP server. The tills never reach the planning platform\'s server.',
    checks: [
      { label: 'The tills upload to the FTP hub', rule: { type: 'edge', from: 'pos', to: { type: 'sftp-server', label: 'hub' } } },
      { label: 'The relay job reads the hub', rule: { type: 'edge', from: 'batch-job', to: { type: 'sftp-server', label: 'hub' } } },
      { label: 'The relay job writes the planning platform\'s server', rule: { type: 'edge', from: 'batch-job', to: { type: 'sftp-server', label: 'planning' } } },
      { label: 'The tills never reach the planning platform\'s server', rule: { type: 'no-path', from: 'pos', to: { type: 'sftp-server', label: 'planning' } } },
      { label: 'The relay waits for both of its calls', rule: { type: 'lines', from: 'batch-job', kind: 'sync' } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store tills'],
        hub: ['sftp-server', 'Stores FTP hub'],
        job: ['batch-job', 'store-sales-relay', { replicas: 2, timeoutMs: 45000 }],
        plan: ['sftp-server', 'Planning platform FTP'],
      },
      ['pos -> hub', 'job -> hub', 'job -> plan'],
    ),
    simulation: {
      systems: [
        { match: { type: 'sftp-server', label: 'hub' }, latencyMs: 400 },
        { match: { type: 'sftp-server', label: 'planning' }, latencyMs: 2000 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'About two files a second for half an hour. Every file reaches the planning platform\'s server.',
          traffic: [relay],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: { type: 'sftp-server', label: 'planning' }, min: 0.99 }] },
        },
        {
          name: 'Monday\'s weekend files',
          about: 'Monday\'s files hold three days of sales. For half an hour each upload takes about 20 seconds, and every file still arrives.',
          traffic: [relay],
          incidents: [{ slow: { type: 'sftp-server', label: 'planning' }, latencyMs: 20000, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'A zone fails during the night',
          about: 'An availability zone is down for 20 minutes. A relay replica in the other zone keeps the files moving.',
          traffic: [relay],
          incidents: [{ zone: true, at: 5, forMin: 20 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Fenwick Sports, a fictional sports retailer, collects each store's daily sales file. The tills upload to a **stores' FTP hub** in the head office. The planning platform reads sales only from **its own FTP server**, in the cloud.

A relay job on CloudHub 2.0 reads each new file from the hub and writes it to the platform's server.

**Numbers**
- About **2 files a second** for half an hour each night.
- A normal upload to the platform takes about 2 seconds. On Mondays the files hold the weekend and take about **20 seconds** for the first half hour.
- Last quarter an availability zone failed for 20 minutes during the night run. The relay had one replica, in that zone.
- In this model calls time out after 10 seconds unless set otherwise.

**Questions:**
- Draw the design.
- How many replicas does the relay need, and what must you add so two replicas do not send the same file?
- What timeout does the relay need?
- Why should the tills not upload to the platform directly?
`,
  answerTemplate: `## Design

## Replicas, and one file sent once

## Timeout

## Why a hub
`,
  keyPoints: [
    'Two replicas spread over zones keep the relay running when one zone fails.',
    'Two replicas both poll the hub. Run the listener on the primary node only, or claim each file by renaming it into a processing folder before reading it.',
    'A 20 second upload needs a timeout above it. 45 seconds leaves room.',
    'Tills on store networks should not hold credentials for a partner\'s server. The hub keeps one controlled path out.',
  ],
  solution: `
**Design**
\`\`\`
Store tills ─► Stores FTP hub ◄─ store-sales-relay ─► Planning platform FTP
\`\`\`

**Settings.** 2 replicas, 45 second timeout.

**One file, one sender.** Primary node only on the listener. If both replicas must work, each renames a file to \`<name>.<replica>.claimed\` first; a rename that fails means another replica has it.

**On the platform's server** write \`.tmp\` and rename, so the platform never loads half a file. Move the hub file to \`sent\` only after the rename.
`,
  followUps: [
    {
      q: 'The relay is down for an hour. Is anything lost?',
      a: 'No. The files wait on the hub, and the relay sends them when it is back. Alert if files on the hub are older than an hour, because the platform\'s run will not wait.',
    },
    {
      q: 'Why not mount the hub folder in the platform\'s server?',
      a: 'They are on different networks and owned by different companies. A relay keeps each side\'s access to its own server.',
    },
  ],
}
