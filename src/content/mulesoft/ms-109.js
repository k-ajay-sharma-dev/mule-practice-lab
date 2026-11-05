export default {
  id: 'ms-109',
  category: 'mulesoft',
  title: 'Inside an API Instance: Basic Endpoint or Proxy, Upstream URL, Asset Versions, Promotion and Gatekeeper Modes',
  level: 'ADVANCED',
  tags: ['api-manager', 'api-management', 'api-proxy', 'autodiscovery', 'gatekeeper', 'environments', 'mule-gateway'],
  estMinutes: 35,
  quiz: [
    {
      type: 'match',
      detail: true,
      prompt: 'Match each API instance setting to its meaning.',
      pairs: [
        ['Consumer endpoint', 'The address consumers use to send requests'],
        ['Upstream URL (older pages say Implementation URI)', 'The URL of the service that completes the request'],
        ['Instance label', 'Text that tells several managed instances of the same API apart'],
        ['API Instance ID', 'A value API Manager generates, which cannot be changed'],
      ],
      explain: 'In the docs, the downstream side is the consumer and the upstream side is the service it depends on. The instance ID is what the autodiscovery element points to.',
    },
    {
      type: 'single',
      prompt: 'A team must apply policies to a Spring Boot service that it cannot change. Which Mule Gateway option does API Manager offer?',
      options: [
        'Deploy a proxy application, with the service as the Upstream URL',
        'Connect to existing application (basic endpoint)',
        'Add the autodiscovery element to the Spring Boot service',
        'Publish the service to Exchange, which applies the policies',
      ],
      answer: 0,
      explain: 'Basic endpoint is for a Mule application configured with autodiscovery. A proxy is for a Mule app without autodiscovery, or an application that is not a Mule app.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'An instance uses asset version 1.4.0. A new 2.0.0 is published to Exchange with a new API version. How do you move to it?',
      options: [
        'Create a new API instance, because the asset version can only change within the same major version',
        'Use Change API specification and select 2.0.0',
        'Do nothing, because instances follow the latest version',
        'Promote the instance to the same environment',
      ],
      answer: 0,
      explain: 'The asset version of an instance can be upgraded or downgraded only within one major version. For a different major version, the docs say to create a new instance.',
    },
    {
      type: 'single',
      prompt: 'An API instance in API Manager is promoted from Sandbox to Production. A Mule app already runs in Production and must use the promoted instance. What has to happen?',
      options: [
        'Update the app with the new API Instance ID and the Production client ID and secret',
        'Nothing, because promotion switches the app to the new instance automatically',
        'Nothing, because the API Instance ID stays the same after promotion',
        'Update the app with the new API label, because only the label changes',
      ],
      answer: 0,
      explain: 'The API label stays the same and the API Instance ID changes. Promotion affects only the API definition, and not deployed applications. Each environment has its own client ID and secret, so both the ID and the credentials must be updated in the app.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each Gatekeeper level to its behaviour.',
      pairs: [
        ['strict', 'If connectivity to Anypoint Platform is lost while engaged, the resource stays blocked until the connection returns'],
        ['flexible', 'If connectivity is lost while engaged, the local cache applies the policies; with no cache the resource stays blocked'],
        ['disabled', 'No blocking, so the API can receive traffic while policies are being applied'],
      ],
      explain: 'Strict and flexible both return 503 after a restart until policies are in place. They differ when the platform cannot be reached. Flexible is the default from Mule 4.1.0.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A running API on Mule 4.9 is healthy. When does Gatekeeper block requests without a restart?',
      options: [
        'While a policy configuration is being edited; it does not block when only the policy order is edited',
        'Never, because Gatekeeper is engaged only at startup on all versions',
        'Whenever a new contract is approved',
        'Whenever the policy order is edited',
      ],
      answer: 0,
      explain: 'For Mule 4.8.0 and later, the Gatekeeper page says requests are blocked when policy configurations are edited, and not when the order is edited. The property anypoint.platform.gatekeeper.block_edit=false turns this off.',
    },
    {
      type: 'single',
      prompt: 'After a redeploy, an API returns 503 until an engineer removes one policy that has a bad configuration. Why?',
      options: [
        'With Gatekeeper engaged, a malformed policy keeps the resource blocked until that policy is removed from API Manager',
        'A bad policy is skipped, so the 503 must have come from the backend',
        'Gatekeeper retries for one hour and then unblocks the API',
        'The contract cache was full',
      ],
      answer: 0,
      explain: 'Gatekeeper unblocks only when all policies apply without errors. This protects the API: it never serves traffic with a policy missing.',
    },
  ],
  description: `
A new engineer has joined the platform team of a travel company. In the API Manager list she sees these entries and asks what each one means:

| API | Runtime | Notes |
|---|---|---|
| \`bookings-api\` | Mule app on CloudHub 2.0 | Connected as a basic endpoint with autodiscovery |
| \`fares-service\` | Spring Boot, cannot be changed | Mule proxy in front of it |
| \`legacy-tickets\` | SOAP, vendor owned | WSDL proxy on a hybrid server |

The team has several open questions:
- \`bookings-api\` needs to move to spec version 2.0.0, a breaking change.
- \`fares-service\` needs promoting to Production, and the team wonders what happens to the app that already runs there.
- An architect wants to know what clients see from each proxy type when a request is invalid.
- Last month, editing a policy's configuration caused a few seconds of 503s on a running API, although nobody restarted anything.

**Questions**
1. What is an API instance made of? Explain the consumer endpoint, Upstream URL, base path and instance label.
2. When do you use a basic endpoint and when a proxy? What does each type of proxy add?
3. How do you change the spec version of an instance?
4. What exactly does promotion change?
5. How does Gatekeeper work, and what explains the 503s?
`,
  answerTemplate: `## Parts of an API instance

## Basic endpoint or proxy

## Changing the spec version

## Promotion

## Gatekeeper
`,
  keyPoints: [
    'An instance can be added new, promoted from another environment, or imported from a zip file.',
    'Consumer endpoint is the address for consumers. Upstream URL is the service that completes the request; it is required for a proxy and optional for a basic endpoint. Older pages call it Implementation URI.',
    'Basic endpoint: a Mule app with autodiscovery acts as its own gateway. Proxy: a separate Mule app in front of a service that is not Mule, or a Mule app without autodiscovery.',
    'Autodiscovery needs the instance ID, a flow with an HTTP Listener, and platform credentials set before Mule starts.',
    'The asset version changes only within a major version. A new major version needs a new instance.',
    'Promotion keeps the label and gives a new instance ID. It does not touch deployed apps, which need the new ID and the environment\'s client ID and secret.',
    'Gatekeeper returns 503 until all policies apply without errors, after a restart or redeploy. Levels: strict, flexible (default from 4.1.0), disabled.',
    'From Mule 4.8.0, Gatekeeper also blocks during policy configuration edits, but not order edits.',
  ],
  solution: `
**1. Parts of an API instance.** An instance is API Manager's managed copy of an API in one environment. It references an Exchange asset (type, API version, asset version). Its settings include:
- **Consumer endpoint**: the address consumers use to send requests. It is optional.
- **Upstream URL**: the service that fulfils the request. Older pages, including the autodiscovery page, still say **Implementation URI**, so expect either name in an interview.
- **Base path**: the URL prefix for all API paths.
- **Instance label**: tells instances of the same API apart.
- **API Instance ID**: generated by API Manager and cannot be changed.

**2. Basic endpoint or proxy.** Use a **basic endpoint** ("Connect to existing application") when the Mule app has autodiscovery configured. The app enforces the policies itself. The referenced flow must use an HTTP Listener, because other connectors that use HTTP are not supported for policy enforcement.

Use a **proxy** when the service is not a Mule app, or is a Mule app without autodiscovery. API Manager can deploy it to CloudHub 2.0, CloudHub, a hybrid server or Runtime Fabric. For a self-managed server you download the JAR and deploy it yourself. A generated proxy already has autodiscovery configured. A CloudHub 2.0 proxy has 0.1 vCores by default.

| Proxy type | What it adds |
|---|---|
| WSDL | Errors from MuleSoft policies are sent as soap:fault messages |
| RAML / OAS | API Console at \`/console\`; validates requests against the spec; provides default parameter values |
| HTTP | Passes requests through |
| HTTPS | Uses the TLS configuration for the secure connection |

For invalid requests, the status-code page shows that the OAS proxy returns 400, 404 and 405. The RAML proxy returns 404 but not 400 in that table. The WSDL proxy returns 400. HTTP and HTTPS proxies return none of these three. All types return 504 on a timeout.

**3. Changing the spec version.** **Actions > Change API specification** moves an instance between minor and patch versions of one major version. \`bookings-api\` 2.0.0 is a new major version, so it needs a **new instance**, with its own ID, policies and contracts. The v1 instance can run alongside it during the migration.

**4. Promotion.** Choose **Add API > Promote API from environment**, select the source and optionally clear items under **Include in Promotion**. Then review the runtime and endpoint settings. The label stays the same and the **instance ID changes**. Promotion affects only the definition, and not the deployed app. So the running Production app must get the new instance ID and the environment's client ID and secret. Anypoint CLI has matching flags: \`--copyPolicies\`, \`--copyTiers\` and \`--copyAlerts\`.

**5. Gatekeeper.** It is engaged when the runtime restarts or a tracked app is redeployed. Each tracked resource returns **503** until all policies apply without errors. If a policy that needs contracts is applied, the API also stays blocked until contracts are downloaded. A malformed policy keeps the resource blocked until the policy is removed. If connectivity is lost, Mule uses its cached policies, configuration and contracts: strict stays blocked while Gatekeeper is engaged, and flexible uses the cache.

The month-old 503s have a documented cause: **from Mule 4.8.0, Gatekeeper blocks requests while a policy configuration is edited**. It does not block for order changes. So make policy edits in a quiet period, or set \`anypoint.platform.gatekeeper.block_edit=false\` after weighing the risk.
`,
  followUps: [
    {
      q: 'Which credentials link Mule to API Manager?',
      a: 'The recommended pair is the environment client ID and secret. Organization or parent business group credentials also work, and they are needed if APIs are in different environments. The docs recommend against using client application credentials here, because Mule is then not linked correctly.',
    },
    {
      q: 'What is an unclassified API?',
      a: 'An API not associated with an environment, for example after an upgrade from an earlier API Manager. You need to classify it into an environment to manage it, and environment permissions then apply.',
    },
    {
      q: 'What error appears if the apiId property is missing?',
      a: 'Deployment fails with a PropertyNotFoundException saying that the configuration property value for apiId could not be found. The fix is to define the property. The value must be a valid ID of type long.',
    },
    {
      q: 'What about Omni Gateway (formerly Flex Gateway)?',
      a: 'It is the other runtime choice when adding an instance. It has separate pages and a separate alert workflow, and it can expose several upstream services through one consumer endpoint.',
    },
  ],
}
