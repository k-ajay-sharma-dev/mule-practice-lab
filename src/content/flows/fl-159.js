import { design, flow, handler, source, step } from '../../flow/dsl.js'

const claim = (claimId, policyNo = 'HP-220871') => ({ message: { kind: 'jms', destination: 'CLAIMS.REGISTERED', payload: { claimId, policyNo, lossDate: '2026-11-10', type: 'ESCAPE_OF_WATER' } } })
const policyApi = { method: 'GET', path: '/policy/v1/policies/{policyNo}', respond: { status: 200, body: { policyNo: 'HP-220871', holder: 'R. Okafor', excess: 250, cover: 'BUILDINGS_AND_CONTENTS' } } }

export default {
  id: 'fl-159',
  category: 'flows',
  title: 'Claims Enrichment Stage: Consume, Enrich and Publish in One JMS Transaction So a Failure Never Leaves Half a Hand-off',
  level: 'ADVANCED',
  tags: ['myproject', 'queues', 'jms', 'transactions', 'pipeline', 'insurance'],
  estMinutes: 35,
  flowChecks: [
    {
      label: 'CLAIMS.REGISTERED is read in a transaction the listener begins',
      rule: { type: 'source', component: 'jms-listener', where: { destination: 'CLAIMS.REGISTERED', transactionalAction: 'ALWAYS_BEGIN', transactionType: 'LOCAL' } },
    },
    { label: 'The enriched claim is published to CLAIMS.ENRICHED', rule: { type: 'exists', component: 'jms-publish', where: { destination: 'CLAIMS.ENRICHED' } } },
    { label: 'The audit row is written after the publish, inside the same run', rule: { type: 'before', first: 'jms-publish', firstWhere: { destination: 'CLAIMS.ENRICHED' }, then: 'db-insert', outside: true } },
    {
      label: 'A claim for an unknown policy goes to CLAIMS.REVIEW and is committed',
      rule: { type: 'inside', component: 'jms-publish', within: 'on-error-continue', withinWhere: { type: 'NOT_FOUND' }, where: { destination: 'CLAIMS.REVIEW' } },
    },
    {
      label: 'No catch-all On Error Continue, which would commit a claim that failed for a passing reason',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'jms-publish', where: { destination: 'CLAIMS.ENRICHED' } },
          { type: 'absent', component: 'on-error-continue', where: { type: 'ANY' } },
        ],
      },
    },
  ],
  simulation: {
    systems: { http: [policyApi], db: { tables: { claim_stage_audit: { key: 'claim_id', rows: [] } } } },
    tests: [
      {
        name: 'A claim is enriched',
        about: 'The policy is found. The enriched claim goes to CLAIMS.ENRICHED, the audit row is written and the transaction commits.',
        trigger: claim('CL-310045'),
        expect: { ack: 'acked', sent: [{ destination: 'CLAIMS.ENRICHED', count: 1, has: { claimId: 'CL-310045', excess: 250 } }], db: { claim_stage_audit: { count: 1 } } },
      },
      {
        name: 'The audit insert fails after the publish',
        about: 'The publish has happened, then the audit table refuses the row. The transaction rolls back: the enriched claim is not sent, and CLAIMS.REGISTERED gets the claim back.',
        trigger: claim('CL-310046'),
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO claim_stage_audit', fault: 'CONNECTIVITY' }] } } },
        expect: { ack: 'returned', notSent: ['CLAIMS.ENRICHED'] },
      },
      {
        name: 'The policy service is down',
        about: 'The policy service answers 503. The claim goes back for redelivery and nothing is sent on.',
        trigger: claim('CL-310047'),
        overrides: { systems: { http: [{ ...policyApi, respond: { status: 503, body: {} } }] } },
        expect: { ack: 'returned', notSent: ['CLAIMS.ENRICHED', 'CLAIMS.REVIEW'] },
      },
      {
        name: 'An unknown policy number',
        about: 'The policy does not exist. A handler can do nothing about that, so the claim goes to CLAIMS.REVIEW for a person, and the transaction commits.',
        trigger: claim('CL-310048', 'HP-999999'),
        overrides: { systems: { http: [{ ...policyApi, respond: { status: 404, body: { message: 'No such policy' } } }] } },
        expect: { ack: 'acked', sent: [{ destination: 'CLAIMS.REVIEW', count: 1, has: { claimId: 'CL-310048' } }], notSent: ['CLAIMS.ENRICHED'] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'enrich-registered-claims',
      source('jms-listener', { destination: 'CLAIMS.REGISTERED', ackMode: 'IMMEDIATE', transactionalAction: 'ALWAYS_BEGIN', transactionType: 'LOCAL' }),
      [
        step('set-variable', { variableName: 'claim', value: '#[payload]' }),
        step('http-request', { method: 'GET', path: '#["/policy/v1/policies/" ++ vars.claim.policyNo]' }),
        step('set-payload', { value: '#[output application/json --- vars.claim ++ { holder: payload.holder, excess: payload.excess, cover: payload.cover }]' }),
        step('jms-publish', { destination: 'CLAIMS.ENRICHED', destinationType: 'QUEUE', persistentDelivery: 'true' }),
        step('db-insert', {
          database: 'Oracle',
          sql: "INSERT INTO claim_stage_audit (claim_id, stage) VALUES (:claimId, 'ENRICHED')",
          inputParameters: '#[{ claimId: vars.claim.claimId }]',
        }),
      ],
      [
        handler('on-error-continue', { type: 'HTTP:NOT_FOUND' }, [
          step('set-payload', { value: '#[output application/json --- vars.claim ++ { reviewReason: "Policy not found" }]' }),
          step('jms-publish', { destination: 'CLAIMS.REVIEW', destinationType: 'QUEUE', persistentDelivery: 'true' }),
        ]),
      ],
    ),
  ),
  description: `
Halberd Insurance, a fictional insurer, runs claims through a chain of ActiveMQ queues. Each stage reads one queue and writes the next. You build the **enrichment** stage:

- Read \`CLAIMS.REGISTERED\`: \`{ "claimId", "policyNo", "lossDate", "type" }\`.
- Get the policy with \`GET /policy/v1/policies/{policyNo}\` and add \`holder\`, \`excess\` and \`cover\` to the claim.
- Publish the enriched claim to \`CLAIMS.ENRICHED\`.
- Record the stage in the Oracle table \`claim_stage_audit\` (\`claim_id\`, \`stage\`).

The old version sometimes sent a claim on and then failed on the audit insert. The claim was redelivered and went through enrichment again, so the next stage got it twice.

**Requirements**
- The receive from \`CLAIMS.REGISTERED\` and the publish to \`CLAIMS.ENRICHED\` must succeed or fail together.
- A passing failure (the policy service down, the audit insert failing) sends nothing on and returns the claim to \`CLAIMS.REGISTERED\`.
- A claim whose policy does not exist (404) goes to \`CLAIMS.REVIEW\` and is removed from \`CLAIMS.REGISTERED\`.

**Facts**
- Only JMS has to be in the transaction, so a LOCAL transaction is enough. The listener starts it for every message.
- A 404 from the policy service raises **HTTP:NOT_FOUND**. A 503 raises **HTTP:SERVICE_UNAVAILABLE** and must fail the flow, like a failed audit insert.
- Write the audit row with \`stage\` \`ENRICHED\`.
- The message on \`CLAIMS.REVIEW\` is the claim with a \`reviewReason\` added.

**Design the flow.**
`,
  answerTemplate: `## The transaction

## What rolls back

## Unknown policies

## What the transaction does not cover
`,
  keyPoints: [
    'A JMS listener with Transactional action ALWAYS_BEGIN starts a transaction for each message. JMS operations on the same connection join it.',
    'The publish to CLAIMS.ENRICHED is held until commit. If anything later fails, rollback undoes the publish and returns the received claim.',
    'The transaction commits when the flow ends well, including through On Error Continue, and rolls back when the error propagates.',
    'So a catch-all On Error Continue would commit claims that failed for a passing reason, and they would be lost. Only the 404, which can never succeed, is continued.',
    'A LOCAL JMS transaction does not cover the database. Here the audit insert is the last step, so a failed insert rolls back the JMS work, and a successful one is followed by the commit. Making Oracle and JMS commit as one needs XA.',
    'Set a redelivery limit on the broker, so a claim that always fails stops coming back.',
  ],
  solution: `
1. **JMS On New Message** on \`CLAIMS.REGISTERED\`: Transactional action **ALWAYS_BEGIN**, type **LOCAL**.
2. **Set Variable** \`claim\` = \`#[payload]\`.
3. **HTTP Request** \`GET /policy/v1/policies/{policyNo}\`.
4. **Set Payload**: the claim plus \`holder\`, \`excess\` and \`cover\`.
5. **JMS Publish** to \`CLAIMS.ENRICHED\`, persistent.
6. **Database Insert** into \`claim_stage_audit\`.
7. Flow error handler **On Error Continue** \`HTTP:NOT_FOUND\`: add a review reason and **JMS Publish** to \`CLAIMS.REVIEW\`. Other errors propagate and roll back.

**The small gap.** The insert commits on its own before the JMS commit. If Mule stops between the two, the claim is redelivered with an audit row already there. Use a key on \`claim_id\` and treat a duplicate as done, or use XA if the extra cost is acceptable.
`,
  followUps: [
    {
      q: 'What does the broker do with a claim that keeps rolling back?',
      a: 'ActiveMQ redelivers it up to its redelivery limit, then moves it to its dead letter queue (ActiveMQ.DLQ unless configured per queue). Watch that queue.',
    },
    {
      q: 'Why not use On Error Propagate for the 404 too?',
      a: 'The claim would roll back and come back again and again, failing each time, until the redelivery limit. A missing policy will not fix itself, so it is better committed to a review queue at once.',
    },
  ],
}
