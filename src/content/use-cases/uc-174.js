import { diagram } from '../../arch/dsl.js'

const sales = { name: 'store sales', from: 'pos', rps: 40, to: 'sftp-server', kind: 'write', spikes: [{ at: 10, forMin: 20, rps: 300 }] }
const master = { name: 'master data', from: { type: 'batch-job', label: 'master' }, rps: 2, to: ['erp', 'sftp-server'], kind: 'write' }
const plans = { name: 'allocations back', from: { type: 'batch-job', label: 'collector' }, rps: 3, to: ['sftp-server', 'wms'], kind: 'write' }

export default {
  id: 'uc-174',
  category: 'use-cases',
  title: 'Every Planning Flow Over One SFTP Server for 400 Stores: Closing Time Sales Through a Queue, Master Data From the ERP, Allocations Back to the WMS, and Settings for Each Way It Can Fail',
  level: 'EXPERT',
  tags: ['myproject', 'sftp', 'planning', 'queues', 'dlq', 'sizing', 'availability', 'retail'],
  estMinutes: 60,
  diagram: {
    task: 'draw the store tills posting end of day sales to a store sales Experience API, which puts each store\'s sales on a queue with a dead-letter queue. A sales file writer job reads the queue and writes to the planning platform\'s SFTP server. A master data job reads the ERP through an ERP System API and writes to the same server. An allocations collector job reads allocation files from the server and puts each on a second queue with a dead-letter queue. An allocations Process API reads it and calls the WMS through a WMS System API.',
    checks: [
      { label: 'Tills post sales to an Experience API', rule: { type: 'edge', from: 'pos', to: 'experience-api' } },
      { label: 'Tills never wait on the SFTP server', rule: { type: 'no-path', from: 'pos', to: 'sftp-server', kind: 'sync' } },
      { label: 'Every queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The WMS is reached only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
      { label: 'Allocations wait on a queue before the WMS', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'wms' } },
      { label: 'Jobs exchange files with the SFTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server', min: 3 } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store tills'],
        exp: ['experience-api', 'exp-store-sales', { replicas: 2, vCores: '1' }],
        qS: ['queue', 'store.sales', { maxRedelivery: 90 }],
        dS: ['dlq', 'store.sales.dlq'],
        wr: ['batch-job', 'sales-file-writer', { vCores: '1' }],
        sftp: ['sftp-server', 'Planning platform SFTP'],
        md: ['batch-job', 'master-data-export'],
        sysE: ['system-api', 'sys-erp-merch'],
        erp: ['erp', 'Merchandising ERP'],
        col: ['batch-job', 'allocations-collector'],
        qA: ['queue', 'allocations.ready', { maxRedelivery: 90 }],
        dA: ['dlq', 'allocations.ready.dlq'],
        prc: ['process-api', 'prc-allocations'],
        sysW: ['system-api', 'sys-wms'],
        wms: ['wms', 'Warehouse WMS'],
      },
      ['pos -> exp', 'exp ~> qS', 'qS ~> wr', 'qS ~> dS', 'wr -> sftp', 'md -> sysE', 'sysE -> erp', 'md -> sftp', 'col -> sftp', 'col ~> qA', 'qA ~> prc', 'qA ~> dA', 'prc -> sysW', 'sysW -> wms'],
    ),
    simulation: {
      systems: [
        { match: 'sftp-server', latencyMs: 400 },
        { match: 'erp', latencyMs: 150 },
        { match: 'wms', latencyMs: 200 },
      ],
      tests: [
        {
          name: 'Closing time',
          about: 'Stores post about 40 sales batches a second, and 300 a second for 20 minutes after closing. Tills are answered within a second, and every batch reaches the planning platform.',
          traffic: [sales, master, plans],
          durationMin: 40,
          expect: {
            answers: [{ flow: 'store sales', minSuccess: 0.99, maxMs: 1000 }, { flow: 'master data', minSuccess: 0.99 }],
            delivered: [{ flow: 'store sales', to: 'sftp-server', min: 0.99 }, { flow: 'allocations back', to: 'wms', min: 0.99 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'A zone fails at closing time',
          about: 'An availability zone is down for 15 minutes during the closing rush. Tills keep being answered through the replica in the other zone.',
          traffic: [sales],
          incidents: [{ zone: true, at: 12, forMin: 15 }],
          durationMin: 40,
          expect: { answers: [{ flow: 'store sales', minSuccess: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'SFTP server maintenance',
          about: 'The planning platform\'s SFTP server is down for an hour. Store sales wait on their queue and all reach it afterwards. None lands on a dead-letter queue.',
          traffic: [{ ...sales, spikes: [] }],
          incidents: [{ down: 'sftp-server', at: 5, forMin: 60 }],
          durationMin: 120,
          expect: { answers: [{ flow: 'store sales', minSuccess: 0.99 }], delivered: [{ flow: 'store sales', to: 'sftp-server', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Allocations for a store that is not open yet',
          about: 'One allocation in a hundred is for a store the WMS does not know. Those end on the allocations dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...plans, poison: 0.01 }],
          durationMin: 180,
          expect: { dlq: { min: 1 }, backlog: [{ queue: { type: 'queue', label: 'allocations' }, maxEnd: 200 }] },
        },
      ],
    },
  },
  description: `
Marrow & Pine Home, a fictional homewares retailer with **400 stores**, runs every exchange with the planning platform through the **platform's SFTP server**:

- **Sales out**: at closing, every store's tills post the day's sales to Mule. The platform wants them as files on its server.
- **Master data out**: each night, items and stores from the merchandising **ERP**.
- **Allocations back**: the platform writes allocation files, and each must reach the **WMS**.

The first design had tills call an API that wrote straight to the SFTP server. On the night of the platform's server maintenance, tills hung at closing and staff could not close their registers.

**Numbers**
- About **40 sales batches a second** most of the evening, **300 a second** for 20 minutes after closing.
- Master data: about 2 files a second for half an hour. Allocations: about 3 a second.
- The platform's SFTP server has up to **an hour** of maintenance a month.
- About **1 allocation in 100** is for a store the WMS does not know yet.
- APIs run on CloudHub 2.0 across availability zones; a zone can fail.
- In this model one vCore serves about 500 requests a second, the smallest size is 0.1 vCore, an app with one replica stops when its zone fails, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- How do tills stop depending on the SFTP server?
- Size and replicate the store sales Experience API, and size the sales file writer. Show the sums.
- Set the redelivery limits for both queues and explain each.
- What would you watch on a busy night?
`,
  answerTemplate: `## Design

## Tills and the SFTP server

## Sizing the Experience API

## Redelivery limits

## Watching a busy night
`,
  keyPoints: [
    'Tills only wait for the Experience API to put their sales on a queue. The SFTP server can be slow or down without a till noticing.',
    '300 batches a second is about 0.6 vCore of work. With 2 replicas of 1 vCore, one zone alone still serves about 500 a second.',
    'An hour of SFTP maintenance is about 60 deliveries; a limit of 90 on store.sales lets every batch wait it out. The writer then needs spare capacity to clear the backlog: 1 vCore drains it in minutes, 0.1 vCore never catches up.',
    'A limit on allocations.ready sends an allocation for an unknown store to the DLQ after its tries, instead of retrying it all night.',
    'The SFTP server is shared by three jobs. Write under temporary names, and agree with the platform which folders each job may touch.',
  ],
  solution: `
**Design**
\`\`\`
Store tills ─► exp-store-sales ~► store.sales ~► sales-file-writer ─► Planning platform SFTP
                               store.sales ~► store.sales.dlq
master-data-export ─► sys-erp-merch ─► ERP ;  master-data-export ─► Planning platform SFTP
allocations-collector ─► Planning platform SFTP ;  allocations-collector ~► allocations.ready ~► prc-allocations ─► sys-wms ─► WMS
                                                 allocations.ready ~► allocations.ready.dlq
\`\`\`

**Sizing.** Peak 300 a second. One replica of 1 vCore serves about 500, so 2 replicas of 1 vCore survive a zone with room. The sales file writer must drain 300 a second at the peak, and an hour of backlog after maintenance: 1 vCore.

**Limits.** 90 deliveries on both queues.

**Files.** The sales writer groups messages into one file per store and day, written under a temporary name and renamed when the store's batch is complete.

**A busy night.** Queue depths, DLQ counts, the age of the oldest sales message, and a count of store files written against 400.
`,
  followUps: [
    {
      q: 'The platform asks for one sales file for all stores instead of one per store. What changes?',
      a: 'The writer collects into a staging table and a scheduled step writes the single file once all 400 stores are in, or at a cut off time. Tills are unaffected.',
    },
    {
      q: 'Why is master data not on a queue?',
      a: 'It is one job reading the ERP and writing files at night; nothing waits on it. A queue would add parts without removing a risk.',
    },
  ],
}
