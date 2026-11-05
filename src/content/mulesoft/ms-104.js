export default {
  id: 'ms-104',
  category: 'mulesoft',
  title: 'Mule Gateway and Omni Gateway (Formerly Flex Gateway): The Policy Differences That Catch Teams Out',
  level: 'ADVANCED',
  tags: ['security', 'policies', 'api-manager', 'omni-gateway', 'flex-gateway', 'mule-gateway', 'policy-order', 'automated-policies'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'A colleague keeps saying "Flex Gateway". What should you call it now, and what is it?',
      options: [
        'Omni Gateway (formerly Flex Gateway): an Envoy-based lightweight API gateway for APIs running anywhere',
        'Mule Gateway Lite: a cut-down Mule runtime',
        'Anypoint Security Edge: a proxy tier in Runtime Fabric',
        'API Manager 3: the new control plane',
      ],
      answer: 0,
      explain: 'The docs now use Omni Gateway (formerly Flex Gateway). Know both names: interviewers and older material may say Flex Gateway, and flex names remain in the product, such as the `flex-gateway` service and `FLEX_*` variables. Mule Gateway is different: it is embedded in Mule runtime engine, and policies are injected into the Mule app or proxy.',
    },
    {
      type: 'single',
      prompt: 'An API on Mule Gateway and an API on Omni Gateway (formerly Flex Gateway) each have the CORS policy, an automated policy and an API-level policy. In what order do these run on a request, on both gateways?',
      options: [
        'CORS, then automated, then API-level',
        'Automated, then CORS, then API-level',
        'API-level, then automated, then CORS',
        'CORS, then API-level, then automated',
      ],
      answer: 0,
      explain: 'The CORS policy cannot be ordered and runs first, and automated policies run before API-level policies. Both gateways also support duplicate policies, which should be given labels. The mechanisms differ. Local Mode exists only on Omni Gateway, where the `order` parameter of a `PolicyBinding` sets the sequence. In Connected Mode you order API-level policies in API Manager, as on Mule Gateway.',
    },
    {
      type: 'order',
      prompt: 'On Omni Gateway the policies are: Automated 1, API-level 1, Upstream-level 1. Put the steps in order for one request and its response.',
      items: [
        'Automated 1 on the request',
        'API-level 1 on the request',
        'Upstream-level 1 on the request',
        'Upstream-level 1 on the response',
        'API-level 1 on the response',
        'Automated 1 on the response',
      ],
      explain: 'Policies run in order on the request and in inverse order on the response. A policy that does not act in one direction is skipped there.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each policy to where the docs list it.',
      pairs: [
        ['OAuth 2.0 Access Token Enforcement Using Mule OAuth Provider', 'Mule Gateway only'],
        ['OAuth 2.0 Token Introspection', 'Omni Gateway only'],
        ['JWT Validation', 'Both gateways'],
      ],
      explain: 'Check the policy page for the gateway you run. PingFederate and OpenAM enforcement are also in the Mule Gateway list and absent from the Omni Gateway list, while outbound policies such as Credential Injection OAuth 2.0 belong to Omni Gateway.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'On Omni Gateway in **Local Mode**, you want to apply OpenID Connect OAuth 2.0 Token Enforcement with a declarative file. What do the docs say?',
      options: [
        'It is not supported in Local Mode: use Managed Omni Gateway or Connected Mode, or another policy such as OAuth 2.0 Token Introspection',
        'It works the same as in Connected Mode',
        'It works, but only for the first API instance',
        'It needs the Mule OAuth provider',
      ],
      answer: 0,
      explain: 'The policy page says so directly. The JWT Validation page adds a Local Mode rule as well: `skipClientIdValidation` must be true.',
    },
    {
      type: 'single',
      prompt: 'On Omni Gateway you add inbound TLS to one API instance that shares port 8443 with others. What is the effect?',
      options: [
        'The same inbound TLS context applies to all instances on that port, since inbound TLS is port-level',
        'Only that instance uses TLS',
        'Other instances fail to start',
        'Each instance can have a different certificate on that port',
      ],
      answer: 0,
      explain: 'Multiple certificates need unique ports. Outbound TLS is different, because it can be set for each upstream service. TLS policies do not support policy ordering.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'An administrator applies an **automated** IP Allowlist to the environment on Mule Gateway. One API already has its own IP Allowlist with a wider range. What happens?',
      options: [
        'The automated policy has priority, and you must solve the conflict',
        'The two lists are merged, and both ranges are allowed',
        'The API-level policy wins, because it is more specific',
        'The API-level policy can be moved before the automated one',
      ],
      answer: 0,
      explain: 'Automated policies have priority over policies of the same type, and API-level policies cannot be configured to run before them. API Manager detects the conflict when you apply the automated policy, and you solve it by disabling, removing or overriding the API-level policy. If you override it, the API-level policy is disabled, and it is re-enabled automatically if the automated policy is removed. Alerts also cannot be added to API instances protected by automated policies.',
    },
  ],
  description: `
A logistics group runs **Mule Gateway** for its Mule APIs. A platform team is introducing **Omni Gateway (formerly Flex Gateway)** in front of containerised Java and Node services. Part of it runs in Connected Mode, and part in Local Mode in a factory network with no management access.

Their plan is to "reuse the same policies". They have assumed that:

- every policy name exists on both gateways,
- ordering works the same way,
- a Local Mode gateway can do everything a Connected Mode gateway can,
- TLS can be set per API instance,
- policies are maintained in API Manager in every case.

**Questions**
1. What are the two gateways, and how do they enforce policies?
2. How does policy order work on each?
3. Which security policies differ between them?
4. How do Connected Mode and Local Mode differ for policies?
5. Which assumptions in the plan are wrong?
`,
  answerTemplate: `## The two gateways

## Policy order

## Policy availability

## Connected Mode and Local Mode

## Wrong assumptions
`,
  keyPoints: [
    'Current name: Omni Gateway (formerly Flex Gateway), Envoy-based. Mule Gateway is embedded in Mule runtime engine.',
    'Mule Gateway injects policies into the app or proxy, so enforcement happens inside it and changes need no redeploy.',
    'Both: CORS first and not orderable; automated before API-level; duplicate policies supported.',
    'Omni Gateway: order in API Manager in Connected Mode, PolicyBinding order in Local Mode; request order is inverted on the response; upstream (outbound) policies exist.',
    'Mule Gateway only: Mule OAuth Provider, PingFederate and OpenAM enforcement. Omni Gateway only: OAuth 2.0 Token Introspection, TLS policies, outbound Credential Injection policies.',
    'Local Mode: OpenID Connect enforcement is not supported, and JWT Validation needs skipClientIdValidation true.',
    'Inbound TLS on Omni Gateway is per port.',
    'Automated policies on Mule Gateway have priority over the same type applied to an API. API Manager detects the conflict, which you solve by disabling, removing or overriding the API-level policy.',
  ],
  solution: `
**1. The gateways.**
- **Mule Gateway** is embedded in Mule runtime engine. A policy asset is a JAR plus a YAML file. The runtime downloads policies and injects them into the API proxy or Mule app, so enforcement happens inside the application and policies can change with no redeploy.
- **Omni Gateway** is a separate Envoy-based gateway with a MuleSoft-hosted control plane. It can be **Managed** on CloudHub 2.0 or Runtime Fabric, or **Self-Managed**, which runs in **Connected Mode** or **Local Mode**.

**2. Order.** On both gateways CORS always runs first and cannot be ordered, and automated policies come before API-level ones. On Mule Gateway you use **Reorder policies** in API Manager, but you cannot put API-level policies before automated ones. On Omni Gateway:
- Requests run automated, then API-level, then upstream-level policies. Responses run in the inverse order.
- Connected Mode uses **Reorder policies**. Automated policies cannot be ordered there, and they run in the order they were applied.
- Local Mode uses the \`order\` field of a \`PolicyBinding\`, with no number used twice.

**3. Policies.**

| Need | Mule Gateway | Omni Gateway |
|---|---|---|
| Mule OAuth provider tokens | OAuth 2.0 Access Token Enforcement Using Mule OAuth Provider | Not listed |
| PingFederate, OpenAM | Dedicated policies | Not listed |
| OIDC client management | OpenID Connect OAuth 2.0 Token Enforcement | Same, except Local Mode |
| Any IdP with introspection | Not listed | OAuth 2.0 Token Introspection |
| JWT | JWT Validation | JWT Validation (ES supports 256 and 384 only) |
| Inbound and outbound TLS | \`tls:context\` in the app, or a proxy TLS context | Transport Layer Security policies |
| Add credentials to upstream calls | In the Mule app | Outbound Credential Injection policies |

DataWeave in policy expressions is fully supported on Mule, and only a subset on Omni Gateway. A DataWeave expression that works on one gateway must be checked on the other.

**4. Modes.** In Connected Mode and Managed Omni Gateway, policies are applied through API Manager. In Local Mode, they are declared in YAML files with \`PolicyBinding\` resources. JWT Validation needs \`skipClientIdValidation: true\`, and the OpenID Connect policy is not available.

**5. Wrong assumptions.**
- Same names everywhere: false, check each policy page.
- Same ordering: partly. The principles match, the mechanisms differ.
- Local Mode equals Connected Mode: false.
- TLS per instance: inbound is per port, and outbound is per upstream.
- API Manager in every case: not in Local Mode.
`,
  followUps: [
    {
      q: 'Why does the JWT policy in Local Mode have to skip client ID validation?',
      a: 'The Omni Gateway page states that the parameter must be true in Local Mode, without giving a reason. The likely one is that client ID validation checks a client against contracts held in the platform, and a Local Mode gateway is configured declaratively.',
    },
    {
      q: 'Is an IP Allowlist configured the same way on both?',
      a: 'The fields are the same, but read each page. On Omni Gateway the Local Mode default for ipExpression is the x-forwarded-for header, and the page states that IPv4 and IPv6 are both supported.',
    },
    {
      q: 'Does Mule Gateway need a connection to API Manager on every request?',
      a: 'No. Policies are enforced inside the application. The runtime stays connected to pick up changes, and cached policies and contracts keep working if the connection is lost after startup, subject to the Gatekeeper setting.',
    },
  ],
}
