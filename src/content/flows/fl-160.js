import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

const submitted = { declaration_id: 'DEC-40071', shipment_ref: 'AF-55120', status: 'SUBMITTED', mrn: null }
const cleared = { declaration_id: 'DEC-40070', shipment_ref: 'AF-55119', status: 'CLEARED', mrn: '26GB0000A1B2C3D4E5' }
const reply = (correlationId, status = 'CLEARED') => ({
  message: { kind: 'mq', destination: 'customs-replies', payload: { correlationId, status, mrn: '26GB0000F6G7H8J9K0', decidedAt: '2026-11-13T10:20:00Z' } },
})

export default {
  id: 'fl-160',
  category: 'flows',
  title: 'Customs Declarations Over a Request Queue and a Reply Queue: Match Each Late Reply to Its Declaration by Correlation ID',
  level: 'ADVANCED',
  tags: ['myproject', 'queues', 'anypoint-mq', 'request-reply', 'correlation-id', 'database', 'logistics'],
  estMinutes: 40,
  flowChecks: [
    { label: 'Declarations come in on POST /declarations', rule: { type: 'source', component: 'http-listener', where: { path: '/declarations', allowedMethods: 'POST' } } },
    {
      label: 'The declaration is saved as SUBMITTED before the request is published',
      rule: { type: 'before', first: 'db-insert', firstWhere: { sql: 'SUBMITTED' }, then: 'mq-publish', thenWhere: { destination: 'customs-requests' } },
    },
    { label: 'Replies are read from customs-replies', rule: { type: 'source', component: 'mq-subscriber', where: { destination: 'customs-replies' } } },
    {
      label: 'A reply updates only a declaration still waiting, found by its correlation ID',
      rule: { type: 'exists', component: 'db-update', where: { sql: { all: ['declarations', ':correlationId', "'SUBMITTED'"] } } },
    },
    { label: 'A reply that matches no declaration is parked on customs-replies-unmatched', rule: { type: 'inside', component: 'mq-publish', within: 'choice', where: { destination: 'customs-replies-unmatched' } } },
  ],
  simulation: {
    systems: { db: { tables: { declarations: { key: 'declaration_id', rows: [submitted, cleared] } } } },
    tests: [
      {
        name: 'A declaration is sent',
        about: 'The broker gets the declaration with its correlation ID, it is saved as SUBMITTED, and the caller gets 202 at once.',
        trigger: { http: { method: 'POST', path: '/declarations', body: { shipmentRef: 'AF-55188', goods: [{ hsCode: '9403.60', value: 1840 }] } } },
        expect: {
          status: 202,
          bodyHas: { status: 'SUBMITTED' },
          sent: [{ destination: 'customs-requests', count: 1, has: { shipmentRef: 'AF-55188' } }],
          db: { declarations: { count: 3, has: [{ shipment_ref: 'AF-55188', status: 'SUBMITTED' }] } },
        },
      },
      {
        name: 'Customs clears a declaration',
        about: 'A CLEARED reply for DEC-40071 arrives an hour later. The declaration is updated with the status and the MRN.',
        trigger: reply('DEC-40071'),
        expect: { ack: 'acked', db: { declarations: { has: [{ declaration_id: 'DEC-40071', status: 'CLEARED', mrn: '26GB0000F6G7H8J9K0' }] } }, notSent: ['customs-replies-unmatched'] },
      },
      {
        name: 'The same reply twice',
        about: 'The broker sends the reply for DEC-40070 again. The declaration is already cleared, so nothing changes and nothing is parked.',
        trigger: reply('DEC-40070', 'HOLD'),
        expect: { ack: 'acked', db: { declarations: { has: [{ declaration_id: 'DEC-40070', status: 'CLEARED' }] } }, notSent: ['customs-replies-unmatched'] },
      },
      {
        name: 'A reply for a declaration nobody sent',
        about: 'A reply names DEC-99999, which does not exist. It is parked with a WARN for the customs team.',
        trigger: reply('DEC-99999'),
        expect: { ack: 'acked', sent: [{ destination: 'customs-replies-unmatched', count: 1, has: { correlationId: 'DEC-99999' } }], logs: [{ level: 'WARN' }] },
      },
    ],
  },
  referenceFlow: design(
    flow('submit-declaration', source('http-listener', { path: '/declarations', allowedMethods: 'POST' }), [
      step('set-variable', { variableName: 'declarationId', value: '#["DEC-" ++ uuid()]' }),
      step('db-insert', {
        database: 'PostgreSQL',
        sql: "INSERT INTO declarations (declaration_id, shipment_ref, status) VALUES (:declarationId, :shipmentRef, 'SUBMITTED')",
        inputParameters: '#[{ declarationId: vars.declarationId, shipmentRef: payload.shipmentRef }]',
        target: 'saved',
      }),
      step('set-payload', { value: '#[output application/json --- payload ++ { correlationId: vars.declarationId }]' }),
      step('mq-publish', { destination: 'customs-requests' }),
      step('set-variable', { variableName: 'httpStatus', value: '202' }),
      step('set-payload', { value: '#[output application/json --- { declarationId: vars.declarationId, status: "SUBMITTED" }]' }),
    ]),
    flow(
      'apply-customs-reply',
      source('mq-subscriber', { destination: 'customs-replies', acknowledgementMode: 'AUTO' }),
      [
        step('set-variable', { variableName: 'reply', value: '#[payload]' }),
        step('db-update', {
          database: 'PostgreSQL',
          sql: "UPDATE declarations SET status = :status, mrn = :mrn WHERE declaration_id = :correlationId AND status = 'SUBMITTED'",
          inputParameters: '#[{ status: vars.reply.status, mrn: vars.reply.mrn, correlationId: vars.reply.correlationId }]',
          target: 'updated',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.updated.affectedRows == 0]' }, [
              step('db-select', {
                database: 'PostgreSQL',
                sql: 'SELECT declaration_id FROM declarations WHERE declaration_id = :correlationId',
                inputParameters: '#[{ correlationId: vars.reply.correlationId }]',
                target: 'known',
              }),
              router(
                'choice',
                {},
                [
                  route({ expression: '#[isEmpty(vars.known)]' }, [
                    step('logger', { level: 'WARN', message: '#["Reply for unknown declaration " ++ vars.reply.correlationId ++ " parked"]' }),
                    step('mq-publish', { destination: 'customs-replies-unmatched' }),
                  ]),
                ],
                { otherwise: [step('logger', { level: 'INFO', message: '#["Repeat reply for " ++ vars.reply.correlationId ++ " ignored"]' })] },
              ),
            ]),
          ],
          { otherwise: [step('logger', { level: 'INFO', message: '#["Declaration " ++ vars.reply.correlationId ++ " is now " ++ vars.reply.status]' })] },
        ),
      ],
    ),
  ),
  description: `
Ashdown Freight, a fictional forwarder, files customs declarations through a customs broker. The broker works through Anypoint MQ:

- Ashdown puts each declaration on the queue \`customs-requests\`.
- The broker answers on the queue \`customs-replies\`, minutes or hours later: \`{ "correlationId", "status", "mrn", "decidedAt" }\`. \`status\` is \`CLEARED\`, \`HOLD\` or \`REJECTED\`. The broker copies the \`correlationId\` from the request.

Ashdown's apps call \`POST /declarations\` with \`{ "shipmentRef", "goods" }\`. Declarations are kept in the PostgreSQL table \`declarations\` (\`declaration_id\`, \`shipment_ref\`, \`status\`, \`mrn\`).

**Requirements**
- Give each declaration an ID, save it as \`SUBMITTED\`, publish it with that ID as \`correlationId\`, and answer **202** \`{ declarationId, status: "SUBMITTED" }\`. The caller must not wait for customs.
- Apply each reply to its declaration: status and MRN.
- The broker may send a reply twice. A declaration that has had its answer is not changed again, and a repeat is not an error.
- A reply whose \`correlationId\` matches no declaration goes to \`customs-replies-unmatched\` with a WARN.

**Facts**
- The message on \`customs-requests\` is the request body with \`correlationId\` added.
- Write the status \`'SUBMITTED'\` as a literal in the SQL, in the insert and in the reply's update. Name the update's ID parameter \`:correlationId\`.
- Park an unmatched reply as it arrived.

**What each system sends back**
- The \`customs-replies\` subscriber gives the reply as the payload:
\`\`\`json
{ "correlationId": "DEC-40071", "status": "CLEARED", "mrn": "26GB0000F6G7H8J9K0", "decidedAt": "2026-11-13T10:20:00Z" }
\`\`\`
- A Database Update answers \`{ "affectedRows": n }\`: 0 when no \`SUBMITTED\` declaration has that ID (already answered, or unknown).
- A Database Select answers a list of rows with the column names as written, for example \`[ { "declaration_id": "DEC-40070" } ]\`, or \`[]\` when the ID is unknown.

**How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`.

