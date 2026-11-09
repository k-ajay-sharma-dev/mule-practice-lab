import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-096',
  category: 'flows',
  title: 'Weekly Traffic Report from the Anypoint Monitoring Metrics API Without Trusting Empty Data',
  level: 'INTERMEDIATE',
  tags: ['observability', 'platform-apis', 'anypoint-monitoring', 'connected-apps', 'api-management', 'scheduler', 'http'],
  estMinutes: 30,
  flowChecks: [
    {
      label: 'A cron Scheduler starts the report every Monday at 06:00',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'scheduler', where: { strategy: 'cron', expression: { oneOf: ['MON', '* 2'] } } },
          { type: 'source', component: 'scheduler', where: { expression: { oneOf: ['0 0 6 ', '0 0 06 '] } } },
        ],
      },
    },
    {
      label: 'The connected app gets a bearer token from the Access Management token endpoint',
      rule: { type: 'exists', component: 'http-request', where: { method: 'POST', path: 'oauth2/token' } },
    },
    {
      label: 'The token is kept in a variable, because the next HTTP call replaces the payload',
      rule: { type: 'before', first: 'set-variable', firstWhere: { value: 'access_token' }, then: 'foreach' },
    },
    { label: 'Each environment is queried on its own, inside a For Each', rule: { type: 'inside', component: 'http-request', within: 'foreach' } },
    {
      label: 'Empty data fails validation inside the Try, so it is never recorded as zero traffic',
      rule: { type: 'inside', component: 'validation', within: 'try', where: { check: 'is-not-empty-collection' } },
    },
    {
      label: 'An environment with empty data is caught and recorded as a failure, and the other environments still run',
      rule: { type: 'handler', component: 'on-error-continue', errorType: 'VALIDATION:EMPTY_COLLECTION', within: 'try' },
    },
    {
      label: 'The Try sits inside the For Each, so one bad environment does not end the loop',
      rule: { type: 'inside', component: 'try', within: 'foreach' },
    },
    {
      label: 'The handler adds the environment to the report as a problem',
      rule: { type: 'inside', component: ['set-variable', 'transform'], within: 'on-error-continue', withinWhere: { type: 'EMPTY_COLLECTION' } },
    },
    {
      label: 'The finished report is sent by email after the loop',
      rule: { type: 'before', first: 'foreach', then: 'email-send', outside: true },
    },
  ],
  referenceFlow: design(
    flow(
      'weekly-traffic-report',
      source('scheduler', { strategy: 'cron', expression: '0 0 6 ? * MON', timeZone: 'UTC' }),
      [
        step('set-variable', { variableName: 'environments', value: '#[p("report.environments") splitBy ","]' }),
        step('set-variable', { variableName: 'rows', value: '#[[]]' }),
        // Client credentials of the connected app, from secure properties.
        step('http-request', { method: 'POST', path: '/accounts/api/v2/oauth2/token' }),
        step('set-variable', { variableName: 'token', value: '#[payload.access_token]' }),
        scope('foreach', { collection: '#[vars.environments]' }, [
          // Keep the environment ID: the HTTP Request below replaces the payload.
          step('set-variable', { variableName: 'envId', value: '#[payload]' }),
          scope(
            'try',
            {},
            [
              // Take the exact path and body from the Metrics API page in Exchange.
              step('http-request', { method: 'POST', path: '/metrics-api-query-path-from-exchange' }),
              // The FAQ: 200 OK with "data": [] when the connected app lacks environment scopes.
              step('validation', {
                check: 'is-not-empty-collection',
                expression: '#[payload.data]',
                message: '#["No metric data for environment " ++ vars.envId]',
              }),
              step('set-variable', {
                variableName: 'rows',
                value: '#[vars.rows ++ [{ environment: vars.envId, status: "OK", data: payload.data }]]',
              }),
            ],
            {
              errorHandlers: [
                handler('on-error-continue', { type: 'VALIDATION:EMPTY_COLLECTION' }, [
                  step('logger', { level: 'ERROR', message: '#["Empty metrics for " ++ vars.envId ++ ": check connected app scopes"]' }),
                  step('set-variable', {
                    variableName: 'rows',
                    value: '#[vars.rows ++ [{ environment: vars.envId, status: "NO_DATA_CHECK_SCOPES" }]]',
                  }),
                ]),
              ],
            },
          ),
        ]),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ generatedAt: now(), environments: vars.rows }',
        }),
        step('email-send', { toAddresses: 'capacity@example.com', subject: 'Weekly traffic report' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Report failed: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A platform team wants a **weekly traffic report** for four environments, emailed every Monday at 06:00 UTC. A Mule app will call the **Anypoint Monitoring Metrics API**.

**Requirements**
- Authenticate with a **connected app** (client credentials). No personal accounts.
- Application metrics are scoped to one environment, so query each environment on its own. Environment IDs are in the property \`report.environments\`, as a comma-separated list.
- Use the \`mulesoft.app.inbound\` metric for traffic.
- A previous report showed zero traffic for a busy environment, because the API returned **200 OK with \`"data": []\`** when the connected app lacked scopes for it (see inc-100). This must never happen again: an environment with no data must appear in the report as a problem, and not as zero.
- One bad environment must not stop the report for the others.

**Design the flow.** Say where each value is kept, given that every HTTP call replaces the payload.
`,
  answerTemplate: `## Trigger and token

## Loop over environments

## Handling empty data

## Building and sending the report

## Failure of the whole run
`,
  keyPoints: [
    'A connected app with client credentials gets its bearer token with a POST to /accounts/api/v2/oauth2/token.',
    'Save access_token in a variable straight after that call, because the next HTTP Request replaces the payload.',
    'Application metrics are scoped to one environment, so loop and query each one. The Metrics API cannot aggregate across environments for you.',
    'Inside For Each, save the current item in a variable before the HTTP Request replaces the payload.',
    'Validate that payload.data is not empty. The API gives no permission error when scopes are missing, so the client must check.',
    'A Try inside the loop with On Error Continue records the failure and lets the next environment run.',
    'The connected app needs API Configuration Viewer and Read Applications for each business group and environment.',
  ],
  solution: `
1. **Scheduler** with a cron expression for Monday 06:00 UTC.
2. **Set Variable** \`environments\` from the property, and \`rows\` as an empty array.
3. **HTTP Request** \`POST /accounts/api/v2/oauth2/token\` with the connected app's client ID and secret from secure properties. The Access Management page shows this call. **Set Variable** \`token\` from \`payload.access_token\`.
4. **For Each** over \`vars.environments\`:
   - **Set Variable** \`envId\` from \`payload\`, because the next step replaces the payload.
   - **Try** containing: **HTTP Request** to the Metrics API with \`Authorization: Bearer\` and \`vars.token\`, asking for \`mulesoft.app.inbound\`; **Validate** \`is-not-empty-collection\` on \`payload.data\`; **Set Variable** that adds a row with status \`OK\`.
   - **On Error Continue** for \`VALIDATION:EMPTY_COLLECTION\`: log an error and add a row with status \`NO_DATA_CHECK_SCOPES\`.
5. After the loop, **Transform** builds the report from \`vars.rows\`, and **Email Send** delivers it.
6. Flow-level **On Error Propagate** logs failures of the whole run, such as a failed token call.

This Try catches only empty data. An HTTP error from the Metrics API for one environment would still end the run. So add another On Error Continue for the HTTP error types you expect if those must not stop the others.

The exact method, path and request body of the Metrics API are on its page in Exchange. They are not in the docs pages this problem is based on, so the reference flow uses a placeholder path.

**Why variables?** The token, the environment ID and the rows must survive HTTP calls. \`payload\` and \`attributes\` do not.
`,
  followUps: [
    {
      q: 'Why is the Try inside the For Each and not around it?',
      a: 'An error that leaves the loop ends it. With the Try inside, On Error Continue completes that iteration and the next environment runs.',
    },
    {
      q: 'Should a quiet sandbox fail this check?',
      a: 'It may have no traffic at all, so you could keep an "expected active" list, and apply the check only to those environments. The report should still show "no data" as different from zero.',
    },
    {
      q: 'Why not one connected app per environment?',
      a: 'One app with scopes for several environments is simpler, but adding the scopes must be part of the checklist for creating an environment. Separate apps give tighter isolation, and more secrets to rotate.',
    },
  ],
}
