import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-058',
  category: 'use-cases',
  title: 'API-Led with Security Zones: Government Benefits Platform',
  level: 'EXPERT',
  tags: ['api-led', 'application-network', 'government', 'security-zones', 'runtime-fabric', 'hybrid'],
  estMinutes: 55,
  diagram: {
    task: 'draw the benefits application network across the security zones: external channels through the edge gateway, public-zone Experience APIs (with token exchange), internal Process APIs including delegation and async income changes, and System APIs in front of the restricted systems and ECM.',
    checks: [
      { label: 'Citizens, intermediaries and other agencies all enter through the edge gateway (WAF / Flex Gateway)', rule: { type: 'each', of: ['web-app', 'mobile-app', 'partner'], min: 3, edgeTo: ['api-gateway', 'load-balancer'] } },
      { label: 'Nothing from the internet or the edge goes straight to Process or System APIs', rule: { type: 'no-edge', from: ['api-gateway', 'load-balancer', 'web-app', 'mobile-app', 'partner'], to: ['process-api', 'system-api'] } },
      { label: 'The citizen Experience API exchanges the eID token for an internal token', rule: { type: 'edge', from: 'experience-api', to: 'identity-provider' } },
      { label: 'Every Experience API calls the internal-zone Process APIs', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Public-zone Experience APIs never call the restricted System APIs (mainframe, register, payments)', rule: { type: 'no-edge', from: 'experience-api', to: { type: 'system-api', label: ['mainframe', 'register', 'payment'] } } },
      { label: 'Delegations are checked by a dedicated Process API', rule: { type: 'edge', from: ['process-api', 'experience-api'], to: { type: 'process-api', label: ['delegat'] } } },
      { label: 'Restricted systems and the ECM are reached only through System APIs', rule: { type: 'only-via', target: ['legacy', 'database', 'payment', 'file-store'], from: 'system-api' } },
      { label: 'Tax-authority income changes are queued and processed asynchronously', rule: { type: 'path', from: 'experience-api', via: ['queue', 'topic'], to: 'process-api' } },
    ],
    reference: diagram(
      {
        portal: ['web-app', 'Citizen portal / app'],
        inter: ['partner', 'Intermediaries (charities, municipalities)'],
        agency: ['partner', 'Tax authority / municipalities'],
        cw: ['internal-app', 'Caseworker workbench'],
        gw: ['api-gateway', 'WAF + Flex Gateway (public edge)'],
        sts: ['identity-provider', 'eID provider / agency STS'],
        ec: ['experience-api', 'exp-citizen-benefits'],
        ei: ['experience-api', 'exp-intermediary-benefits'],
        ea: ['experience-api', 'exp-agency-gateway'],
        ecw: ['experience-api', 'exp-caseworker'],
        pel: ['process-api', 'prc-eligibility'],
        pcl: ['process-api', 'prc-benefit-claims'],
        pdel: ['process-api', 'prc-delegation'],
        pinc: ['process-api', 'prc-income-changes'],
        q: ['queue', 'income-change-notifications'],
        smf: ['system-api', 'sys-benefits-mainframe'],
        sreg: ['system-api', 'sys-citizen-register'],
        spay: ['system-api', 'sys-payments'],
        sdoc: ['system-api', 'sys-documents'],
        mf: ['legacy', 'Benefits mainframe (CICS)'],
        db2: ['database', 'Citizen register replica (Db2)'],
        tre: ['payment', 'Treasury (MFT batch)'],
        ecm: ['file-store', 'ECM + malware scan'],
      },
      [
        'portal -> gw', 'inter -> gw', 'agency -> gw', 'gw -> ec', 'gw -> ei', 'gw -> ea', 'cw -> ecw',
        'ec -> sts', 'ec -> pel', 'ec -> pcl', 'ec -> sdoc', 'ei -> pel', 'ei -> pcl', 'ei -> pdel', 'ea ~> q', 'ea -> pcl', 'q ~> pinc', 'pinc -> pcl', 'ecw -> pcl',
        'pcl -> pdel', 'pcl -> pel', 'pel -> sreg', 'pcl -> smf', 'pcl -> spay', 'pcl -> sdoc', 'smf -> mf', 'sreg -> db2', 'spay -> tre', 'sdoc -> ecm',
      ],
    ),
  },
  description: `
A national social-security agency is building a digital platform for **benefit claims** (first: housing benefit). Security architecture mandates **three network zones**, and data classification rules are strict.

| Zone | What may run there | Rules |
|---|---|---|
| **Public zone** (internet-facing, cloud) | Anything called by citizens or external parties | No persistent storage of personal data; only gateway-validated traffic passes inward |
| **Internal zone** (agency private cloud / data centre) | Business logic, case orchestration | Reachable only from the public zone via a controlled ingress with mTLS; may call the restricted zone |
| **Restricted zone** (on-prem data centre) | Systems of record: benefits mainframe, payments, citizen register replica | No inbound connection from the public zone; only named service identities from the internal zone; data never leaves the country |

| Channel | Users | Needs |
|---|---|---|
| **Citizen portal** (web) + app | ~4 M citizens, login with national eID (OpenID Connect) | Check eligibility, apply, upload documents, track claim, report changes |
| **Caseworker workbench** (internal) | 6,000 staff | Assess claims, request evidence, decide |
| **Intermediaries** (registered welfare charities, municipalities) | ~900 organisations | Apply/track **on behalf of** a citizen with the citizen's **delegated consent** |
| **Other agencies** (tax authority, municipalities) | Systems | Tax authority **pushes** income changes; municipalities query claim status for rent subsidies |

| System | Zone | Interface |
|---|---|---|
| Benefits case system (IBM z/OS mainframe, CICS) | Restricted | CICS transactions via IBM CTG / MQ |
| Payments (treasury batch interface) | Restricted | Files via managed file transfer, daily |
| Citizen register replica (Db2) | Restricted | JDBC |
| Document management (ECM) + malware scanning | Internal | REST |
| Tax authority income API | External | REST, mTLS, government PKI |
| National eID provider | External | OIDC |

Volumes: 25,000 eligibility checks/day (peaks after TV campaigns: 50/s), 6,000 applications/day, 40,000 documents/day.

**Questions:**
1. Design the API-led network and **place every API in a zone**. What runtime/deployment model do you use (CloudHub 2.0, Runtime Fabric, Flex Gateway, hybrid)?
2. Describe the "citizen applies for housing benefit" sequence across zones, including identity propagation.
3. How do intermediaries act on behalf of citizens securely?
4. How do you handle document upload without breaking the "no personal data at rest in the public zone" rule?
5. Which controls and NFRs are essential (audit, residency, availability)?
`,
  answerTemplate: `## APIs per layer and zone

## Deployment model (control plane, runtimes, gateways)

## Interactions & sequence (apply for housing benefit)

## Identity propagation and delegation (intermediaries)

## Documents

## Inbound from other agencies

## Security controls, audit and NFRs

## Reuse for the next benefit
`,
  keyPoints: [
    'Experience APIs in the public zone (citizen, intermediary, agency) behind an internet-facing gateway; Process APIs in the internal zone; System APIs in the restricted zone on Runtime Fabric or hybrid runtimes — the API-led layers map naturally onto the security zones.',
    'Zone crossings only through gateways with mTLS and allow-listing: public → internal via a private ingress (Flex Gateway / RTF ingress), internal → restricted via named service identities; restricted never accepts calls from the public zone.',
    'Citizen identity: national eID (OIDC) token validated at the edge, then exchanged for an internal token carrying a pseudonymous subject + claims (token exchange / internal STS), so raw eID tokens and national IDs are not propagated outward-in more than necessary.',
    'Intermediaries authenticate as organisations and must present a valid delegation (citizen consent with scope and expiry) checked in a Process API (prc-delegation) on every call.',
    'Documents streamed through to the internal zone (malware scan + ECM) without being stored in the public zone; or direct upload to an internal quarantine via a short-lived pre-authorised URL proxied by the gateway.',
    'Data residency: control plane choice (e.g. EU control plane / Government Cloud or a fully on-prem Anypoint Platform Private Cloud Edition if mandated) and all runtimes in-country; immutable audit of every access to citizen data.',
  ],
  solution: `
**APIs per layer and zone**

| Layer | API | Zone / runtime | Key resources | Responsibility | Consumers |
|---|---|---|---|---|---|
| Experience | **exp-citizen-benefits** | Public — CloudHub 2.0 private space (in-country region) or RTF in a cloud VPC, behind WAF | \`GET /me/eligibility\`, \`POST /me/claims\`, \`POST /me/claims/{id}/documents\`, \`GET /me/claims\` | Citizen journeys, eID token validation | Portal, app |
| Experience | **exp-intermediary-benefits** | Public | \`POST /citizens/{ref}/claims\`, \`GET /citizens/{ref}/claims\` | Org auth + delegation reference | Charities, municipalities' case tools |
| Experience | **exp-agency-gateway** | Public (mTLS, gov PKI) | \`POST /income-change-notifications\`, \`GET /claims/{ref}/status\` (municipalities) | B2G contracts | Tax authority, municipalities |
| Experience | **exp-caseworker** | Internal — RTF | \`GET /worklist\`, \`POST /claims/{id}/decisions\` | Internal UI shaping (staff SSO) | Caseworker workbench |
| Process | **prc-eligibility** | Internal — RTF | \`POST /eligibility-assessments\` | Rules (income, household, rent) using register + tax data | exp-citizen, exp-intermediary |
| Process | **prc-benefit-claims** | Internal — RTF | \`POST /claims\`, \`GET /claims/{id}\`, \`POST /claims/{id}/evidence\` | Claim lifecycle, create case in mainframe, task for caseworkers, notifications | Experience APIs |
| Process | **prc-delegation** | Internal — RTF | \`GET /delegations/{id}\`, \`POST /delegations\` (citizen grants in portal) | Delegation registry: who may act for whom, scope, expiry | exp-intermediary, prc-benefit-claims |
| Process | **prc-income-changes** (event-driven) | Internal — RTF | consumes tax notifications | Match to claims, trigger reassessment | — |
| System | **sys-benefits-mainframe** | Restricted — RTF on-prem (or hybrid Mule runtime) | \`POST /cases\`, \`GET /cases/{id}\`, \`PUT /cases/{id}/decision\` | Wrap CICS via CTG/MQ, copybook mapping | Process APIs |
| System | **sys-citizen-register** | Restricted — RTF on-prem | \`GET /persons/{pseudoId}\`, \`GET /households/{id}\` | Wrap Db2 replica | prc-eligibility, prc-benefit-claims |
| System | **sys-payments** | Restricted — RTF on-prem | \`POST /payment-instructions\` (batched to treasury file) | Wrap MFT file interface | prc-benefit-claims |
| System | **sys-documents** | Internal — RTF | \`POST /documents\` (scan → ECM) | Wrap malware scan + ECM | prc-benefit-claims |
| System | **sys-tax-income** | Internal (egress via forward proxy) | \`GET /persons/{id}/income\` | Wrap tax authority API with gov PKI client cert | prc-eligibility |

\`\`\`
 INTERNET
   [Citizen portal/app]   [Intermediaries]   [Tax authority / municipalities]
           |                    |                       |  (mTLS, gov PKI)
 ==========|=== WAF / Flex Gateway (edge) ==============|=========================
 PUBLIC    | exp-citizen-benefits   exp-intermediary-benefits   exp-agency-gateway
 ZONE      |            (CloudHub 2.0 private space / RTF, no data at rest)
 ==========|=== private ingress, mTLS, allow-list =====================================
 INTERNAL  | prc-eligibility  prc-benefit-claims  prc-delegation  prc-income-changes
 ZONE      | exp-caseworker   sys-documents   sys-tax-income     (Runtime Fabric)
           |                              |
 ==========|=== restricted ingress: named service identities only ====================
 RESTRICTED| sys-benefits-mainframe   sys-citizen-register   sys-payments
 ZONE      |      |  CTG/MQ               |  Db2                |  MFT
           |  [z/OS CICS]            [Db2 replica]         [Treasury]
\`\`\`

**Deployment model.**
- **Control plane**: an in-region control plane meeting residency rules (e.g. EU control plane; MuleSoft Government Cloud where applicable) — or **Anypoint Platform Private Cloud Edition** if policy forbids any external control plane. Only metadata (not payloads) flows to a hosted control plane; runtimes stay in-country.
- **Public zone**: CloudHub 2.0 private space or RTF in a cloud VPC, fronted by WAF + **Flex Gateway** for policy enforcement (JWT validation, rate limiting, threat protection, IP allowlists for agencies).
- **Internal and restricted zones**: **Runtime Fabric** clusters on the agency's own infrastructure (separate clusters per zone — never one cluster spanning zones), with mainframe connectivity via IBM CTG/MQ connectors from the restricted cluster.
- Zone crossings: mTLS with certificates per calling app; restricted ingress only allows identities of the internal Process APIs.

**Sequence — citizen applies for housing benefit**
1. Citizen logs in with national eID (OIDC authorisation code + PKCE); portal calls exp-citizen-benefits \`POST /me/claims\` with the access token.
2. Edge gateway: JWT validation against eID provider keys, rate limiting, payload threat protection.
3. exp-citizen-benefits performs **token exchange** with the agency STS: receives an internal token (subject = **pseudonymous citizen ID**, claims: assurance level, channel, scopes \`claims:create\`), short lifetime. The national ID number isn't sent in the clear through the public zone.
4. → prc-benefit-claims (internal, mTLS): validates the internal token, runs prc-eligibility (calls sys-citizen-register for household, sys-tax-income for income).
5. prc-benefit-claims → sys-benefits-mainframe \`POST /cases\` (restricted zone, service identity) → case ID; creates caseworker task; publishes \`ClaimSubmitted\` on an internal queue (notifications, analytics).
6. Response \`201 { claimRef }\` flows back; nothing persisted in the public zone. Every step writes an **audit event** (who, on whose behalf, what, when, correlation ID) to an append-only audit store in the internal zone.

**Intermediaries.** Organisations authenticate with OAuth client credentials + mTLS (org certificate); their staff are identified (user claim) for audit. The citizen creates a **delegation** in the portal (prc-delegation: intermediary org, scope e.g. \`apply, track\`, expiry). exp-intermediary-benefits passes the delegation ID; prc-benefit-claims checks with prc-delegation on **every** call that the delegation is active and covers the operation — enforcement lives in the internal zone, not only at the edge. Citizens can see and revoke delegations.

**Documents.** The Experience API **streams** the upload (non-repeatable stream, size limit) straight to sys-documents in the internal zone, which scans for malware and stores in ECM; the public-zone runtime never writes the file to disk or Object Store. Alternatively a short-lived, single-use upload URL to an internal quarantine bucket exposed through the gateway. Either way: content-type/size checks at the edge, malware scan before any caseworker access.

**Inbound from other agencies.** Tax authority pushes income changes to exp-agency-gateway (mTLS with government PKI, signed payloads); the API acknowledges after placing the message on a persistent internal queue; prc-income-changes processes asynchronously and triggers reassessments. Municipalities' status queries return minimal data (status only) and require a legal-basis scope.

**Controls and NFRs.**
- **Least privilege per hop**: each API has its own client identity and only the contracts it needs (API Manager contracts + policies; automated policies per environment).
- **Data minimisation**: Experience APIs expose only what each channel needs; logs mask personal data; no payload logging in the public zone.
- **Availability**: public zone multi-AZ; internal/restricted RTF clusters with multiple nodes; mainframe maintenance windows → claims accepted and queued (\`202\`) with eventual case creation, eligibility checks degrade gracefully.
- **Peaks** (50/s after campaigns): autoscaling in the public zone, caching of rule tables in prc-eligibility, Spike Control in front of sys-benefits-mainframe (MIPS cost and capacity).
- Pen-tests and threat modelling per zone crossing; secrets in a vault/secure properties; separate environments per zone for non-prod with synthetic data.

**Reuse for the next benefit (e.g. childcare benefit).** New rules in prc-eligibility (or a new rules set), new resources in exp-citizen-benefits; prc-delegation, sys-benefits-mainframe, sys-citizen-register, sys-documents, sys-payments, the identity/token-exchange pattern and the whole zone/deployment model are reused as-is.
`,
  followUps: [
    { q: 'Why not deploy Process APIs in the public zone to save a network hop?', a: 'Process APIs combine data from restricted systems and hold business rules; placing them in the public zone would require restricted systems to accept calls from an internet-facing zone, violating the zoning model. The extra hop costs milliseconds; the security boundary is worth far more.' },
    { q: 'Why exchange the eID token instead of passing it through?', a: 'The external token is issued for the portal audience and may carry the national ID number. An internal token with a pseudonymous subject, internal audience and short lifetime limits exposure and lets internal APIs trust one issuer.' },
    { q: 'Could one Runtime Fabric cluster serve both internal and restricted zones?', a: 'Not under this zoning model: a cluster spanning zones would create a network path around the controlled ingress. Separate clusters per zone, with traffic only via the defined gateways, keep the zones meaningful.' },
    { q: 'What happens if the control plane is unreachable?', a: 'Deployed runtimes and gateways keep processing traffic with the last applied policies; you lose deployments, policy changes and some monitoring until it returns. This is one reason to evaluate Private Cloud Edition for the most sensitive deployments.' },
  ],
}
