export default {
  id: 'inc-039',
  category: 'incidents',
  title: 'Every Request Gets 503 After Promoting the API to Production',
  level: 'INTERMEDIATE',
  tags: ['api-manager', 'autodiscovery', 'deployment', 'policies', 'environments'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '06:30:10.002 INFO  [loans-eapi] Loading properties from prod.yaml (api.id=18800221)', relevant: true, why: 'prod.yaml was copied from qa.yaml; 18800221 is the QA API instance ID.' },
      { text: '06:30:12.441 INFO  [loans-eapi] Autodiscovery: API apiId=18800221 ... registering', relevant: false },
      { text: '06:30:13.010 WARN  [loans-eapi] API apiId=18800221 not found / not accessible in environment ... (gateway will keep blocking)', relevant: true, why: 'The PROD environment credentials cannot reach the QA instance, so pairing never completes.' },
      { text: '06:30:13.012 INFO  [loans-eapi] Gateway: API blocked until policies are applied', relevant: true, why: 'Fail-closed: the gateway answers 503 until policies are downloaded, so nothing reaches the flows.' },
      { text: '06:30:14.200 INFO  [loans-eapi] Application loans-eapi started (status RUNNING)', relevant: false },
      { text: '06:31:02.110 INFO  [api-manager] PROD API instance loans-eapi id=18911034 status=Unregistered, policies: client-id-enforcement, rate-limiting', relevant: true, why: 'The real PROD instance has a different ID and nothing has paired with it.' },
      { text: '06:31:05.000 INFO  [health] Runtime Manager replica check OK', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does every request get 503?',
        options: [
          'Autodiscovery uses the QA API instance ID, pairing never completes in PROD, and the gateway blocks requests until policies are applied',
          'The rate limiting policy is set too low',
          'The app crashed after startup',
          'The PROD backend systems are down',
        ],
        answer: 0,
        explain: 'The app is RUNNING but no flow logs appear: the gateway is blocking (fail-closed) because the configured apiId is not the PROD instance.',
      },
      {
        type: 'single',
        prompt: 'What is the right immediate fix?',
        options: [
          'Remove the autodiscovery element and redeploy',
          'Set `api.id` to the PROD instance ID as a Runtime Manager property, restart, and confirm the instance is Active',
          'Disable gateway blocking in PROD',
          'Delete the QA API instance',
        ],
        answer: 1,
        explain: 'Pair with the correct instance. Removing autodiscovery or disabling blocking would expose the API without client ID enforcement and rate limiting.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Inject api.id per environment from the pipeline instead of copying environment files',
          'Make sure anypoint.platform.client_id/secret belong to the target environment',
          'Post-deploy smoke test through the gateway and an API Manager "Active" status gate',
          'Use the same API instance ID in every environment',
        ],
        answer: [0, 1, 2],
        explain: 'Environment-specific values must be set per environment and verified after deploy. API instances are per environment, so one ID cannot serve all.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Notice the app is RUNNING but no flow logs appear',
          'Read the autodiscovery warning and compare apiId with the PROD instance ID',
          'Override api.id in Runtime Manager and restart',
          'Confirm the instance is Active with policies and smoke-test with a client ID',
          'Move api.id injection into the pipeline and add the status gate',
        ],
        explain: 'Locate where requests stop, find the mismatch, fix, verify, then automate.',
      },
    ],
  },
  description: `
## Symptoms
- \`loans-eapi\` was deployed to PROD for go-live. The app status is **Running** in Runtime Manager.
- Every request returns **503** with a short body like "API is not available / not yet configured". Nothing reaches the flows — no logs from the main flow.
- The same artifact works in QA.

## Change / Context
- The app uses \`<api-gateway:autodiscovery apiId="$\{api.id}" flowRef="loans-eapi-main"/>\`.
- \`api.id\` comes from \`prod.yaml\` — a copy of \`qa.yaml\` where somebody updated URLs but not the API ID. The value is the **QA** API instance ID.
- PROD API Manager has an API instance for \`loans-eapi\` with policies (client ID enforcement, rate limiting) and a different ID.
- The org's PROD environment client ID/secret are configured as \`anypoint.platform.client_id/secret\`.

## Logs
\`\`\`
06:30:12.441 INFO  [loans-eapi] Autodiscovery: API apiId=18800221 ... registering
06:30:13.010 WARN  [loans-eapi] API apiId=18800221 not found / not accessible in environment ... (gateway will keep blocking)
06:30:13.012 INFO  [loans-eapi] Gateway: API blocked until policies are applied
\`\`\`

## Your tasks
1. Why are all requests getting 503?
2. How do you restore service quickly?
3. What is the permanent fix?
4. How do you prevent this?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'With autodiscovery, the gateway blocks an API (503) until it successfully pairs with its API Manager instance and downloads policies.',
    'The apiId points to the QA API instance, which the PROD environment credentials cannot access, so pairing never completes.',
    'Immediate: set api.id to the PROD API instance ID (property in Runtime Manager) and restart; verify the API status becomes Active.',
    'Do not "fix" by removing autodiscovery or disabling gateway blocking — that exposes the API without its security policies.',
    'Prevention: environment-specific values (api.id, platform credentials) injected by the pipeline per environment, plus a post-deploy smoke test.',
  ],
  solution: `
## Diagnosis
API autodiscovery ties the running app to an **API instance in API Manager**. On startup the gateway tries to fetch that instance's policies; until it succeeds, it **blocks requests with 503** (fail-closed — better than serving an unprotected API). The configured \`apiId\` is the **QA** instance, which doesn't exist in/isn't accessible from the PROD environment with PROD credentials, so pairing never completes and the API stays blocked. That's why no flow logs appear.

## Immediate mitigation
Set \`api.id\` to the PROD instance ID as a property in Runtime Manager (overrides the file value) and restart. In API Manager, confirm the instance shows as **Active** with policies applied, then run a smoke test with a valid client ID.

## Root cause
An environment-specific value (API instance ID) was copied between environment files, and the go-live checklist had no validation of the autodiscovery pairing.

## Permanent fix
- Keep \`api.id\` out of the packaged config, or inject it per environment from the pipeline (e.g. from API Manager when the instance is created/promoted).
- Ensure the platform client ID/secret belong to the right environment.

## Prevention
- Post-deployment smoke test hitting the API through the gateway.
- Check the API instance status in API Manager as a deployment gate.
- Never disable gateway blocking in PROD to "make it work".
`,
  followUps: [
    { q: 'Why does the gateway block requests instead of serving them without policies?', a: 'Serving without policies would bypass security such as client ID enforcement or JWT validation; blocking until policies are known is the safe default.' },
    { q: 'What do anypoint.platform.client_id and client_secret identify?', a: 'The environment (via its environment credentials) the runtime uses to talk to API Manager; they must match the environment where the API instance lives.' },
  ],
}
