export default {
  id: 'inc-007',
  category: 'incidents',
  title: 'Production Orders Landing in the QA ERP',
  level: 'BEGINNER',
  tags: ['properties', 'environments', 'deployment', 'configuration'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '07:02:10.880 INFO  [runtime] Starting app order-sync-papi on CloudHub 2.0 (replicas=2)', relevant: false },
      { text: '07:02:11.402 INFO  [order-sync] Loaded properties from config-qa.yaml', relevant: true, why: 'The production app loaded the QA configuration: env resolved to the global-property default qa.' },
      { text: '07:02:12.015 INFO  [runtime] Application started successfully', relevant: false },
      { text: '07:15:40.118 INFO  [order-sync] Processing order SO-554120 corrId=2b7e', relevant: false },
      { text: '07:15:40.390 INFO  [order-sync] POST https://erp-qa.internal.example.com/api/orders -> 201 corrId=2b7e', relevant: true, why: 'Real orders go to the QA ERP host, which accepts them, so there are no errors.' },
      { text: '07:15:41.270 INFO  [order-sync] POST https://erp-qa.internal.example.com/api/orders -> 201 corrId=c19a', relevant: true, why: 'Every order follows the same path, which explains the 3,000 orders in QA and none in production.' },
      { text: '07:16:00.003 INFO  [health] GET /health 200 (2 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'The new deployment has no env=prod runtime property, so env fell back to the global-property default qa',
          'The production ERP is down and orders were failed over to QA',
          'Someone edited config-prod.yaml to point at the QA ERP',
          'DNS for erp.internal.example.com now resolves to the QA server',
        ],
        answer: 0,
        explain: 'The startup log says **config-qa.yaml**. The old deployment set env=prod in Runtime Manager; the new pipeline template did not, and global.xml silently defaults to qa.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now**?',
        options: [
          'Leave it running and copy orders from QA to prod at the end of the day',
          'Set env=prod on the deployment and restart, check the log shows config-prod.yaml, then replay the orders into the prod ERP',
          'Delete the QA ERP',
          'Roll back to the old CloudHub 1.0 deployment and do nothing else',
        ],
        answer: 1,
        explain: 'Fix the configuration, verify it, and recover the missing orders while checking for duplicates. The personal data in QA must also be reported to security and removed.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Remove the global-property default and fail fast at startup if env is missing or invalid',
          'Set per-environment properties in the CI/CD pipeline, reviewed like code',
          'A post-deployment smoke test on an /info endpoint showing the environment and target hosts',
          'Network segmentation so production apps cannot reach QA systems',
          'Keep the default but change it to prod',
        ],
        answer: [0, 1, 2, 3],
        explain: 'A missing property must stop the app, not silently pick an environment. Defaulting to prod would just move the risk: a local or QA run could then write to production.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Spot config-qa.yaml in the startup log and the erp-qa host in requests',
          'Set env=prod and restart, then verify the loaded config',
          'Replay the orders since the redeploy into the prod ERP',
          'Report the personal data in QA to security and remove it',
          'Add fail-fast config checks, smoke tests and network segmentation',
        ],
        explain: 'Diagnose, stop the wrong routing, recover business data, handle the data leak, then prevent recurrence.',
      },
    ],
  },
  description: `
## Symptoms
- \`order-sync-papi\` was **redeployed to production** last night (new CloudHub 2.0 deployment after a platform migration).
- This morning the business reports that **no new orders** have arrived in the production ERP since the redeploy.
- At the same time the QA team asks why the **QA ERP** suddenly contains ~3,000 orders with real customer names and addresses.
- The app is healthy in Runtime Manager: no errors, every call returns **HTTP 200**.

## Change / Context
- Configuration is loaded with \`<configuration-properties file="config-$\{env}.yaml"/>\`.
- \`global.xml\` also contains \`<global-property name="env" value="qa"/>\` "so the app runs locally without extra setup".
- The old deployment had a runtime property \`env=prod\` set in Runtime Manager. The new deployment was created from a pipeline template that sets only \`anypoint.platform.client_id\`/\`client_secret\` and the secure key.

## Logs (production replica)
\`\`\`
07:02:11.402 INFO  [order-sync] Loaded properties from config-qa.yaml
07:15:40.118 INFO  [order-sync] Processing order SO-554120 corrId=2b7e
07:15:40.390 INFO  [order-sync] POST https://erp-qa.internal.example.com/api/orders -> 201 corrId=2b7e
07:15:41.006 INFO  [order-sync] Processing order SO-554121 corrId=c19a
07:15:41.270 INFO  [order-sync] POST https://erp-qa.internal.example.com/api/orders -> 201 corrId=c19a
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
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
    'Identifies that the env property was not set on the new deployment, so the global-property default (qa) was used and config-qa.yaml was loaded.',
    'Notes that the log line "Loaded properties from config-qa.yaml" and the erp-qa URL prove it; HTTP 200/201 means nothing was "broken" from the app\'s point of view.',
    'Immediate: set env=prod in Runtime Manager (or redeploy with the right property), confirm prod URLs in logs, then replay the orders since the redeploy into the prod ERP.',
    'Treats real customer data in QA as a data-protection incident: inform security/privacy, delete or mask the records in QA.',
    'Permanent fix: remove the environment default from the code and fail fast at startup if env is missing; keep env-specific values outside the jar or per-environment in the pipeline.',
    'Prevention: post-deploy smoke test that checks the target endpoints, pipeline templates per environment, and network rules that stop prod from reaching non-prod systems.',
  ],
  solution: `
