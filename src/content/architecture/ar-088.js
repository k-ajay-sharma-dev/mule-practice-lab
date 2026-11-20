import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-088',
  category: 'architecture',
  title: 'Selling API Bundles to Partners with API Groups: Plans, Group Instances and Applied Contracts',
  level: 'ADVANCED',
  tags: ['api-manager', 'api-management', 'api-groups', 'sla-tiers', 'exchange', 'developer-portal', 'api-led', 'environments'],
  estMinutes: 55,
  diagram: {
    task: 'draw how partner apps reach a bundle of Tracking, Rates and Shipments APIs through policy enforcement on each API, with the portal for requesting access, the shared Process and System APIs behind them, and API metrics going to monitoring.',
    checks: [
      { label: 'Partners find the bundle and request access through a portal', rule: { type: 'edge', from: 'partner', to: { type: 'web-app', label: ['portal', 'exchange', 'hub'] } } },
      { label: 'Partner apps call through the gateway layer', rule: { type: 'edge', from: 'partner', to: 'api-gateway' } },
      { label: 'The bundle holds separate Experience APIs, which are not merged into one', rule: { type: 'node', match: 'experience-api', min: 3 } },
      { label: 'Every Experience API is reached through the gateway', rule: { type: 'each', of: 'experience-api', edgeFrom: 'api-gateway' } },
      { label: 'Partners never call an Experience API directly', rule: { type: 'no-edge', from: 'partner', to: 'experience-api' } },
      { label: 'Every Experience API calls a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'One Process API is shared by several Experience APIs', rule: { type: 'each', of: 'process-api', edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Gateway metrics reach monitoring', rule: { type: 'edge', from: 'api-gateway', to: 'monitoring' } },
      { label: 'Transport management is reached only through a System API', rule: { type: 'only-via', target: 'tms', from: 'system-api' } },
      { label: 'Every System API is called by a Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['tms', 'erp'] } },
      { label: 'The gateway forwards live requests, so its lines to the APIs are sync calls', rule: { type: 'lines', from: ['partner', 'api-gateway'], to: ['api-gateway', 'experience-api'], kind: 'sync' } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['experience-api', 'process-api'], to: ['process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        p: ['partner', 'Partner apps (one client app, one group contract)'],
        portal: ['web-app', 'Exchange public portal: API Group assets'],
        gw: ['api-gateway', 'Mule Gateway: Rate Limiting SLA on each API instance', { auth: 'client-id', rateLimit: 50 }],
        et: ['experience-api', 'exp-tracking', { vCores: '0.2' }],
        er: ['experience-api', 'exp-rates', { vCores: '0.2' }],
        es: ['experience-api', 'exp-shipments', { vCores: '0.2' }],
        pr: ['process-api', 'prc-shipment', { vCores: '0.5' }],
        st: ['system-api', 'sys-tms', { vCores: '0.5' }],
        se: ['system-api', 'sys-erp-billing'],
        tms: ['tms', 'Transport management'],
        erp: ['erp', 'ERP billing'],
        mon: ['monitoring', 'Anypoint Monitoring: per-API metrics'],
      },
      [
        'p -> portal', 'p -> gw', 'gw -> et', 'gw -> er', 'gw -> es', 'et -> pr', 'er -> pr', 'es -> pr',
        'pr -> st', 'pr -> se', 'st -> tms', 'se -> erp', 'gw -> mon',
      ],
    ),
    simulation: {
      systems: [{ match: 'tms', latencyMs: 150 }],
      tests: [
        {
          name: 'A partner goes over its plan',
          about: 'A partner on the Base plan sends 300 calls a second, far more than its 50. The calls over the plan get 429, and the rest are answered. Nothing fails with an error.',
          traffic: [{ name: 'base plan', from: 'partner', rps: 300, to: 'tms', auth: 'client-id' }],
          expect: { answers: [{ minLimited: 0.7, maxFailed: 0.01 }] },
        },
        {
          name: 'Calls without a client id',
          about: 'Partners with a contract call at 30 a second with their client id. Callers with no client id are refused, because every call must belong to an application with a contract.',
          traffic: [
            { name: 'contract', from: 'partner', rps: 30, to: 'tms', auth: 'client-id' },
            { name: 'no client id', from: 'partner', rps: 10, to: 'tms', auth: 'none' },
          ],
          expect: {
            answers: [
              { flow: 'contract', minSuccess: 0.99 },
              { flow: 'no client id', minRefused: 0.99 },
            ],
          },
        },
      ],
    },
  },
  description: `
A parcel carrier has five APIs in API Manager: **Tracking**, **Rates**, **Shipments**, **Pickup Points** and **Returns**. Partners complain that they must find each API, request access to each one, and manage five contracts.

Product wants to sell three plans:

| Plan | APIs | Limit | Approval |
|---|---|---|---|
| Trial | Tracking, Rates | 10 per second on all | Automatic |
| Base | Tracking, Rates, Shipments, Pickup Points | 50 per second; Shipments only 20 per second | Manual |
| Enterprise | All five | 200 per second and 2 million per day | Manual |

Constraints:
- Some APIs are owned by a second business group.
- Two APIs use an external identity provider for client management, and the others use Anypoint.
- 300 partners already have direct contracts with Tracking at 100 per second.
- The team wants a Sandbox version of each plan, promoted later to Production.
- Behind the APIs, Tracking, Rates and Shipments share one Process API, which reaches the transport management system (TMS) and the ERP billing system through System APIs.

For the Run tab:
- A Base partner may call at 50 per second. A partner that sends 300 a second must get 429 for the calls over its plan, not 503 errors from overloaded APIs.
- Every call must carry the client id of an application with a contract; a call without one is refused.
- The TMS answers in about 150 ms.

**Questions:**
- Draw the runtime path for partners and say where API Groups fit.
- How do you model the plans with API Groups, versions, group instances and SLA tiers?
- Which constraints affect what can go in a group?
- What happens to a partner with both a direct Tracking contract and a group contract?
- How do you promote and retire a plan?
`,
  answerTemplate: `## Target architecture

## Modelling the plans

## Constraints on group membership

## Direct and group contracts

## Promotion and retirement
`,
  keyPoints: [
    'An API Group bundles API instances so that a consumer requests access once. It is a packaging layer in API Manager and Exchange; runtime traffic still goes to each API instance.',
    'Hierarchy: API Group, version, group instance (per environment), API instances. Publish to Exchange so that consumers can discover it.',
    'All instances in a group instance must be of the same environment type and use the same identity provider; IdPs cannot be mixed. Instances from another business group are added with Add Organization.',
    'SLA tiers on a group instance have default limits for all APIs and individual limits that override them for one API. Layered limits are supported.',
    'If an app has several contracts with the same API, only one is Applied: the least restrictive approved contract.',
    'Promotion needs the APIs in the destination first, and it copies only the default limits of tiers.',
    'Deprecating a group instance stops new contracts, and it does not deprecate the Exchange asset.',
    'At run time the SLA limit answers 429 to calls over the plan before they reach the APIs, and Client ID Enforcement refuses calls with no client id. Size the APIs for what the plan lets through, not for what a partner sends.',
  ],
  solution: `
**Architecture.**
\`\`\`
 Partner apps ─► Exchange public portal (API Group assets; request access)
      │
      └─► Mule Gateway (policies on each API instance) ─► exp-tracking ─┐
                                                       ─► exp-rates    ─┼─► prc-shipment ─► sys-tms ─► TMS
                                                       ─► exp-shipments ┘               └─► sys-erp-billing ─► ERP
                                     └─► Anypoint Monitoring
\`\`\`
An API Group is not a runtime component. It is drawn here as the assets on the portal. Calls still go to each API's own endpoint.

**Modelling.** Create groups such as \`Parcel Trial\`, \`Parcel Base\` and \`Parcel Enterprise\`, with version \`v1\`. The docs' own example sells Trial, Base and Enterprise packages this way. Each has group instances: \`QA\` in Sandbox and \`PROD\` in Production. Each instance lists the API instances of that environment type. Publishing the first instance creates the Exchange asset; publishing another instance of the same group and version links to that asset.

For Base, one SLA tier has a **default** limit of 50 per second, and an **individual** limit of 20 per second for Shipments. The individual limit overrides the default. A new API added later gets the default. Enterprise uses a **layered** tier with both limits. Trial uses automatic approval; the others manual.

If a Rate Limiting policy is also on an API instance, the group administrator must check that the instance can really give the promised limit.

**Constraints.** A group instance can hold only instances from the same environment type and the **same identity provider**. The two APIs with an external IdP cannot share a group instance with the others. So either align the client provider or build separate groups. For the second business group, use **Add Organization** to select instances from it. The API Group Administrator permission is set at business group level.

**Direct and group contracts.** An app can have a direct contract and a group contract on the same API. Only one is **Applied**: the **least restrictive** approved contract. If a partner has Tracking at 100 per second directly and a Base contract at 50 per second, then the direct contract stays applied for Tracking. Moving them to the plan does not lower their limit. To enforce the plan, the direct contract must be revoked, because a revoked contract cannot be applied.

**At run time.** The gateway enforces the contract: Client ID Enforcement refuses a call with no client id, and the SLA limit (50 per second for Base) answers 429 to what is over the plan. Without the limit, a partner sending 300 a second pushes the Experience APIs over capacity and most calls fail with 503, for that partner and for everyone sharing \`prc-shipment\`. The APIs are sized for what the plans let through: 0.2 vCore for each Experience API and 0.5 for \`prc-shipment\` and \`sys-tms\`, which every Experience API calls.

**Promotion and retirement.** Promote with **API Groups > Promote from environment**. The APIs must already exist in the destination. To include tiers, tick **Import default limits from existent SLA Tiers**, but only the **default limits** are promoted, so individual limits such as Shipments must be set again. To retire a plan, deprecate the group instance: new contracts stop. This does not deprecate the Exchange asset, which you do separately.
`,
  followUps: [
    { q: 'Why does the diagram show a gateway and not the API Group?', a: 'API Groups package instances for access and contracts. Requests are still handled per API. Portal assets and contracts are where the group exists, and the architecture catalog here has no separate node for it.' },
    { q: 'What are the platform limits?', a: 'Per business group: 1,200 API Groups, 1,200 group versions and 2,000 group instances. An API Group can have up to 100 REST API dependencies in Exchange.' },
    { q: 'Who can do this work?', a: 'The API Group Administrator permission, set at business group level, allows creating, updating and deleting groups, viewing all instances, and configuring SLA tiers and contracts.' },
    { q: 'When would you not use an API Group?', a: 'When each API has different consumers and no shared plan, or when instances use different identity providers. Direct contracts then do the job with less to manage.' },
  ],
}
