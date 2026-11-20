import { design, flow, handler, source, step } from '../../flow/dsl.js'

const file = '/outbound/orders/DLR_ORDERS_20261113_0915.csv'
const csv = 'order_ref,dealer_id,sku,qty\nD-77310,DLR-041,FRAME-AL-54,2\nD-77310,DLR-041,WHEEL-700C,4'
const api = (respond) => [{ method: 'POST', path: '/orders/v1/dealer-orders', respond }]

export default {
  id: 'fl-188',
  category: 'flows',
  title: 'Dealer Orders From a Distributor\'s SFTP Server: Post Each File, Archive It When Accepted, and Park It in an Error Folder When Refused',
  level: 'BEGINNER',
  tags: ['myproject', 'sftp', 'sftp-listener', 'archive', 'error-folder', 'http', 'manufacturing'],
  estMinutes: 15,
  flowChecks: [
    { label: 'Order files are picked up from /outbound/orders on the SFTP server', rule: { type: 'source', component: 'sftp-listener', where: { directory: '/outbound/orders', matcher: '.csv' } } },
    { label: 'The orders are posted to the order API', rule: { type: 'exists', component: 'http-request', where: { method: 'POST', path: '/orders/v1/dealer-orders' } } },
    { label: 'An accepted file is moved to /archive/orders after the post', rule: { type: 'before', first: 'http-request', then: 'sftp-move', thenWhere: { targetPath: '/archive/orders' }, outside: true } },
    { label: 'A refused file (HTTP:BAD_REQUEST) is moved to /error/orders', rule: { type: 'inside', component: 'sftp-move', within: 'on-error-continue', where: { targetPath: '/error/orders' } } },
  ],
  simulation: {
    systems: { files: { [file]: csv }, http: api({ status: 201, body: { orderRef: 'D-77310', status: 'RECEIVED' } }) },
    tests: [
      {
        name: 'The order is accepted',
        about: 'The two lines are posted once, and the file moves to the archive.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          calls: [{ method: 'POST', path: '/orders/v1/dealer-orders', count: 1, has: { orderRef: 'D-77310' } }],
          files: { '/archive/orders/DLR_ORDERS_20261113_0915.csv': { exists: true }, [file]: { exists: false } },
        },
      },
      {
        name: 'The order is refused',
        about: 'The order API answers 400: an unknown dealer. Sending it again will not help, so the file goes to the error folder.',
        trigger: { file: { path: file } },
        overrides: { systems: { http: api({ status: 400, body: { message: 'Unknown dealer DLR-041' } }) } },
        expect: { noError: true, files: { '/error/orders/DLR_ORDERS_20261113_0915.csv': { exists: true }, '/archive/orders/*': { count: 0 } } },
      },
      {
        name: 'The order API is down',
        about: 'The post cannot connect. The file stays in /outbound/orders, so a later poll sends it again.',
        trigger: { file: { path: file } },
        overrides: { systems: { http: api({ fault: 'CONNECTIVITY' }) } },
        expect: { error: 'HTTP:CONNECTIVITY', files: { [file]: { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'dealer-orders-from-sftp',
      source('sftp-listener', { directory: '/outbound/orders', matcher: '*.csv', postAction: 'none', timeBetweenSizeCheck: 5000 }),
      [
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ orderRef: payload[0].order_ref, dealerId: payload[0].dealer_id, lines: payload map ((l) -> { sku: l.sku, qty: l.qty as Number }) }',
        }),
        step('http-request', { method: 'POST', path: '/orders/v1/dealer-orders', responseTimeout: 30000 }),
        step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/archive/orders' }),
      ],
      [
        handler('on-error-continue', { type: 'HTTP:BAD_REQUEST' }, [
          step('logger', { level: 'ERROR', message: '#["Order file refused: " ++ vars.filePath ++ ": " ++ error.description]' }),
          step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/error/orders' }),
        ]),
      ],
    ),
  ),
  description: `
Holloway Bikes, a fictional bicycle maker, takes orders from its dealers through a distributor. The distributor puts one CSV per order on its own **SFTP server**, in \`/outbound/orders\`:

\`\`\`
order_ref,dealer_id,sku,qty
D-77310,DLR-041,FRAME-AL-54,2
\`\`\`

Holloway may read and move files there. The folders \`/archive/orders\` and \`/error/orders\` exist on the same server.

Mule posts each order to Holloway's order API, \`POST /orders/v1/dealer-orders\`, as JSON with \`orderRef\`, \`dealerId\` and \`lines\`.

**Requirements**
- Pick up each new CSV in \`/outbound/orders\`, once the upload has finished.
- Post it as one order.
- If the API accepts it, move the file to \`/archive/orders\`.
- If the API refuses it with 400, move it to \`/error/orders\` for the sales team.
- If the API cannot be reached, leave the file where it is so it is tried again.

**Facts**
- Each file holds one order. \`orderRef\` and \`dealerId\` come from the first row. \`lines\` is a list of \`{ sku, qty }\`, with \`qty\` as a number.
- A 400 raises \`HTTP:BAD_REQUEST\`. Catch only that, with On Error Continue, so the file is parked and the run ends cleanly.
- Do not catch \`HTTP:CONNECTIVITY\`. The run fails and the file stays in \`/outbound/orders\`.
- Keep the file path in a variable before the HTTP Request, which replaces the attributes.

**Design the flow.**
`,
  answerTemplate: `## Picking up files

## Posting the order

## Accepted and refused files

## When the API is down
`,
  keyPoints: [
    'The SFTP listener polls the folder and starts the flow for each matching file. A size check wait stops it reading a file still being uploaded.',
    'Moving the file is how the flow says "done". A file left in the folder is picked up again on a later poll.',
    'Treat a refusal and an outage differently. A 400 will fail every time, so park the file. A connection failure may pass, so leave it.',
    'Keep the file path in a variable at the start. The HTTP Request replaces the attributes.',
    'The archive and error folders are on the same server, so a move is a quick rename there, not a download and upload.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/outbound/orders\`, \`*.csv\`, size check wait 5 seconds, no post action.
2. **Set Variable** \`filePath\`.
3. **Transform** the rows to the order JSON.
4. **HTTP Request** POST \`/orders/v1/dealer-orders\`.
5. **SFTP Move** to \`/archive/orders\`.
6. **On Error Continue** \`HTTP:BAD_REQUEST\`: ERROR log, **SFTP Move** to \`/error/orders\`.

Nothing else is caught, so an outage ends the flow with an error and the file stays.

**Order sent twice.** If Mule stops after the post and before the move, the file is posted again. Ask the order API to treat a repeated orderRef as already received.
`,
  followUps: [
    {
      q: 'Why not set the listener\'s post action to move?',
      a: 'It would move the file whatever the outcome, unless the setting for failures is changed. Moves in the flow follow the outcome, which is clearer to read.',
    },
    {
      q: 'The distributor\'s server is slow to list a folder of 50,000 archived files. What would you change?',
      a: 'Keep the archive outside the folder being polled, as here, and ask for old archives to be cleared. Listing cost grows with the number of entries in the polled folder.',
    },
  ],
}
