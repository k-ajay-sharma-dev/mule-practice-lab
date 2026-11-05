import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-006',
  category: 'case-studies',
  title: 'Bank Launching an Open Banking API Program',
  level: 'EXPERT',
  tags: ['open-banking', 'security', 'oauth', 'consent', 'api-management'],
  estMinutes: 60,
  diagram: {
    task: 'draw the open banking target architecture: TPPs and premium partners, the DMZ gateway and IdP, the AIS/PIS Experience APIs, the accounts, payments and consent Process APIs, and the protected path to the mainframe.',
    checks: [
      { label: 'Every TPP and partner enters through the API gateway (mTLS, SLA-tier rate limits)', rule: { type: 'each', of: 'partner', edgeTo: 'api-gateway' } },
      { label: 'Separate Experience APIs for account information and payment initiation', rule: { type: 'node', match: 'experience-api', min: 2 } },
      { label: 'Strong customer authentication is delegated to the bank identity provider', rule: { type: 'edge', from: ['api-gateway', 'experience-api', 'process-api'], to: 'identity-provider' } },
      { label: 'A consent Process API owns the consent store', rule: { type: 'edge', from: { type: 'process-api', label: ['consent'] }, to: ['database', 'cache'] } },
      { label: 'Both AIS and PIS check consent on every call', rule: { type: 'edge', from: 'experience-api', to: { type: 'process-api', label: ['consent'] }, min: 2 } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The mainframe core and cards platform are reached only through System APIs', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Read-heavy account data is served from a cache/read store to protect the mainframe', rule: { type: 'edge', from: ['process-api', 'system-api'], to: ['cache', 'database'] } },
    ],
    reference: diagram(
      {
        tpp: ['partner', 'Licensed TPP (regulator-issued cert)'],
        prem: ['partner', 'Premium partner'],
        gw: ['api-gateway', 'DMZ gateway (mTLS, OAuth, SLA tiers)'],
        idp: ['identity-provider', 'Bank IdP (SCA)'],
        eais: ['experience-api', 'ob-accounts-eapi (AIS)'],
        epis: ['experience-api', 'ob-payments-eapi (PIS)'],
        epv: ['experience-api', 'partner-verification-eapi'],
        pacc: ['process-api', 'accounts-papi'],
        ppay: ['process-api', 'payments-papi'],
        pcon: ['process-api', 'consent-papi'],
        cons: ['database', 'Consent store'],
        rs: ['cache', 'Balance cache / read store'],
        score: ['system-api', 'core-banking-sapi'],
        scard: ['system-api', 'cards-sapi'],
        core: ['legacy', 'Mainframe core (CICS via ESB)'],
        cards: ['legacy', 'Cards platform'],
      },
      [
        'tpp -> gw', 'prem -> gw', 'gw -> idp',
        'gw -> eais', 'gw -> epis', 'gw -> epv',
        'eais -> pacc', 'eais -> pcon', 'epis -> ppay', 'epis -> pcon', 'epv -> pacc', 'epv -> pcon',
        'pcon -> cons', 'pacc -> rs', 'pacc -> score', 'pacc -> scard', 'ppay -> score',
        'score -> core', 'scard -> cards',
      ],
    ),
  },
  description: `
**Context.** A retail bank must expose **account information** (balances, transactions) and **payment initiation** APIs to licensed third-party providers (TPPs) under open-banking regulation, and also wants a commercial "premium" API product for partners (e.g. instant account verification).

**Current landscape**
- Core banking on a mainframe (CICS transactions via an existing ESB), cards on a separate platform.
- Online banking login and strong customer authentication (SCA) handled by an existing identity provider (IdP).
- The bank already uses Anypoint Platform internally.

**Requirements**
- Regulatory deadline in 9 months; availability and performance are reported to the regulator.
- TPPs identify themselves with regulator-issued certificates; customers must give and can revoke **consent** per TPP, per account, with an expiry.
- Fair usage: TPPs must not overload the core; premium partners get higher limits.
- A developer portal and sandbox for TPPs.

**Your task.** Propose the target architecture and delivery plan. Cover API design, security and consent, traffic management, the path to the mainframe, operations/reporting, and the main risks.
`,
  answerTemplate: `## Target architecture

## API design and products

## Security: TPP identity, customer auth, consent

## Traffic management and protecting the core

## Developer experience (portal, sandbox, onboarding)

## Operations, monitoring and regulatory reporting

## Delivery plan and risks
`,
  keyPoints: [
    'Layers APIs: Experience/Open Banking APIs (AIS, PIS) → Process APIs (accounts, payments, consent) → System APIs (core banking via ESB/CICS, cards), all behind a gateway in a DMZ.',
    'TPP authentication with mTLS using regulator-issued certificates plus OAuth 2.0 (FAPI-style profile) with the existing IdP doing SCA; tokens are bound to client and consent.',
    'A dedicated consent service/store: consent per TPP, account and permission, with expiry and revocation, checked on every call (token alone is not enough).',
    'Traffic management via API Manager policies: client ID/JWT/OAuth enforcement, SLA-tiered rate limiting (regulatory vs premium), spike control, plus caching/read replicas so AIS calls do not hammer the mainframe.',
    'Payment initiation is idempotent (idempotency key) and has a clear status model, since TPP retries must never create double payments.',
    'Developer portal (Exchange/API portal) with sandbox and mock data, automated TPP onboarding; monitoring of availability/latency per endpoint for regulatory reports; audit logs without sensitive data in plain text.',
  ],
  solution: `
**Target architecture.**
- **Edge**: API gateway (Mule gateway / Flex Gateway) in a DMZ, behind WAF/DDoS protection; mTLS terminated with certificate checks against the regulator's trust list.
- **Experience layer**: \`ob-accounts-eapi\` (AIS) and \`ob-payments-eapi\` (PIS) matching the national open-banking spec (or the bank's chosen standard), plus \`partner-verification-eapi\` for the premium product.
- **Process layer**: \`accounts-papi\`, \`payments-papi\`, \`consent-papi\`.
- **System layer**: \`core-banking-sapi\` (through the existing ESB/CICS), \`cards-sapi\`, \`idp-sapi\`. These are reused by the bank's own channels later.

**Security and consent.**
- **TPP identity**: mTLS with regulator-issued certificates + OAuth 2.0 client registration (dynamic client registration if the standard requires it). Tokens are **certificate-bound** to the TPP.
- **Customer auth**: OAuth 2.0 authorization code flow (FAPI-style profile, PKCE/signed requests as the standard requires) redirecting to the bank's IdP for **SCA**.
- **Consent**: a consent store owned by \`consent-papi\` — consent ID, TPP, accounts, permissions, expiry, status. Customers revoke it in online banking. Every AIS/PIS call checks token **and** consent is valid for that account and permission.
- Payments: **idempotency key** per request, a payment status resource the TPP polls (or gets notified on), and fraud checks before submission.

**Traffic management.**
- API Manager policies: OAuth/JWT validation, client ID enforcement, **SLA-tier rate limiting** (regulatory tier vs premium partners), spike control, payload/size limits, IP/threat protection.
- Protect the mainframe: cache/replicate read-heavy data (balances with short TTL, transaction history from a read store/CDC replica) so AIS polling by TPPs doesn't reach CICS on every call. Timeouts and circuit-breaker behaviour toward the core.

**Developer experience.** Public developer portal (Exchange public portal / API Experience Hub) with:
- Specs and guides.
- A **sandbox** backed by mock data (mocking service or a sandbox implementation).
- Test certificates.
- An onboarding flow that checks the TPP's licence before granting production access.

**Operations and reporting.** Anypoint Monitoring dashboards and alerts per endpoint (availability, p95/p99 latency, error rates), split by TPP; data exported for **regulatory KPI reports**. Correlation IDs end to end; audit log of consent and data access; mask account numbers and personal data in logs. Run active/active or multi-AZ for the availability target, with tested failover.

**Delivery plan (9 months).**
1. Months 0–2: pick the standard, design specs in Exchange, security architecture with the IdP team, consent model, System API for core banking.
2. Months 2–5: AIS end to end in sandbox, then production with friendly TPPs; consent service; portal.
3. Months 5–8: PIS with idempotency and fraud checks; performance and penetration testing; conformance testing against the standard.
4. Month 8–9: go-live, hypercare. Premium product afterwards on the same layers.

**Risks.**
- Mainframe capacity (mitigate with caching/read store and strict rate limits).
- IdP/SCA integration delays.
- Getting the consent model wrong (involve compliance early).
- Certificate lifecycle (expiring TPP or bank certs → automate renewal/alerts).
- Security testing findings late in the plan.
`,
}
