import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-097',
  category: 'flows',
  title: 'Resumable Sync Against a Layered SLA: Checkpoints and X-RateLimit-Reset When the Daily Quota Runs Out',
  level: 'ADVANCED',
  tags: ['api-manager', 'api-management', 'sla-tiers', 'rate-limiting', 'object-store', 'scheduler', 'http', 'error-handling'],
  estMinutes: 35,
  flowChecks: [
    { label: 'A Scheduler starts the sync', rule: { type: 'source', component: 'scheduler' } },
    { label: 'The checkpoint is read from the Object Store before rows are selected', rule: { type: 'before', first: 'os-retrieve', then: 'db-select' } },
    {
      label: 'The stored wait time is read before the Choice, and the checkpoint is read too',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'os-retrieve', then: 'choice' },
          { type: 'exists', component: 'os-retrieve', min: 2 },
        ],
      },
    },
    { label: 'Rows are selected in id order', rule: { type: 'exists', component: 'db-select', where: { sql: 'order by' } } },
    {
      label: 'A Choice skips the run while the wait time has not passed, so no row is read or sent then',
      rule: {
        type: 'all',
        rules: [
          { type: 'routes', component: 'choice', min: 1 },
          { type: 'inside', component: 'db-select', within: 'choice' },
        ],
      },
    },
    { label: 'Each row is sent inside a For Each', rule: { type: 'inside', component: 'http-request', within: 'foreach' } },
    {
      label: 'The checkpoint is updated inside the loop, after each successful call',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'os-store', within: 'foreach' },
          { type: 'before', first: 'http-request', then: 'os-store', outside: true },
        ],
      },
    },
    {
      label: 'A 429 is handled in a Try around the loop, so the run ends cleanly',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: 'on-error-continue', errorType: 'HTTP:TOO_MANY_REQUESTS', within: 'try' },
          { type: 'inside', component: 'foreach', within: 'try' },
        ],
      },
    },
    {
      label: 'A 429 is not caught per row, so the loop stops at once',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'http-request', within: 'foreach' },
          { type: 'absent', component: 'on-error-continue', within: 'foreach', where: { type: { oneOf: ['TOO_MANY_REQUESTS', 'ANY'] } } },
        ],
      },
    },
    {
      label: 'The handler reads X-RateLimit-Reset from the error message, with a default when it is missing',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'set-variable', within: 'on-error-continue', where: { value: 'x-ratelimit-reset' } },
          { type: 'inside', component: 'set-variable', within: 'on-error-continue', where: { value: 'default' } },
        ],
      },
    },
    {
      label: 'The handler stores the time to wait in the Object Store, so it survives a restart',
      rule: { type: 'inside', component: 'os-store', within: 'on-error-continue' },
    },
  ],
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'fleet-telemetry-sync',
      why: 'This handler only logs the error and passes it on, which Mule does by default. The checkpoint keeps the progress, so the next run carries on.',
    },
  ],
  referenceFlow: design(
    flow(
      'fleet-telemetry-sync',
      source('scheduler', { strategy: 'fixed-frequency', frequency: 15, timeUnit: 'MINUTES' }),
      [
        // Object Store: Retrieve puts the value in the payload, so copy each value to a variable at once.
        step('os-retrieve', { key: 'fleet-sync-not-before', defaultValue: '#["1970-01-01T00:00:00Z"]', objectStore: 'fleetSyncStore' }),
        step('set-variable', { variableName: 'notBefore', value: '#[payload as DateTime]' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[now() >= vars.notBefore]' }, [
              step('os-retrieve', { key: 'fleet-sync-last-id', defaultValue: '#[0]', objectStore: 'fleetSyncStore' }),
              step('set-variable', { variableName: 'lastId', value: '#[payload]' }),
              step('db-select', {
                // Quoted aliases keep the keys lower case: Oracle reports unquoted column names in upper case.
                sql: 'SELECT id AS "id", vehicle_id AS "vehicle_id", reading AS "reading" FROM telemetry_outbox WHERE id > :lastId ORDER BY id FETCH FIRST 20000 ROWS ONLY',
              }),
              scope(
                'try',
                {},
                [
                  scope('foreach', { collection: '#[payload]' }, [
                    // The HTTP Request replaces the payload, so keep the row ID.
                    step('set-variable', { variableName: 'rowId', value: '#[payload.id]' }),
                    // A Database row is a Java object, so write it as JSON for the HTTP body.
                    step('transform', { script: '%dw 2.0\noutput application/json\n---\npayload' }),
                    step('http-request', { method: 'POST', path: '/fleet/v1/readings' }),
                    step('os-store', { key: 'fleet-sync-last-id', value: '#[vars.rowId]', objectStore: 'fleetSyncStore' }),
                  ]),
                ],
                {
                  errorHandlers: [
                    handler('on-error-continue', { type: 'HTTP:TOO_MANY_REQUESTS' }, [
                      // The header is in milliseconds and needs Expose Headers on the policy; fall back to 15 minutes.
                      step('set-variable', {
                        variableName: 'waitMs',
                        value: '#[(error.errorMessage.attributes.headers["x-ratelimit-reset"] default 900000) as Number]',
                      }),
                      step('os-store', {
                        key: 'fleet-sync-not-before',
                        value: '#[(now() + (("PT" ++ (ceil(vars.waitMs / 1000) as String) ++ "S") as Period)) as String]',
                        objectStore: 'fleetSyncStore',
                      }),
                      step('logger', { level: 'WARN', message: '#["Quota used after row " ++ (vars.rowId as String) ++ ", waiting " ++ (vars.waitMs as String) ++ " ms"]' }),
                    ]),
                  ],
                },
              ),
            ]),
          ],
          { otherwise: [step('logger', { level: 'DEBUG', message: '#["Waiting for the SLA window until " ++ (vars.notBefore as String)]' })] },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Sync failed: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A logistics company sends vehicle telemetry from an Oracle outbox table to a partner's **Fleet API**, which is on Anypoint Platform. The company has a contract on the **Gold** tier, enforced by Rate Limiting SLA with two limits: **100 requests per second** and **10,000 requests per day**. The partner has turned on **Expose Headers**.

Normal volume is about 8,000 rows a day. After a two-day outage, a backlog of **40,000 rows** is waiting.

The first version of the job looped over all rows and failed at row 10,001 with a 429. It then retried every 15 minutes from the start of the table, which sent duplicates and used up the next day's quota within minutes.

**Requirements**
- Send rows in \`id\` order, one call per row.
- Never send a row twice after a normal stop. Save progress after each success.
- When the API returns **429**, stop the run cleanly and do not fail the job.
- Do not call the API again until the window has reset. Use **X-RateLimit-Reset**, and use a safe default if the header is missing.
- Progress must survive a restart.

**Design the flow.**
`,
  answerTemplate: `## Trigger and wait check

## Reading progress

## Sending rows

## Handling 429

## What survives a restart
`,
  keyPoints: [
    'With several limits in one tier, each limit has its own algorithm, and all must have quota for a request to pass.',
    'When a quota is used, Rate Limiting SLA returns 429, and requests stay blocked until the current window finishes.',
    'X-RateLimit-Reset is the remaining time in milliseconds until a new window starts. The headers are off by default, so Expose Headers must be on, and the client still needs a fallback.',
    'HTTP Request raises HTTP:TOO_MANY_REQUESTS for 429. The response headers are in error.errorMessage.attributes.',
    'Keep the row ID in a variable before the HTTP Request, because that call replaces the payload.',
    'Save the checkpoint after each successful call. A crash between the call and the store can still repeat one row, so the receiver should be idempotent.',
    'A persistent Object Store holds the checkpoint and the wait time, so a redeploy does not restart the backlog.',
  ],
  solution: `
1. **Scheduler** every 15 minutes.
2. **Object Store: Retrieve** \`fleet-sync-not-before\`, default in the past. **Set Variable** \`notBefore\`.
3. **Choice**: run only if \`now() >= vars.notBefore\`. Otherwise log at DEBUG and finish, with no API call.
4. **Object Store: Retrieve** \`fleet-sync-last-id\`, default 0. **Set Variable** \`lastId\`. Each retrieve replaces the payload, so the value is copied at once.
5. **Database Select** of rows with \`id > :lastId\`, ordered by \`id\`, with an upper bound on rows. Quoted column aliases keep the keys lower case, because Oracle reports unquoted names in upper case and \`payload.id\` would then be null.
6. **Try** around **For Each**:
   - **Set Variable** \`rowId\` from \`payload.id\`.
   - **Transform** the row to JSON for the request body.
   - **HTTP Request** \`POST /fleet/v1/readings\` with the client ID and secret.
   - **Object Store: Store** \`fleet-sync-last-id\` = \`vars.rowId\`, which is only reached if the call succeeded.
7. **On Error Continue** for \`HTTP:TOO_MANY_REQUESTS\` on the Try:
   - **Set Variable** \`waitMs\` from \`error.errorMessage.attributes.headers["x-ratelimit-reset"]\`, default 900000.
   - **Object Store: Store** \`fleet-sync-not-before\` as now plus the wait.
   - **Logger** at WARN.

The error ends the For Each, and the handler completes the run as a success. The next run that passes the Choice carries on after the last stored ID.

**The 100 per second limit.** A sequential For Each is unlikely to reach it, but if it does, the same handler applies: the reset is short, and the job simply continues at its next run.

**If several limits are in play,** the docs say the headers report spare capacity for only the most restrictive policy when several SLA-based policies apply. They do not say which limit of a single tier the headers describe. So test this against the real API, and keep the default wait.

**Why not Until Successful?** It would hold the flow and repeat the call during a window that may last for hours. It would also use the retries without any benefit.
`,
  followUps: [
    {
      q: 'Why save the checkpoint after every row and not at the end?',
      a: 'The loop can stop at any row. Saving only at the end would resend everything after a 429, which is the bug in the first version. It costs one store per row, and for much larger volumes you could save every N rows and rely on an idempotent receiver.',
    },
    {
      q: 'What if the job runs on two replicas?',
      a: 'Both could read the same checkpoint and send the same rows. Make sure that only one instance runs the Scheduler, as your deployment target allows, or use a lock.',
    },
    {
      q: 'Could the partner give more quota for the backlog?',
      a: 'The tier could be changed or a different tier approved, and edits take effect immediately. That is a commercial decision for the API owner. The client must still handle 429.',
    },
    {
      q: 'Why is the default wait 15 minutes and not 24 hours?',
      a: 'If the header is missing, you do not know which limit was reached. A short wait costs one rejected call per run, while a long wait could stall the sync after a short limit.',
    },
  ],
}