**Diagnosis.** The app is working "correctly" — it is just using the **QA configuration**. The new deployment did not get the runtime property \`env=prod\`, so \`$\{env}\` resolved to the **global-property default \`qa\`**, \`config-qa.yaml\` was loaded and every order was sent to \`erp-qa\`. The log line *Loaded properties from config-qa.yaml* and the \`erp-qa\` host in every request confirm it. No errors appear because the QA ERP accepted the orders.

**Immediate mitigation.**
1. Set \`env=prod\` as a runtime property on the deployment (Runtime Manager → Properties) and restart; check the startup log now says \`config-prod.yaml\` and requests go to the prod ERP.
2. Find all orders processed since the redeploy (by timestamp or from the QA ERP / logs) and **replay them into the prod ERP**, checking for duplicates.
3. Treat the QA copy as a **data leak of personal data**: tell security/privacy, delete or mask those records in QA, and check who had access.

**Root cause.** Environment selection depended on a runtime property that had a **silent default to a non-prod environment** baked into the application. The new pipeline template did not set it, and nothing checked which environment the app thought it was in.

**Permanent fix.**
- Remove \`<global-property name="env" value="qa"/>\` (use a local-only override such as a run configuration or \`local\` profile instead).
- **Fail fast**: if \`env\` is missing or not one of the allowed values, stop the app at startup (e.g. a startup check flow or a required property with no default).
- Define per-environment deployment parameters in the CI/CD pipeline (\`-Denv=prod\` in the Maven deploy config), reviewed like code.

**Prevention.** Post-deployment smoke test that calls a \`/info\` endpoint returning the environment and target hosts; environment-specific pipeline templates; **network segmentation** so a prod app cannot reach QA systems at all; and a deployment checklist that compares runtime properties between old and new deployments during migrations.
`,
  followUps: [
    { q: 'How do you prove which configuration file the app actually loaded?', a: 'Check the startup log and the resolved values in outbound requests (target host in logs). Better still, expose a read-only /info endpoint or log line at startup that prints the environment name and non-secret target URLs.' },
    { q: 'Why is a default value for env dangerous, and what would you do instead?', a: 'A default makes a missing property silently select an environment instead of failing. Use no default (startup fails if missing) or default to a harmless value like "local" that points nowhere real.' },
    { q: 'What would you put in the post-mortem?', a: 'Timeline, impact (orders delayed, personal data in QA), the missing property in the new pipeline template as root cause, why monitoring did not catch it (all 200s), and actions: fail-fast config, smoke tests, network segmentation, template review.' },
  ],
}
