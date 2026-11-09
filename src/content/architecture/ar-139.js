import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-139',
  category: 'architecture',
  title: 'Active-Passive for an Asynchronous Order Pipeline Across Two CloudHub 2.0 Regions: Stranded Messages, a Drain Job and Idempotent Consumers',
  level: 'EXPERT',
  tags: ['cloudhub-2', 'multi-region', 'disaster-recovery', 'anypoint-mq', 'idempotency', 'dlq', 'rpo-rto'],
  estMinutes: 50,
  diagram: {
    task: 'draw an active-passive order pipeline in two CloudHub 2.0 regions: a global load balancer in front of an ingress per region, an Experience API in each region that hands orders to that region\'s own Anypoint MQ queue, a Process API in each region draining its queue into the ERP through a System API, a dead-letter queue per queue, one replicated idempotency store both Process APIs check, and a drain job that moves stranded messages from the failed region\'s queue into the standby region\'s queue.',
    checks: [
      { label: 'A global load balancer plus an ingress for each region', rule: { type: 'node', match: 'load-balancer', min: 3 } },
      { label: 'The global load balancer routes to the ingress in each region', rule: { type: 'edge', from: { type: 'load-balancer', label: ['global', 'glb', 'dns', 'route 53'] }, to: 'load-balancer', min: 2 } },
      { label: 'Each region has its own queue', rule: { type: 'node', match: 'queue', min: 2 } },
      { label: 'Each Experience API hands orders to a queue as an async message', rule: { type: 'each', of: 'experience-api', min: 2, edgeTo: 'queue', kind: 'async' } },
      { label: 'Experience APIs never call a Process API directly, so a region can take orders while the back end is down', rule: { type: 'no-path', from: 'experience-api', to: 'process-api', kind: 'sync' } },
      { label: 'Each queue is drained by a Process API', rule: { type: 'each', of: 'queue', edgeTo: 'process-api', kind: 'async' } },
      { label: 'Every queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'No line between the two regional queues: Anypoint MQ does not copy messages between regions by itself', rule: { type: 'no-edge', from: 'queue', to: 'queue' } },
      { label: 'A drain job reads the stranded messages from a regional queue', rule: { type: 'edge', from: 'queue', to: 'batch-job', kind: 'async' } },
      { label: 'The drain job republishes them into the other region\'s queue', rule: { type: 'path', from: 'batch-job', to: 'queue', kind: 'async' } },
      {
        label: 'Both Process APIs check one shared, replicated idempotency store',
        rule: { type: 'each', of: 'process-api', min: 2, edgeTo: { type: ['database', 'cache'], label: ['idempot', 'dedup'] } },
      },
      {
        label: 'There is one idempotency store, not one per region',
        rule: { type: 'node', match: { type: ['database', 'cache'], label: ['idempot', 'dedup'] }, max: 1 },
      },
      { label: 'The ERP is reached only through System APIs', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Every Process API calls a System API', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api' } },
      { label: 'Each ingress routes to an Experience API', rule: { type: 'each', of: 'experience-api', edgeFrom: 'load-balancer' } },
      { label: 'Load balancers forward live requests, so their lines are sync calls', rule: { type: 'lines', touching: 'load-balancer', kind: 'sync' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop and mobile app'],
        glb: ['load-balancer', 'Global load balancer (DNS failover, health checks)'],
        ingE: ['load-balancer', 'Ingress: private space eu-central (active)'],
        ingW: ['load-balancer', 'Ingress: private space eu-west (passive)'],
        expE: ['experience-api', 'exp-orders (eu-central)'],
        expW: ['experience-api', 'exp-orders (eu-west)'],
        qE: ['queue', 'orders-submitted (eu-central)'],
        qW: ['queue', 'orders-submitted (eu-west)'],
        dlqE: ['dlq', 'orders-submitted DLQ (eu-central)'],
        dlqW: ['dlq', 'orders-submitted DLQ (eu-west)'],
        prcE: ['process-api', 'prc-order-fulfilment (eu-central)'],
        prcW: ['process-api', 'prc-order-fulfilment (eu-west)'],
        sysE: ['system-api', 'sys-erp-orders (eu-central)'],
        sysW: ['system-api', 'sys-erp-orders (eu-west)'],
        erp: ['erp', 'SAP S/4HANA (own DR)'],
        idem: ['database', 'Idempotency keys (replicated database)'],
        drain: ['batch-job', 'Drain job: eu-central queue to eu-west, run after recovery'],
        mon: ['monitoring', 'Queue depth and failover alerts'],
      },
      [
        'web -> glb', 'glb -> ingE', 'glb -> ingW', 'ingE -> expE', 'ingW -> expW',
        'expE ~> qE', 'expW ~> qW', 'qE ~> prcE', 'qW ~> prcW', 'qE ~> dlqE', 'qW ~> dlqW',
        'prcE -> idem', 'prcW -> idem', 'prcE -> sysE', 'prcW -> sysW', 'sysE -> erp', 'sysW -> erp',
        'qE ~> drain', 'drain ~> qW', 'prcE -> mon', 'prcW -> mon',
      ],
    ),
  },
  description: `
A European fashion retailer takes orders through an API-led pipeline on **CloudHub 2.0**. \`exp-orders\` accepts an order, puts it on the Anypoint MQ queue \`orders-submitted\`, and answers **202 Accepted**. \`prc-order-fulfilment\` reads the queue and creates the sales order in SAP S/4HANA through \`sys-erp-orders\`.

Volumes: about **80,000 orders a day**, peaks of **150 a second** during sales. The queue normally holds fewer than 200 messages.

The board wants the pipeline to survive the loss of the **eu-central** region:
- **RTO 30 minutes:** orders must be accepted again within 30 minutes.
- **No order may be lost or created twice in SAP.**
- An order already accepted may be **delayed by a few hours** during a disaster.
- SAP has its own DR and stays reachable from both regions.

The team picked **active-passive**: eu-west has a private space with all apps deployed and running, but the global load balancer sends it no traffic.

Facts the team found:
- Anypoint MQ queues live in one region. The eu-west queue is a separate queue with the same name.
- Messages already in the eu-central queue when the region fails are not lost, but they cannot be read until eu-central is back.
- The current idempotency check uses Object Store v2 in eu-central.

**Questions:**
- Draw the target design.
- What happens to the orders in the eu-central queue during and after the outage?
- How do you stop an order from being created twice in SAP?
- Should the eu-west consumers run before failover?
- Write the failover and fail-back steps.
`,
  answerTemplate: `## Target design

## Stranded messages

## Exactly once in SAP

## The passive region before failover

## Failover steps

## Fail-back steps
`,
  keyPoints: [
    'Anypoint MQ is regional. Each region has its own queue, and nothing copies messages between them by default.',
    'Messages in the failed region are stranded, not lost. Plan a drain job that moves them to the active region once the failed region is back.',
    'Stranded orders arrive late and after newer orders, so the design must accept delay and must not depend on strict order.',
    'An idempotency store in the failed region is no use after failover. Keep the keys in a store that both regions can reach and that is replicated.',
    'The idempotency key is the order ID from the client, so a retry by the client and a drained message both match it.',
    'Keep the eu-west Experience API taking no traffic before failover, but its Process API may run against its own empty queue.',
    'The ERP is the last line of defence: send an external reference so SAP can reject a duplicate.',
    'RTO is met by moving traffic. The stranded messages are a separate, slower recovery that the business accepts.',
    'Anypoint MQ also offers cross-region failover for some queue types. Check its current limits before relying on it, and keep the idempotency design either way.',
  ],
  solution: `
**Target design**
\`\`\`
Clients ─► Global load balancer ─► Ingress eu-central ─► exp-orders ~► orders-submitted (eu-central) ~► prc ─► sys ─► SAP
                                └► Ingress eu-west    ─► exp-orders ~► orders-submitted (eu-west)    ~► prc ─► sys ─► SAP
Each queue ~► its own DLQ
Both prc ─► idempotency keys (replicated database)
orders-submitted (eu-central) ~► drain job ~► orders-submitted (eu-west)
\`\`\`

**Stranded messages.** When eu-central fails, perhaps a few hundred accepted orders sit in its queue. They are not lost, because Anypoint MQ stores messages durably, but nobody can read them. After the region returns, a drain job reads them and publishes them to the eu-west queue, which is active by then. The business accepts a delay of a few hours for these orders.

**Exactly once in SAP.**
1. Each order carries the client's order ID, used as the idempotency key.
2. Before creating the sales order, the Process API checks the key in a database that is replicated to both regions. A key in Object Store v2 in eu-central would be unreachable during the outage, and a key in a regional store would not stop a drained message being processed again in eu-west.
3. The System API sends the order ID as the external reference, so SAP can reject a duplicate if a key was written but the response was lost.

**The passive region.** The eu-west Experience API gets no traffic. Its Process API can run: its queue is empty, so it does nothing, and it is warm when traffic arrives. Do not point eu-west consumers at the eu-central queue during normal running, or the two regions compete for the same work.

**Failover**
1. Health checks or an operator mark eu-central as down.
2. The global load balancer sends all traffic to the eu-west ingress.
3. Check that \`exp-orders\` in eu-west accepts orders and that queue depth in eu-west rises and falls.
4. Tell the business how many orders were in the eu-central queue at the last reading, from monitoring.

**Fail-back**
1. When eu-central returns, stop its Process API first, so it does not race with the drain.
2. Run the drain job from eu-central to eu-west, and watch the idempotency hits.
3. Move traffic back to eu-central at a quiet hour, let the eu-west queue empty, and only then return to normal.
4. Check the dead-letter queues in both regions.

**Testing.** Run a failover in a test environment with real volumes, measure the time to accept orders again, and count orders in, orders in SAP and duplicates rejected.
`,
  followUps: [
    {
      q: 'Why not make both regions active and split the traffic?',
      a: 'It is possible with the shared idempotency store, but every failure then strands messages in a region that was taking half the load. Active-passive keeps the stranded set small and the steps simpler.',
    },
    {
      q: 'Could the Experience API write to both regional queues on every order?',
      a: 'It would double every message and need the idempotency store on every read. It also fails if the other region is down, so the API would need its own fallback logic.',
    },
    {
      q: 'Where must the replicated idempotency database live?',
      a: 'Outside both private spaces, with a replica in each region or a managed multi-region database. Its own failover must be faster than the RTO.',
    },
    {
      q: 'What is the real RPO for accepted orders?',
      a: 'Zero orders are lost, but the stranded ones are delayed until the failed region returns. Write that down as an accepted risk with the business.',
    },
  ],
}
