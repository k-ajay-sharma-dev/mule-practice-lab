export default {
  id: 'inc-154',
  category: 'incidents',
  title: 'Production Traffic Is Governed by a Sandbox API Instance: The ID That Promotion Changed',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'autodiscovery', 'api-manager', 'environments', 'security', 'hybrid'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '14:02:11 WARN  [pentest] GET https://api.example.com/loyalty/v2/points without client_id: 200 OK', relevant: true, why: 'Client ID Enforcement is configured on the Production instance, and it is not being applied to this traffic.' },
      { text: '14:03:30 INFO  [app] loyalty-papi: GET /points 200 (18 ms)', relevant: false },
      { text: '14:05:12 INFO  [api-mgr] Production: instance 18904417 (loyalty-api, promoted from Sandbox on 02 Oct), Client ID Enforcement, no tracked application', relevant: true, why: 'The Production instance is not paired, so its policy has no runtime to act on.' },
      { text: '14:05:40 INFO  [api-mgr] Sandbox: instance 18829104 (loyalty-api), Rate Limiting 1000/min, tracked, traffic high since 03 Oct', relevant: true, why: 'Production traffic shows up against the Sandbox instance. This is the instance the app is paired to.' },
      { text: '14:07:02 INFO  [ops] loyalty-papi JAR, config.properties: apiId=18829104', relevant: true, why: 'The API instance ID is bundled in the artifact, so every environment uses the Sandbox value.' },
      { text: '14:08:15 INFO  [ops] wrapper.conf on prod-07: anypoint.platform.client_id = organization credentials', relevant: true, why: 'Organization credentials can reach APIs across environments, so a wrong ID pairs instead of failing.' },
      { text: '14:09:00 INFO  [agent] Heartbeat OK: prod-07', relevant: false },
      { text: '14:12:44 INFO  [ci] Pipeline loyalty-papi 2.3.1: last Production deployment 03 Oct, status Success', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does Production run without the Production policy?',
        options: [
          'The app still carries the Sandbox API Instance ID. Promotion creates a new instance ID in the target environment, and the app was never updated',
          'Client ID Enforcement does not work on hybrid servers',
          'The policy needs a restart of API Manager',
          'Gatekeeper is set to `disabled`',
        ],
        answer: 0,
        explain: 'The promotion page says the API Label stays the same but the API Instance ID changes, and that promotion affects only the API definition, not deployed applications. Existing apps must update the ID.',
      },
      {
        type: 'single',
        prompt: 'A wrong ID is often expected to stop pairing altogether. Why did this app pair with an instance in another environment?',
        options: [
          'The runtime uses organization credentials, which cover both environments. Environment credentials manage only APIs specific to that environment',
          'API Manager falls back to the first instance with the same asset',
          'Autodiscovery ignores the environment entirely in all setups',
          'Promotion links the two instances for 30 days',
        ],
        answer: 0,
        explain: 'The docs recommend environment credentials, and they say that if your APIs are in different environments, you must instead use the credentials of the organization that contains both. That reach is what made the error silent here.',
      },
      {
        type: 'multi',
        prompt: 'Which changes follow the documented behaviour?',
        options: [
          'Supply the API instance ID for each environment at deployment, not in a file in the JAR',
          'Use the environment client ID and secret for each environment',
          'Add a pipeline check that the ID exists in the target environment, using `api-mgr:api:list` with `--output json`',
          'After promoting, update the Instance ID and the client ID and secret of apps that must subscribe',
          'Re-promote the Sandbox instance until it gets the old ID',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Each promotion creates an instance with its own ID, so you cannot keep the old one. The value belongs to the deployment, and deployment properties rank highest in the properties hierarchy.',
      },
      {
        type: 'single',
        prompt: 'The corrected deployment goes out. What should consumers expect in the first moments?',
        options: [
          'The tracked resource returns `503` until the policies are applied, and it stays blocked until contracts are available if a policy needs them',
          'No change, because Gatekeeper never acts on a redeploy',
          'A `401` for all callers for 24 hours',
          'Traffic passes unprotected until the next restart',
        ],
        answer: 0,
        explain: 'Gatekeeper engages when you restart the runtime or redeploy a tracked resource linked to an API instance. It blocks with `503 - Service Unavailable` until all policies are applied without errors.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Tell the security lead that Production has been unprotected, and start an incident record',
          'Confirm the pairing and the credentials that each environment really uses',
          'Check that consumers have contracts on the Production instance, because enforcement is about to begin',
          'Redeploy with the Production instance ID, in a controlled window',
          'Verify that requests with no client ID are rejected, and that traffic shows on the Production instance',
          'Move to environment credentials, and add the pipeline check',
          'Review the access logs for the exposed period',
        ],
        explain: 'Turning on enforcement can lock out genuine consumers, so check contracts first. The review of the exposure comes after the gap is closed.',
      },
    ],
  },
  description: `
## Symptoms
- A penetration tester reads loyalty point balances from the Production API with no client ID. Client ID Enforcement is configured on the Production instance in API Manager.
- Analytics for the Production instance show nothing, while the Sandbox instance shows heavy traffic.
- Last week a Sandbox engineer changed a rate limit for a load test, and Production callers started to receive \`429\` responses. Nobody could explain it at the time.

## Change / Context
- \`loyalty-papi\` runs on hybrid servers managed by Runtime Manager. The same JAR is deployed to Sandbox and to Production.
- On 02 October, the team promoted the API instance from Sandbox to Production in API Manager, and added Client ID Enforcement to the new instance.
- The autodiscovery element is \`<api-gateway:autodiscovery apiId="$\{apiId}" flowRef="loyalty-main"/>\`, and \`apiId=18829104\` is in \`config.properties\` in the JAR.
- The servers were registered a long time ago, with one set of credentials in \`wrapper.conf\`.

## Logs
\`\`\`
14:02:11 WARN  [pentest] GET /loyalty/v2/points without client_id: 200 OK
14:05:12 INFO  [api-mgr] Production: instance 18904417, no tracked application
14:05:40 INFO  [api-mgr] Sandbox: instance 18829104, tracked, traffic high since 03 Oct
14:07:02 INFO  [ops] config.properties: apiId=18829104
\`\`\`

## Your tasks
1. What is the most likely root cause?
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
    'Promoting an API instance keeps the label, but the API Instance ID changes.',
    'Promotion affects the API definition, not deployed applications. Apps must update the Instance ID and the client ID and secret.',
    'autodiscovery pairs the app with the instance named by apiId.',
    'Environment credentials are the recommended link, and they reach only that environment. Organization credentials reach several.',
    'Policies on an instance apply only to the app paired with it, so a wrong pairing means the wrong policies.',
    'The instance ID is environment configuration, so it does not belong in the artifact.',
    'Deployment properties take precedence over application properties.',
    'Gatekeeper returns 503 on redeploy until policies are applied, and waits for contracts if a policy needs them.',
  ],
  solution: `
