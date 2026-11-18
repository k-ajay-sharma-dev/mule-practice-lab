import { diagram } from '../../arch/dsl.js'

const opens = { name: 'drawing opens', from: 'internal-app', rps: 40, to: 'file-store', kind: 'read' }

export default {
  id: 'uc-164',
  category: 'use-cases',
  title: 'CloudHub Cannot Mount SMB: Put a Small Drawings System API Next to the Azure File Share, Size It for Monday Morning, and Retry a Busy Share',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-file-share', 'cloudhub', 'hybrid', 'system-api', 'sizing', 'retry', 'construction'],
  estMinutes: 35,
  diagram: {
    task: 'draw the estimating app calling an estimating Experience API on CloudHub. It reaches the drawings on the Azure File Share only through a drawings System API that runs on a runtime with the share mounted.',
    checks: [
      { label: 'The estimating app calls an Experience API', rule: { type: 'edge', from: 'internal-app', to: 'experience-api' } },
      { label: 'The share is reached only through a System API', rule: { type: 'only-via', target: 'file-store', from: 'system-api' } },
      { label: 'The Experience API goes through the System API to the share', rule: { type: 'path', from: 'experience-api', via: 'system-api', to: 'file-store' } },
      { label: 'The Experience API never reads the share itself', rule: { type: 'no-edge', from: 'experience-api', to: 'file-store' } },
    ],
    reference: diagram(
      {
        app: ['internal-app', 'Estimating app'],
        exp: ['experience-api', 'exp-estimating', { vCores: '0.5' }],
        sys: ['system-api', 'sys-drawings-share', { vCores: '0.5', retries: 2 }],
        share: ['file-store', 'Azure File Share drawings'],
      },
      ['app -> exp', 'exp -> sys', 'sys -> share'],
    ),
    simulation: {
      systems: [{ match: 'file-store', latencyMs: 250 }],
      tests: [
        {
          name: 'A normal day',
          about: 'Estimators open about 40 drawings a second. Each opens within a second.',
          traffic: [opens],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1000 }] },
        },
        {
          name: 'Monday morning',
          about: 'Every estimator opens the week\'s jobs at once: 180 drawings a second for 20 minutes. Nearly all of them open.',
          traffic: [{ ...opens, spikes: [{ at: 5, forMin: 20, rps: 180 }] }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'The share is busy',
          about: 'A large copy runs on the storage account and one read in ten is refused for 15 minutes. Retries in the System API get the drawings through.',
          traffic: [opens],
          incidents: [{ errors: 'file-store', rate: 0.1, at: 0, forMin: 15 }],
          durationMin: 15,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Ravenscar Builders, a fictional construction firm, keeps project drawings on an **Azure File Share**, \`drawings\`. Site offices map it as a drive. The new estimating app needs to open the same drawings, through an API on **CloudHub**.

CloudHub workers cannot mount an SMB share. The team chose a hybrid layout: the Experience API stays on CloudHub, and a small **drawings System API** runs on a Mule runtime in Azure next to the share, with the share mounted over SMB. Another option, the File Share REST API from CloudHub, was set aside because the drawings tool also needs folder listings with Windows permissions.

**Numbers**
- About **40 drawing opens a second**, and **180 a second** for 20 minutes on Monday mornings.
- A read from the share takes about 250 ms.
- During large copies on the storage account, about **1 read in 10** fails for a short time.
- In this model one vCore serves about 500 requests a second, and the smallest size is 0.1 vCore.

**Questions:**
- Draw the design.
- Why does the share sit behind a System API, and where does that API run?
- Size both APIs for Monday morning. Show the sums.
- Where do retries belong?
`,
  answerTemplate: `## Design

## Why a System API next to the share

## Sizing

## Retries
`,
  keyPoints: [
    'CloudHub cannot mount SMB, so something that can must sit next to the share: a runtime on a VM or on premises, or the REST API instead.',
    'The System API owns the mount, the paths and the retries. The Experience API on CloudHub only knows a URL.',
    'Size for the peak: 180 a second needs more than the smallest 0.1 vCore. Half a vCore each gives about 250 a second with room.',
    'Retry where the share is called, in the System API, so every caller benefits and the retries happen close to the error.',
    'Keep the share\'s permissions in one place. The System API reads with its own identity, so check what that identity may see.',
  ],
  solution: `
**Design**
\`\`\`
Estimating app ─► exp-estimating (CloudHub) ─► sys-drawings-share (runtime in Azure, share mounted) ─► Azure File Share drawings
\`\`\`

**Sizing.** 180 a second at the peak. 0.1 vCore gives about 50 a second, too small. 0.5 vCore gives about 250 a second: use it for both APIs.

**Retries.** 2 retries in the System API on a busy share, with a short pause.

**Network.** The CloudHub app reaches the System API over a VPN or private link into the Azure network, not over the public internet.

**Large drawings.** Stream the file through both APIs; do not read it into memory to pass it on.
`,
  followUps: [
    {
      q: 'When would you pick the REST API instead of the hybrid runtime?',
      a: 'When you only read and write whole files by name, and do not need Windows permissions or a mount. REST then avoids running a server. It cannot use SMB style folder permissions.',
    },
    {
      q: 'The runtime next to the share goes down. What do estimators see?',
      a: 'Every open fails. Run two replicas or two VMs behind a load balancer, both with the share mounted.',
    },
  ],
}
