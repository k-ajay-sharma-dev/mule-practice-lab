export default {
  id: 'inc-052',
  category: 'incidents',
  title: 'Client ID Enforcement on a System API Locks Out Its Own Process APIs',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'client-id-enforcement', 'api-manager', 'contracts', 'environments'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '19:02:14.551 INFO  [sys-hr-api gateway] Policy client-id-enforcement applied to API instance (prod)', relevant: true, why: 'The failures start right after the policy is applied on the prod System API instance.' },
      { text: '19:02:40.100 INFO  [sys-hr-api]        GET /health 200 (2 ms)', relevant: false },
      { text: '19:03:01.207 WARN  [sys-hr-api gateway] Request rejected: 401 no client credentials provided corrId=21aa-0c', relevant: true, why: 'prc-payroll-api sends no client_id/client_secret at all; the gateway rejects it before the flow.' },
      { text: "19:03:01.215 ERROR [prc-payroll-api]   HTTP:UNAUTHORIZED HTTP GET on resource 'https://sys-hr-api.internal/api/workers/W-2231' failed: unauthorized (401). corrId=21aa-0c", relevant: false },
      { text: '19:03:05.880 WARN  [sys-hr-api gateway] Request rejected: 401 invalid client credentials corrId=88f3-41', relevant: true, why: 'prc-onboarding-api sends credentials, but they are the sandbox client app copied into prod.yaml, with no contract on the prod instance.' },
      { text: "19:03:05.884 ERROR [prc-onboarding-api] HTTP:UNAUTHORIZED HTTP POST on resource 'https://sys-hr-api.internal/api/workers' failed: unauthorized (401). corrId=88f3-41", relevant: false },
      { text: '19:03:05.886 ERROR [prc-onboarding-api] Returning 500 to exp-hr-portal-api corrId=88f3-41', relevant: true, why: 'The Process API reports its own credential problem as a 500 to the portal; the real break is at the System API gateway.' },
      { text: '[api-manager] sys-hr-api (prod) contracts: 0 approved client applications', relevant: true, why: 'No consumer was onboarded in production, so every caller is rejected.' },
    ],
    questions: [
      {
        type: 'match',
        prompt: 'Match each caller to why it fails.',
        pairs: [
          ['prc-payroll-api', 'Sends no credentials at all'],
          ['prc-onboarding-api', 'Sends sandbox credentials with no contract on the prod instance'],
          ['Sandbox test "worked"', 'Only onboarding was tested, with a sandbox client that had a sandbox contract'],
        ],
        explain: 'Contracts are with a specific API instance, and instances are per environment, so sandbox success says nothing about prod.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now**?',
        options: [
          'Remove the policy from the prod sys-hr-api instance, tell security it is temporarily rolled back with a re-apply date, and replay failed transactions',
          'Copy the sandbox client app credentials into prc-payroll-api too',
          'Allow anonymous access permanently',
          'Restart both Process APIs',
        ],
        answer: 0,
        explain: 'Restore onboarding and payroll quickly; the audit finding stays open and is fixed properly. Sandbox credentials are not valid for prod.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **correct set-up**?',
        options: [
          'One client application per consumer per environment, e.g. prc-payroll-api-prod',
          'Contract requested and approved for each environment\'s API instance',
          'client_id/client_secret as secure properties per environment, never copied between environments',
          'One shared client application for all Process APIs in all environments',
        ],
        answer: [0, 1, 2],
        explain: 'Separate, clearly named client apps keep credentials, access and analytics isolated per consumer and environment.',
      },
      {
        type: 'order',
        prompt: 'Order the rollout for re-applying the policy.',
        items: [
          'Find all callers via API analytics, logs and contracts',
          'Create client apps and contracts per caller per environment',
          'Deploy the credentials to every caller before enforcement',
          'Apply in sandbox with all callers tested',
          'Apply in prod in a change window with a rollback plan',
        ],
        explain: 'Onboard every consumer first, verify, then enforce.',
      },
    ],
  },
  description: `
## Symptoms
- Tuesday 19:00, the security team applies a **Client ID Enforcement** policy to \`sys-hr-api\` in **production** after an audit finding ("internal APIs accept anonymous calls").
- Within minutes, \`prc-onboarding-api\` and \`prc-payroll-api\` start failing; new-joiner onboarding in the HR portal shows errors.
- The same policy was applied in **sandbox** last week and "everything worked".

## Change / Context
- \`sys-hr-api\` (Workday) has two callers: \`prc-onboarding-api\` and \`prc-payroll-api\`.
- In sandbox, only \`prc-onboarding-api\` had been tested, and its developer had already added \`client_id\`/\`client_secret\` headers using the **sandbox** client application credentials.
- In production, \`prc-onboarding-api\` properties still contain the **sandbox** client ID (it was copied into \`prod.yaml\`), and \`prc-payroll-api\` sends **no** credentials at all.
- No client applications in production have a contract with the production \`sys-hr-api\` instance.

## Logs
\`\`\`
19:02:14.551 INFO  [sys-hr-api gateway] Policy client-id-enforcement applied to API instance (prod)
19:03:01.207 WARN  [sys-hr-api gateway] Request rejected: 401 no client credentials provided corrId=21aa-0c
19:03:01.215 ERROR [prc-payroll-api]   HTTP:UNAUTHORIZED HTTP GET on resource 'https://sys-hr-api.internal/api/workers/W-2231' failed: unauthorized (401). corrId=21aa-0c
19:03:05.880 WARN  [sys-hr-api gateway] Request rejected: 401 invalid client credentials corrId=88f3-41
19:03:05.884 ERROR [prc-onboarding-api] HTTP:UNAUTHORIZED HTTP POST on resource 'https://sys-hr-api.internal/api/workers' failed: unauthorized (401). corrId=88f3-41
19:03:05.886 ERROR [prc-onboarding-api] Returning 500 to exp-hr-portal-api corrId=88f3-41
\`\`\`

## Your tasks
1. Explain why each Process API fails and why sandbox "worked".
2. What do you do right now?
3. What is the root cause?
4. Describe the correct set-up of client apps, contracts and credentials per environment.
5. How should such a policy be rolled out next time?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Explains Client ID Enforcement: the gateway checks client_id/client_secret (by default from the client_id/client_secret headers; configurable as Basic auth or a custom expression) against client applications that have an approved contract with that specific API instance.',
    'prc-payroll-api fails because it sends no credentials; prc-onboarding-api fails because it sends sandbox credentials, and no prod client application has a contract with the prod instance.',
    'Immediate: remove/disable the policy in prod (or apply it to a test instance) to restore service, then prepare credentials and contracts before re-applying.',
    'Permanent fix: one client application per consuming app per environment, contract requested and approved for each environment\'s instance, credentials stored as secure properties per environment, never copied between environments.',
    'Rollout: inventory callers (analytics/logs), onboard all consumers first, verify in each environment, then enforce — ideally automated via CI/CD and API Manager APIs.',
    'Recognises the audit goal remains valid and that service-to-service auth should be part of the API-led design from day one.',
  ],
  solution: `