**Diagnosis.** Compare the two instances. Production has a policy and no traffic. Sandbox has Production's traffic. So the app in Production is paired with the Sandbox instance. That also explains the old mystery: the rate limit change in Sandbox affected Production callers, because they really were governed by that instance. The value in \`config.properties\` confirms it.

**Immediate mitigation.**
- Treat this as a security incident. The API has been open since 03 October.
- Freeze changes to the Sandbox instance, because they affect Production until the fix is out.
- Before you switch, check that real consumers have contracts on the Production instance. As soon as the app pairs correctly, Client ID Enforcement starts, and callers without a contract are rejected.
- Redeploy with the Production value, in an agreed window:

\`\`\`xml
<armDeployment>
  ...
  <properties>
    <apiId>18904417</apiId>
    <!-- plus every other property, sent in full -->
  </properties>
</armDeployment>
\`\`\`

Expect Gatekeeper to engage. On redeploy, the tracked resource returns \`503 - Service Unavailable\` until all API instance policies are applied, and the Gatekeeper page says APIs stay blocked until contracts are downloaded if a policy requires them. The default level is \`flexible\` from Mule 4.1.0.
- Verify from outside: a call with no client ID must now fail, and the Production instance must show as tracked.

**Root cause.** Three facts lined up.
1. Promotion: the API Manager page says that after promoting, the API Label stays the same but the API Instance ID changes, and promoting affects only the API definition, not existing deployed applications. Apps that must subscribe need the new Instance ID and the client ID and secret of the environment.
2. The artifact: \`apiId\` was bundled in the JAR, so promoting the same binary carried the Sandbox ID into Production.
3. Credentials: the servers use organization credentials. The docs recommend environment credentials, and with those you can manage APIs specific to only that environment. Organization credentials are for APIs in different environments. With them the wrong ID did not fail, and the app paired quietly with an instance in another environment.

**Permanent fix.**
- Take \`apiId\` out of the JAR, and supply it per environment at deployment. Deployment properties are at the top of the properties hierarchy, so they win over an application property.
- Keep a mapping of app, environment and instance ID in the pipeline configuration, and update it as part of any promotion. After a scripted promotion, read the new ID with \`api-mgr:api:list --output json\`.
- Change the runtimes to environment credentials. On a hybrid server these are \`anypoint.platform.client_id\` and \`anypoint.platform.client_secret\` in \`wrapper.conf\`, or set on the command line at start-up. For a server in each environment, this also removes the cross-environment reach. If one server hosts apps from several environments, this needs a design decision.
- Keep \`apiId\` as a required value, with no default. The API Manager troubleshooting page shows the failure when the property is missing: \`Couldn't find configuration property value for key $\{apiId}\`, and it says the value must be a valid \`apiId\` of type \`long\`. A failed start is much better than a wrong pairing.

**Prevention.**
- Before deploying, the pipeline runs \`api-mgr:api:list --output json\` against the target environment, and fails if the ID is not there.
- After deploying, a negative smoke test proves that a policy is active: a request with no client ID must be rejected.
- Add a check that compares traffic on each API instance with what you expect, so that a Sandbox instance with Production volume raises a question.
- Add to the promotion runbook: update the Instance ID and the credentials of each subscribing app.
`,
  followUps: [
    { q: 'Why did the Sandbox instance not reject anything?', a: 'It has only a rate limiting policy, and the app applied the policies of the instance it was paired to. The Production policy had no paired application.' },
    { q: 'What if the app had not been paired with any instance?', a: 'For a resource not linked to an API instance, Gatekeeper ignores it, you cannot apply policies, and no analytics are generated. The docs say so in the Gatekeeper page, so an unpaired API has no protection from API Manager either.' },
    { q: 'Can an API be paired with two instances for a while?', a: 'No. You can associate an API in a Mule setup with only one autodiscovery instance at a given time.' },
    { q: 'Does autodiscovery work on any listener?', a: 'The referenced flow must use an HTTP Listener component. Other connectors that use HTTP as an underlying transport are not supported for policy enforcement.' },
  ],
}
