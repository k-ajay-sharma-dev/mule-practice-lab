import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const clients = [
  { client_id: 'northgate-energy', callback_path: '/hooks/northgate/exports' },
  { client_id: 'brightwater-homes', callback_path: '/hooks/brightwater/statement-ready' },
]
const tables = { client_callbacks: { key: 'client_id', rows: clients }, exports: { key: 'export_id', columns: ['export_id', 'client_id', 'status', 'callback_status', 'download_url'], rows: [] } }
const ask = (client, body = { from: '2026-10-01', to: '2026-10-31' }) => ({ http: { method: 'POST', path: '/exports', body, authentication: { principal: client } } })
const reporting = { method: 'POST', path: '/reporting/v1/exports', latencyMs: 4000, respond: { status: 200, body: { downloadUrl: 'https://files.example.com/exp/7781.csv' } } }
const hook = (path, respond = { status: 204 }) => ({ method: 'POST', path, respond })
const systems = (callback) => ({ db: { tables }, http: [reporting, callback ?? hook('/hooks/northgate/exports'), hook('/hooks/brightwater/statement-ready'), hook('/internal/admin/purge')] })

export default {
  id: 'fl-150',
  category: 'flows',
  title: 'Export Ready Callbacks: Answer 202 at Once, Call Back Only the Address the Client Registered, Retry a Little, Then Record the Failure',
  level: 'EXPERT',
  tags: ['async', 'callback', 'webhook', 'ssrf', 'vm-queue', 'until-successful', 'security'],
  estMinutes: 55,
  flowChecks: [
    { label: 'Clients ask for an export with a POST on /exports', rule: { type: 'source', component: 'http-listener', where: { path: '/exports', allowedMethods: 'POST' } } },
    {
      label: 'The callback address is read from client_callbacks for the calling client',
      rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['client_callbacks', ':clientId'] } } },
    },
    { label: 'A client with no registered callback gets 403', rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '403' } } },
    {
      label: 'The slow export runs in a second flow, handed over on a VM queue',
      rule: { type: 'linked', from: { component: 'vm-publish', key: 'queueName' }, to: { component: 'vm-listener', key: 'queueName' } },
    },
    {
      label: 'The callback is retried a few times, to the registered address only',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'http-request', within: 'until-successful', where: { path: '#[' } },
          { type: 'absent', component: 'http-request', where: { path: 'callbackUrl' } },
        ],
      },
    },
    {
      label: 'A callback that never gets through is recorded on the export',
      rule: { type: 'inside', component: 'db-update', within: 'on-error-continue', where: { sql: { all: ['exports', 'callback_status'] } } },
    },
  ],
  simulation: {
    systems: systems(),
    tests: [
      {
        name: 'An export for Northgate Energy',
        about: 'Northgate asks for October. It gets 202 at once, the export runs, and its registered address is called with the download link.',
        trigger: ask('northgate-energy'),
        expect: {
          status: 202,
          bodyHas: { status: 'PENDING' },
          maxMs: 1000,
          calls: [{ method: 'POST', path: '/reporting/v1/exports', count: 1 }, { method: 'POST', path: '/hooks/northgate/exports', count: 1, has: { status: 'READY', downloadUrl: 'https://files.example.com/exp/7781.csv' } }],
          db: { exports: { count: 1, has: [{ client_id: 'northgate-energy', status: 'READY', callback_status: 'SENT' }] } },
        },
      },
      {
        name: 'A callback address in the request',
        about: 'A request carries its own callbackUrl pointing at an internal admin path. It is ignored. Only the registered address is called.',
        trigger: ask('brightwater-homes', { from: '2026-10-01', to: '2026-10-31', callbackUrl: '/internal/admin/purge' }),
        expect: { status: 202, calls: [{ method: 'POST', path: '/internal/admin/purge', count: 0 }, { method: 'POST', path: '/hooks/brightwater/statement-ready', count: 1 }] },
      },
      {
        name: 'A client with no registered callback',
        about: 'A client that never registered an address asks for an export. It gets 403, and no export starts.',
        trigger: ask('lakeside-lettings'),
        expect: { status: 403, bodyHas: { message: 'No callback address is registered for this client' }, db: { exports: { count: 0 } }, calls: [{ method: 'POST', path: '/reporting/v1/exports', count: 0 }] },
      },
      {
        name: 'The client\'s endpoint is down',
        about: 'Northgate\'s endpoint answers 503 every time. Mule tries three times in all, then marks the callback FAILED. The export itself stays READY, and a WARN is logged.',
        trigger: ask('northgate-energy'),
        overrides: { systems: { http: [hook('/hooks/northgate/exports', { status: 503, body: {} })] } },
        expect: {
          status: 202,
          calls: [{ method: 'POST', path: '/hooks/northgate/exports', count: 3 }],
          db: { exports: { has: [{ client_id: 'northgate-energy', status: 'READY', callback_status: 'FAILED' }] } },
          logs: [{ level: 'WARN' }],
        },
      },
    ],
  },
  referenceFlow: design(
    flow('request-export', source('http-listener', { path: '/exports', allowedMethods: 'POST' }), [
      step('db-select', {
        database: 'PostgreSQL',
        sql: 'SELECT callback_path FROM client_callbacks WHERE client_id = :clientId',
        inputParameters: '#[{ clientId: authentication.principal }]',
        target: 'client',
      }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[isEmpty(vars.client)]' }, [
            step('set-variable', { variableName: 'httpStatus', value: '403' }),
            step('set-payload', { value: '#[output application/json --- { message: "No callback address is registered for this client" }]' }),
          ]),
        ],
        {
          otherwise: [
            step('set-variable', { variableName: 'exportId', value: '#[uuid()]' }),
            step('db-insert', {
              database: 'PostgreSQL',
              sql: "INSERT INTO exports (export_id, client_id, status, callback_status) VALUES (:exportId, :clientId, 'PENDING', 'WAITING')",
              inputParameters: '#[{ exportId: vars.exportId, clientId: authentication.principal }]',
              target: 'saved',
            }),
            step('set-payload', { value: '#[output application/json --- { exportId: vars.exportId, clientId: authentication.principal, callbackPath: vars.client[0].callback_path, from: payload.from, to: payload.to }]' }),
            step('vm-publish', { queueName: 'export-jobs' }),
            step('set-variable', { variableName: 'httpStatus', value: '202' }),
            step('set-payload', { value: '#[output application/json --- { exportId: vars.exportId, status: "PENDING" }]' }),
          ],
        },
      ),
    ]),
    flow('run-export', source('vm-listener', { queueName: 'export-jobs' }), [
      step('set-variable', { variableName: 'job', value: '#[payload]' }),
      step('set-payload', { value: '#[output application/json --- { from: vars.job.from, to: vars.job.to }]' }),
      step('http-request', { method: 'POST', path: '/reporting/v1/exports', responseTimeout: 120000 }),
      step('set-variable', { variableName: 'downloadUrl', value: '#[payload.downloadUrl]' }),
      step('db-update', {
        database: 'PostgreSQL',
        sql: "UPDATE exports SET status = 'READY', download_url = :downloadUrl WHERE export_id = :exportId",
        inputParameters: '#[{ downloadUrl: vars.downloadUrl, exportId: vars.job.exportId }]',
        target: 'ready',
      }),
      step('set-payload', { value: '#[output application/json --- { exportId: vars.job.exportId, status: "READY", downloadUrl: vars.downloadUrl }]' }),
      scope('try', {}, [
        scope('until-successful', { maxRetries: 2, millisBetweenRetries: 30000 }, [step('http-request', { method: 'POST', path: '#[vars.job.callbackPath]', responseTimeout: 10000 })]),
        step('db-update', {
          database: 'PostgreSQL',
          sql: "UPDATE exports SET callback_status = 'SENT' WHERE export_id = :exportId",
          inputParameters: '#[{ exportId: vars.job.exportId }]',
          target: 'sent',
        }),
      ], {
        errorHandlers: [
          handler('on-error-continue', { type: 'MULE:RETRY_EXHAUSTED' }, [
            step('db-update', {
              database: 'PostgreSQL',
              sql: "UPDATE exports SET callback_status = 'FAILED' WHERE export_id = :exportId",
              inputParameters: '#[{ exportId: vars.job.exportId }]',
              target: 'failed',
            }),
            step('logger', { level: 'WARN', message: '#["Callback for export " ++ vars.job.exportId ++ " to " ++ vars.job.clientId ++ " failed after 3 tries"]' }),
          ]),
        ],
      }),
    ]),
  ),
  description: `
A water company lets housing partners download **usage exports** for their tenants. An export takes a few seconds to a few minutes in the reporting system:

\`POST /reporting/v1/exports\` with \`{ "from", "to" }\` answers \`{ "downloadUrl": "..." }\` when it is done.

Partners call \`POST /exports\` with \`{ "from", "to" }\`. A client ID policy in API Manager identifies the partner, and the flow reads its ID as \`authentication.principal\`.

When an export is ready, Mule must **call the partner back** with \`{ "exportId", "status": "READY", "downloadUrl" }\`. Each partner registers one callback address with the onboarding team. It is kept in the PostgreSQL table \`client_callbacks\` (\`client_id\`, \`callback_path\`). All callbacks go out through one HTTP Request configuration for the partners' hooks gateway.

A pen test of an earlier design found that partners could send a \`callbackUrl\` in the request, and Mule would call it. The tester pointed it at an internal admin path and Mule called it from inside the network.

**Requirements**
- Answer **202** with \`{ "exportId", "status": "PENDING" }\` within a second. Record the export in the table \`exports\` (\`export_id\`, \`client_id\`, \`status\`, \`callback_status\`, \`download_url\`).
- Call back **only** the address registered for the calling partner. Ignore any address in the request.
- A partner with no registered address gets **403** with \`{ "message": "No callback address is registered for this client" }\`, and no export starts.
- If the callback fails, try **3 times in all**. Then set \`callback_status\` to \`FAILED\`, log a WARN and leave the export \`READY\`, so support can tell the partner.
- On success, set \`callback_status\` to \`SENT\`.

**Design the flows.**
`,
  answerTemplate: `## Answering at once

## Where the callback address comes from

## Running the export

## When the callback fails
`,
  keyPoints: [
    'A slow job behind an API answers 202 with an ID at once, and hands the work to a second flow over a VM queue.',
    'Never call an address the caller supplies in the request. That is server side request forgery: Mule sits inside the network and can reach places the caller cannot.',
    'Register callback addresses up front, check them once, and look them up by the caller\'s verified identity, here authentication.principal from the client ID policy.',
    'Pass what the worker needs in the VM message, so it does not depend on the HTTP request that has already been answered.',
    'Retry the callback a few times with a pause, using Until Successful. Then stop, and record the failure where support can see it.',
    'The callback is a courtesy on top of the export. A failed callback must not mark a good export as failed.',
  ],
  solution: `
**Flow \`request-export\`**
1. **HTTP Listener** \`POST /exports\`.
2. **Database Select**, Target \`client\`: \`SELECT callback_path FROM client_callbacks WHERE client_id = :clientId\`, with \`clientId: authentication.principal\`.
3. **Choice**:
   - \`#[isEmpty(vars.client)]\`: \`httpStatus\` = \`403\` and the message.
   - Otherwise: \`exportId\` = \`#[uuid()]\`, **Database Insert** into \`exports\` as PENDING, **VM Publish** \`{ exportId, clientId, callbackPath, from, to }\` to \`export-jobs\`, then \`httpStatus\` = \`202\` and \`{ exportId, status: "PENDING" }\`.

**Flow \`run-export\`**
1. **VM Listener** on \`export-jobs\`. Keep the message in \`job\`.
2. **HTTP Request** \`POST /reporting/v1/exports\`, then **Database Update** the export to READY with the link.
3. **Try**:
   - **Until Successful**, 2 retries, 30 seconds apart: **HTTP Request** \`POST #[vars.job.callbackPath]\` with \`{ exportId, status: "READY", downloadUrl }\`.
   - **Database Update** \`callback_status = 'SENT'\`.
   - **On Error Continue** \`MULE:RETRY_EXHAUSTED\`: **Database Update** \`callback_status = 'FAILED'\` and a WARN.

**Making callbacks safer still.** Sign each callback with a secret per partner, so the partner knows it came from the water company. Keep the download link short lived. When the registered address is a full URL, check its host against an allow list when it is registered, not only when it is used.

**A persistent VM queue.** Make \`export-jobs\` persistent, so a restart does not lose a job that was accepted with 202.
`,
  followUps: [
    {
      q: 'Partners also want to ask "is my export ready?" without waiting for the callback. What do you add?',
      a: 'GET /exports/{exportId}, which reads the exports table and checks that the export belongs to the calling partner before it answers. Polling then works when a callback is lost.',
    },
    {
      q: 'Why not retry the callback for hours?',
      a: 'Until Successful holds the worker while it waits, and a partner that is down for hours would tie up workers for everyone. A few quick tries, then a record and a scheduled job that tries FAILED callbacks later, keeps the workers free.',
    },
  ],
}