**Design the flows.**
`,
  answerTemplate: `## Sending the request

## Matching the reply

## Repeats and strangers
`,
  keyPoints: [
    'Synchronous request-reply holds a thread while customs decides. With a reply hours later, the request and the reply must be two flows joined by a correlation ID.',
    'Save the declaration before publishing. If the reply came back before the row existed, it would look like a stranger.',
    'The update names the state it expects (status = SUBMITTED). That one statement both applies the reply and ignores a repeat.',
    'affectedRows tells the two cases apart only together with a lookup: 0 rows for a known declaration is a repeat, 0 rows for an unknown one is a stranger.',
    'Unmatched replies are parked, not dropped. They usually mean a bug or a test message on the wrong queue, and someone must look.',
  ],
  solution: `
**Flow \`submit-declaration\`**
1. **HTTP Listener** \`POST /declarations\`.
2. \`declarationId\` = \`#["DEC-" ++ uuid()]\`.
3. **Database Insert** as \`SUBMITTED\`, with a Target so the payload stays.
4. **Set Payload** the request plus \`correlationId\`, **Anypoint MQ Publish** to \`customs-requests\`.
5. \`httpStatus\` = \`202\`, answer \`{ declarationId, status }\`.

**Flow \`apply-customs-reply\`**
1. **Anypoint MQ Subscriber** on \`customs-replies\`.
2. **Database Update**: \`... SET status = :status, mrn = :mrn WHERE declaration_id = :correlationId AND status = 'SUBMITTED'\`, Target \`updated\`.
3. **Choice** \`#[vars.updated.affectedRows == 0]\`: look the declaration up. Unknown: WARN and **Publish** to \`customs-replies-unmatched\`. Known: an INFO "repeat ignored".

**A reply that never comes.** Add a Scheduler that finds declarations still SUBMITTED after a few hours and alerts the customs team.
`,
  followUps: [
    {
      q: 'Why put the correlation ID in the body, not only in a message property?',
      a: 'Either works if the broker copies it back. The body survives every hop and every tool the broker uses. Agree it in the interface, and check both if unsure.',
    },
    {
      q: 'A HOLD is followed by a CLEARED a day later. Does this design allow that?',
      a: 'No, the update only changes SUBMITTED rows. Allow HOLD to move on as well: WHERE status IN (\'SUBMITTED\', \'HOLD\'), and keep CLEARED and REJECTED final.',
    },
  ],
}