**Diagnosis.** Client ID Enforcement makes the gateway reject any request that does not carry valid credentials of a **client application with an approved contract on that API instance**. API instances are per environment, so a contract on the sandbox instance means nothing in production.

| Caller | Sends | Result |
|---|---|---|
| prc-payroll-api | nothing | 401 — no credentials |
| prc-onboarding-api | sandbox client ID/secret (copied into prod.yaml) | 401 — not valid for the prod instance |

Sandbox "worked" because only onboarding was tested there, with sandbox credentials that did have a sandbox contract. Payroll was never tested, and nobody checked who calls the prod instance.

The Process API then turns a 401 into a 500 for the portal — technically correct (it's our fault, not the user's), but the alert should have pointed at the credential problem.

**Immediate mitigation.** Remove the policy from the prod \`sys-hr-api\` instance to restore onboarding and payroll (it takes effect quickly on the gateway). Inform security that the control is temporarily rolled back with a planned re-apply date — the audit finding stays open, not ignored. Check whether any onboarding/payroll transactions failed during the window and replay them.

**Root cause.** A security policy was applied to a shared System API without (1) knowing its consumers, (2) onboarding them as client applications in every environment, and (3) environment-specific credentials. Credentials were copied between environment property files.

**Permanent fix.**

\`\`\`
Exchange / API Manager (prod)
  sys-hr-api (prod instance) -- contract approved --> client app "prc-onboarding-api-prod"
                             -- contract approved --> client app "prc-payroll-api-prod"
Exchange / API Manager (sandbox)
  sys-hr-api (sandbox instance) -- contracts --> "...-sandbox" client apps
\`\`\`

- One client application **per consumer per environment** (clear naming), contract requested and approved for that environment's instance.
- Store \`client_id\`/\`client_secret\` as **secure properties** per environment (or in a secrets manager) and send them as headers from the Process API's requester config.
- Consider OAuth 2.0 client credentials with an identity provider for service-to-service calls if the organisation needs scopes and token lifetimes; client ID enforcement is a basic identification control.

**Prevention — rollout checklist for any new policy on a shared API.**
1. Find all callers (API analytics, logs, contracts).
2. Create client apps and contracts for each caller in each environment; deploy credentials **before** enforcement.
3. Apply in sandbox with all callers tested, then prod in a change window with a rollback plan.
4. Automate API instances, policies and contracts through CI/CD so environments don't drift.
5. Make client ID (or OAuth) enforcement part of the standard System API template from day one.
`,
  followUps: [
    { q: 'Are client applications defined per environment?', a: 'Client applications are created in Exchange at business-group level, but contracts are with specific API instances, and API instances belong to an environment. Using separate client apps per environment keeps credentials and access isolated.' },
    { q: 'Is Client ID Enforcement real authentication?', a: 'It identifies the calling application and enables contracts, SLA tiers and analytics, but a shared secret in a header is weaker than OAuth 2.0 or mTLS. For sensitive System APIs combine it with network restrictions, mTLS or OAuth.' },
    { q: 'Why not just whitelist the internal network instead?', a: 'IP allowlisting tells you a call came from inside, not which application made it. You lose per-consumer visibility, contracts and rate limits — and anything compromised inside the network gets full access.' },
  ],
}
