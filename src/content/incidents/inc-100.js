export default {
  id: 'inc-100',
  category: 'incidents',
  title: 'The Capacity Report Says the New Production Environment Has No Traffic: Metrics API 200 With Empty Data',
  level: 'INTERMEDIATE',
  tags: ['observability', 'anypoint-monitoring', 'platform-apis', 'connected-apps', 'api-management', 'environments'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '06:00:01 INFO  [capacity-report] Weekly run started', relevant: false },
      { text: '06:00:02 INFO  [capacity-report] Token obtained for connected app capacity-reporter', relevant: true, why: 'Authentication works, so this is not a wrong secret.' },
      { text: '06:00:04 INFO  [capacity-report] env=prod-us metric=mulesoft.app.inbound status=200 rows=2016', relevant: false },
      { text: '06:00:06 INFO  [capacity-report] env=prod-eu metric=mulesoft.app.inbound status=200 rows=0', relevant: true, why: 'A 200 with no rows. The FAQ describes this response when a connected app lacks environment-level scopes.' },
      { text: '06:00:06 INFO  [capacity-report] env=prod-eu recorded 0 messages for the week', relevant: true, why: 'The job treats empty data as a real zero, so nothing fails.' },
      { text: '06:00:09 INFO  [capacity-report] Report emailed to capacity@example.com', relevant: false },
      { text: 'Connected App capacity-reporter: scopes for business group Retail, environments prod-us, sandbox', relevant: true, why: 'prod-eu is missing. It was created after the connected app.' },
      { text: 'Anypoint Insights, prod-eu: 41.2M requests in the last 7 days', relevant: true, why: 'The data exists. A person with the right access can see it, which rules out a collection problem.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause of the empty results?',
        options: [
          'The connected app has no environment-level scopes for prod-eu, and the Metrics API then returns empty data and no permission error',
          'prod-eu really has no traffic',
          'The bearer token expired during the run',
          'The Metrics API supports one environment per organization',
        ],
        answer: 0,
        explain: 'The FAQ describes this: a 200 OK with "data": [] when the connected app lacks the required environment-level scopes. Anypoint Insights shows the traffic exists, and the token works for prod-us.',
      },
      {
        type: 'single',
        prompt: 'Which permissions does the FAQ say to grant, for each business group and environment you query?',
        options: [
          'API Configuration Viewer and Read Applications',
          'Organization Administrator',
          'Exchange Viewer and Exchange Contributor',
          'Manage Contracts and Manage Policies',
        ],
        answer: 0,
        explain: 'Grant only these two scopes for the target environment. A wide administrator role is not needed.',
      },
      {
        type: 'multi',
        prompt: 'Which changes prevent a silent repeat?',
        options: [
          'Treat an empty data array for a known active environment as an error, not as zero',
          'Add the scope step to the checklist for creating an environment',
          'Keep a list of expected environments, and alert if one returns no rows',
          'Compare the report with Anypoint Insights for one environment now and then',
          'Retry each query five times when it returns 200',
        ],
        answer: [0, 1, 2, 3],
        explain: 'The API gives no error, so the client must decide what empty means. A retry cannot help, because the response is the same every time.',
      },
      {
        type: 'order',
        prompt: 'Order the recovery.',
        items: [
          'Compare the report with Anypoint Insights to confirm that traffic exists',
          'Check the connected app\'s scopes for prod-eu',
          'Grant API Configuration Viewer and Read Applications for prod-eu',
          'Run the report again for the missed weeks',
          'Correct the capacity decision that used the wrong numbers',
        ],
        explain: 'Confirm, fix the access, rebuild the data, then correct what was decided from it.',
      },
    ],
  },
  description: `
## Symptoms
- The monthly capacity review shows **zero traffic** in \`prod-eu\` for the last three weeks.
- Based on this, a manager proposed moving vCores away from \`prod-eu\`.
- The EU operations team says that \`prod-eu\` handles about 40 million requests a week.

## Change / Context
- \`capacity-report\` is a Mule app that runs weekly. It gets a bearer token for the connected app \`capacity-reporter\` and calls the **Anypoint Monitoring Metrics API** for each environment.
- \`prod-eu\` was created four weeks ago, and was added to the report's environment list.
- Application metrics are scoped to one environment, so the report queries each one and adds the results.
- The job has never failed. There are no errors in its logs.

## Logs
\`\`\`
06:00:02 INFO  [capacity-report] Token obtained for connected app capacity-reporter
06:00:04 INFO  [capacity-report] env=prod-us metric=mulesoft.app.inbound status=200 rows=2016
06:00:06 INFO  [capacity-report] env=prod-eu metric=mulesoft.app.inbound status=200 rows=0
06:00:06 INFO  [capacity-report] env=prod-eu recorded 0 messages for the week
\`\`\`

## Your tasks
1. What is the root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'The Metrics API can return 200 OK with "data": [] when the connected app lacks environment-level scopes. It returns empty data and not a permission error.',
    'The required permissions are API Configuration Viewer and Read Applications, for each business group and environment.',
    'Connected app scopes are chosen for selected business groups and environments, so review the list whenever an environment is added.',
    'The token works, and other environments return rows, so credentials are not the issue.',
    'A client must treat empty data for an active environment as a failure.',
    'Metrics are retained for at least 30 days, so missed weeks can be rebuilt.',
  ],
  solution: `
**Diagnosis.** The call returns 200 and no rows for \`prod-eu\` only. The token is valid, and \`prod-us\` returns rows. Anypoint Insights shows 41 million requests, so the data exists. The Anypoint Monitoring FAQ describes this case: a query can return \`200 OK\` with \`"data": []\` when the connected app lacks the required environment-level scopes. Without them, the API returns empty data and not a permission error.

The connected app's scopes list \`prod-us\` and \`sandbox\`. When a connected app is set up, its scopes are chosen for selected business groups and environments, and \`prod-eu\` did not exist then.

**Immediate mitigation.**
- Stop the proposed vCore move.
- Grant **API Configuration Viewer** and **Read Applications** to the connected app for \`prod-eu\`.
- Run the report again for the missed weeks. Application metrics are retained for at least 30 days, on every tier that has them, so three weeks are still there.
- Send out a corrected report.

**Root cause.** A new environment was added to the job's list, but not to the connected app's scopes. The API's response did not look like an error, and the job treated "no rows" as "no traffic".

**Permanent fix.**
- In the job, validate that \`data\` is not empty for any environment on the expected list, and fail the run if it is. See fl-096 for the flow.
- Add the scope grant to the checklist for creating an environment.

**Prevention.** Any report that drives a decision needs a sanity check. Compare it with a second source, such as Anypoint Insights. Show "no data" in a report as different from zero.
`,
  followUps: [
    { q: 'Which metrics give application traffic?', a: 'The FAQ names mulesoft.app.inbound and mulesoft.app.outbound, with endpoint-level dimensions. It also warns that endpoint.type and endpoint.operation were removed as query attributes on mulesoft.api.summary.' },
    { q: 'Why not give the connected app administrator rights so this cannot happen?', a: 'A reporting job needs read access only. Wide rights increase the damage if its secret leaks. A checklist and a validation in the job fix the real problem.' },
    { q: 'Can one query cover all environments?', a: 'The FAQ says Anypoint Monitoring does not aggregate application metrics across environments or business groups. Query each environment and combine the results.' },
  ],
}
