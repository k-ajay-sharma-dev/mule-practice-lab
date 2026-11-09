import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-136',
  category: 'architecture',
  title: 'Flex Gateway in Front of Three Non-Mule Services on Kubernetes: One Entry Point, Tokens Checked at the Edge',
  level: 'INTERMEDIATE',
  tags: ['flex-gateway', 'api-gateway', 'api-manager', 'policies', 'kubernetes', 'security', 'oauth2'],
  estMinutes: 30,
  diagram: {
    task: 'draw how the mobile app and partner systems reach three non-Mule services through a cloud load balancer and Flex Gateway, with tokens issued by the identity provider, the gateway fetching signing keys from it, analytics sent to Anypoint Monitoring, and no route around the gateway. Draw each service as a System API box, because it plays that role even though it is not Mule.',
    checks: [
      { label: 'The mobile app and partners both enter through the load balancer', rule: { type: 'each', of: ['mobile-app', 'partner'], min: 2, edgeTo: 'load-balancer' } },
      { label: 'The load balancer sends traffic to Flex Gateway', rule: { type: 'edge', from: 'load-balancer', to: 'api-gateway' } },
      { label: 'Flex Gateway routes to all three services', rule: { type: 'path', from: 'api-gateway', to: 'system-api', min: 3 } },
      { label: 'Every service is reached only through Flex Gateway', rule: { type: 'only-via', target: 'system-api', from: 'api-gateway' } },
      { label: 'Neither clients nor the load balancer have a direct line to a service', rule: { type: 'no-edge', from: ['mobile-app', 'partner', 'load-balancer'], to: 'system-api' } },
      { label: 'Each client gets its token from the identity provider', rule: { type: 'each', of: ['mobile-app', 'partner'], min: 2, edgeTo: 'identity-provider' } },
      { label: 'Flex Gateway fetches the signing keys from the identity provider to validate tokens', rule: { type: 'edge', from: 'api-gateway', to: 'identity-provider' } },
      { label: 'The services do not call the identity provider for every request', rule: { type: 'no-edge', from: 'system-api', to: 'identity-provider', ifDrawn: true } },
      { label: 'Flex Gateway sends analytics to Anypoint Monitoring', rule: { type: 'edge', from: 'api-gateway', to: 'monitoring' } },
      { label: 'Requests through the load balancer and the gateway are sync calls', rule: { type: 'lines', touching: ['load-balancer', 'api-gateway'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Courier mobile app'],
        prt: ['partner', 'Retail partners (40 systems)'],
        lb: ['load-balancer', 'Cloud load balancer (TLS)'],
        flex: ['api-gateway', 'Flex Gateway, Connected Mode, 2 replicas'],
        idp: ['identity-provider', 'OpenID Connect provider'],
        trk: ['system-api', 'tracking-service (Node.js)'],
        rat: ['system-api', 'rates-service (Spring Boot)'],
        lab: ['system-api', 'labels-service (.NET)'],
        db: ['database', 'Tracking database'],
        mon: ['monitoring', 'Anypoint Monitoring'],
      },
      [
        'mob -> idp', 'prt -> idp', 'mob -> lb', 'prt -> lb', 'lb -> flex',
        'flex -> idp', 'flex -> trk', 'flex -> rat', 'flex -> lab', 'trk -> db', 'flex -> mon',
      ],
    ),
  },
  description: `
A parcel delivery company runs three services on its own Kubernetes cluster in AWS. None of them is a Mule app:

| Service | Technology | Callers |
|---|---|---|
| \`tracking-service\` | Node.js | Courier mobile app, partners |
| \`rates-service\` | Spring Boot | Partners |
| \`labels-service\` | .NET | Partners |

Today each service has its own public load balancer and checks tokens in its own code. The three teams use three different token libraries, one service still accepts expired tokens, and nobody can say which partner calls what.

The security team wants:
- **One entry point** for all three services.
- Tokens from the company's **OpenID Connect provider** checked before a request reaches a service.
- A **rate limit per partner** of 50 requests per second.
- Traffic data in **Anypoint Monitoring** next to the Mule APIs.

The platform team proposes **Flex Gateway** in **Connected Mode**, installed in the same cluster, with policies managed in **API Manager**.

**Questions:**
- Draw the runtime path.
- What does Flex Gateway do here, and what stays in the services?
- How are tokens checked, and what does the gateway need from the identity provider?
- How do you stop callers from going around the gateway?
- How do the rate limit counters work with two gateway replicas?
`,
  answerTemplate: `## Runtime path

## What the gateway does

## Checking tokens

## No way around the gateway

## Two replicas and the rate limit
`,
  keyPoints: [
    'Flex Gateway is an Envoy-based gateway that can protect any HTTP service, not only Mule apps.',
    'In Connected Mode it registers with Anypoint Platform, and API Manager pushes the policies to it.',
    'Each service becomes an API instance in API Manager with Flex Gateway as its runtime, so each can have its own policies.',
    'JWT Validation checks the signature with keys from the identity provider JWKS endpoint, plus expiry, issuer and audience.',
    'The services stop doing their own token checks, but they still check what the caller is allowed to do with the data.',
    'Remove the old public load balancers and keep the services on internal cluster addresses, with network policies that allow traffic only from the gateway.',
    'Rate limit counters are kept per replica unless the gateway is given shared storage, so plan for that with two replicas.',
    'Flex Gateway sends API analytics to Anypoint Monitoring, so partner traffic shows up next to the Mule APIs.',
  ],
  solution: `
**Runtime path**
\`\`\`
Mobile app ──┐                                 ┌─► tracking-service ─► database
Partners  ───┼─► Cloud load balancer ─► Flex ──┼─► rates-service
             │                       Gateway   └─► labels-service
             └─► OpenID Connect provider (tokens)
Flex Gateway ─► OpenID Connect provider (signing keys)
Flex Gateway ─► Anypoint Monitoring
\`\`\`

**What the gateway does.** Flex Gateway runs as a deployment in the cluster with two replicas. Each service is registered in API Manager as an API instance on that gateway, with its own upstream URL. Policies applied there: **JWT Validation** for every API, **Client ID Enforcement** or **Rate Limiting SLA** for partners, and a rate limit of 50 requests per second per partner. Only identity and traffic rules move to the gateway. Business rules, such as which parcels a partner may see, stay in the services.

**Checking tokens.** Clients get a token from the identity provider with the client credentials flow, or the authorization code flow for the courier app. The gateway reads the provider's public keys from its JWKS URL and caches them. It checks the signature, expiry, issuer and audience before the request goes on. The services no longer talk to the identity provider for each call.

**No way around the gateway.**
- Delete the three old public load balancers.
- Keep the services as internal cluster services with no public address.
- Add network policies that accept traffic only from the gateway pods.

**Two replicas.** Each replica enforces policies on its own. Unless the gateway is configured with shared storage, such as Redis, a limit of 50 per second could let up to 100 through across two replicas. Either configure shared storage, or set the limit per replica and accept the margin.
`,
  followUps: [
    {
      q: 'Why Connected Mode and not Local Mode?',
      a: 'Connected Mode lets API Manager push policies and collect analytics, which is what the security team asked for. Local Mode is configured with files and has no API Manager view.',
    },
    {
      q: 'Could you use a Mule API proxy instead?',
      a: 'Yes, but it adds a Mule runtime to the path and to the bill. Flex Gateway is lighter and runs as a container next to the services on the same cluster.',
    },
    {
      q: 'The identity provider rotates its signing keys. What happens?',
      a: 'The gateway fetches the new keys from the JWKS URL. Tokens signed with the new key work once the gateway refreshes its cached keys.',
    },
    {
      q: 'Does the gateway need to reach the control plane to keep working?',
      a: 'Applied policies keep running if the control plane cannot be reached. New policy changes and analytics wait until the connection is back.',
    },
  ],
}
