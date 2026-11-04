export default {
  id: 'inc-008',
  category: 'incidents',
  title: '401 Unauthorized Everywhere After a Client Secret Rotation',
  level: 'BEGINNER',
  tags: ['security', 'client-id-enforcement', 'secrets', 'api-manager'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '14:00:31.200 INFO  [audit] Client application checkout-xapi-prod: client secret reset by sec-ops', relevant: true, why: 'The secret of exactly this client was reset minutes before the failures began.' },
      { text: '14:05:58.120 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '14:06:12.511 INFO  [checkout] POST /payments -> payments-papi corrId=91ad', relevant: false },
      { text: '14:06:12.598 ERROR [checkout] HTTP:UNAUTHORIZED POST https://payments-papi.example.com/api/payments failed: unauthorized (401) corrId=91ad', relevant: true, why: '401 is an authentication failure: the Client ID Enforcement policy no longer accepts the credentials checkout-xapi sends.' },
      { text: '14:06:12.601 ERROR [checkout] Payment failed, returning 502 to client corrId=91ad', relevant: false },
      { text: '14:06:20.004 INFO  [backoffice] POST /payments/refunds -> payments-papi 200', relevant: true, why: 'Other consumers with their own credentials still work, so payments-papi and the policy itself are fine.' },
      { text: '14:07:00.310 INFO  [checkout] Loaded secure property payments.clientSecret from config-prod.yaml (jar)', relevant: true, why: 'The running app still uses the old secret baked into the deployed jar; updating the vault did not reach it.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause of the 401s?',
        options: [
          'checkout-xapi still sends the old client secret stored in its jar, while the secret was reset in Exchange',
          'The Client ID Enforcement policy was removed from payments-papi',
          'checkout-xapi lost its SLA tier and is now forbidden',
          'payments-papi is down',
        ],
        answer: 0,
        explain: 'Only checkout-xapi fails, right after its secret was reset, and the error is **401** (not 403). The vault was updated but the running app reads an encrypted property inside the deployed jar.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now**?',
        options: [
          'Disable Client ID Enforcement on payments-papi until things settle',
          'Set the new secret as a secure runtime property (or redeploy with updated config), restart and run a test payment',
          'Reset the secret again',
          'Ask customers to retry later',
        ],
        answer: 1,
        explain: 'Get the new secret into the app and verify. Removing the policy opens the payments API to anyone; resetting again just creates another secret the app does not know.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Keep secrets out of the jar: secure runtime properties or a secrets manager',
          'Document every consumer of each client application',
          'A rotation runbook with consumer updates in the same window and a smoke test right after',
          'Alerts on a sudden rise in 401s per client application',
          'Stop rotating secrets',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Rotation is good security practice; the gap was that it did not include the consumer side. No rotation is a worse risk.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Link the 401s to the secret reset for checkout-xapi-prod',
          'Provide the new secret to checkout-xapi as a secure runtime property and restart',
          'Confirm a test payment succeeds',
          'Report failed checkouts to the business',
          'Update the rotation runbook and move secrets out of the jar',
        ],
        explain: 'Diagnose, restore, verify, communicate impact, then fix the process.',
      },
    ],
  },
  description: `
## Symptoms
- Since **14:05** every call from \`checkout-xapi\` to \`payments-papi\` fails with **HTTP 401**.
- Other consumers of \`payments-papi\` (back-office app, batch reconciler) work fine.
- Nothing was deployed today for either API.

## Change / Context
- \`payments-papi\` is protected in API Manager with a **Client ID Enforcement** policy (credentials in \`client_id\` / \`client_secret\` headers).
- At 14:00 the security team ran the quarterly **secret rotation**: in Exchange they reset the client secret of the client application *checkout-xapi-prod* and stored the new secret in the vault.
- \`checkout-xapi\` reads the secret from a **secure property** \`secure::payments.clientSecret\` in \`config-prod.yaml\` (encrypted, inside the deployed jar).

## Logs (checkout-xapi)
\`\`\`
14:06:12.511 INFO  [checkout] POST /payments -> payments-papi corrId=91ad
14:06:12.598 ERROR [checkout] HTTP:UNAUTHORIZED HTTP POST on resource
  'https://payments-papi.example.com/api/payments' failed: unauthorized (401). corrId=91ad
14:06:12.601 ERROR [checkout] Payment failed, returning 502 to client corrId=91ad
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
    'Links the start of the 401s (14:05) to the secret reset at 14:00 for exactly the one client application that is failing.',
    'Explains that checkout-xapi still sends the old secret because the value is baked into an encrypted property in the deployed jar; storing it in the vault does not update the app.',
    'Reads the 401 correctly: the Client ID Enforcement docs list 401 for unauthorized or invalid client credentials, so this is a credentials problem.',
    'Immediate: update the secret the app uses (re-encrypt and redeploy, or set the secure runtime property) and restart; verify calls succeed.',
    'Permanent fix: secrets supplied at deploy/runtime (secure properties in Runtime Manager or a secrets manager), not committed in the jar, so rotation needs no code change.',
    'Prevention: a rotation runbook that includes all consumers, a test call after rotation, and alerts on 401 rate per client.',
  ],
  solution: `
**Diagnosis.** Only \`checkout-xapi\` fails, the failures started minutes after its client secret was **reset**, and the error is **401** (authentication), not 403. The Client ID Enforcement policy no longer recognises the old secret, but \`checkout-xapi\` still sends it: the secret lives in an **encrypted property inside the deployed jar**, which nobody updated. Putting the new secret in the vault changed nothing for the running app. The small delay (14:00 → 14:05) fits the gateway refreshing its cached client credentials.

**Immediate mitigation.** Get the new secret into the app: set it as a **secure runtime property** in Runtime Manager under the key \`secure::payments.clientSecret\` (you type the plain value, and a deployment property overrides the file value; list the key in \`secureProperties\` in \`mule-artifact.json\` so it stays hidden), or re-encrypt it with the secure-properties key and rebuild/redeploy with the updated \`config-prod.yaml\`. Restart and confirm a test payment succeeds. Then tell the business how many checkouts failed and whether customers need to retry.

**Root cause.** The rotation process covered the identity side (Exchange/vault) but not the **consumer side**. The secret was hard-wired into the build artifact, so rotating it required a redeploy nobody planned.

**Permanent fix.**
- Keep secrets **out of the jar**: provide them as secure runtime properties in Runtime Manager / the pipeline, or read them from a secrets manager.
- Document every consumer of each client application so rotation can update all of them.

**Prevention.** A rotation runbook: update consumers first or in the same change window, run a smoke test call immediately after, and have a rollback plan. Alert on a sudden rise of 401s per client app in API Manager analytics / monitoring, so the problem is spotted in minutes, not by users.
`,
  followUps: [
    { q: 'What is the difference between a 401 and a 403 from Client ID Enforcement?', a: 'The policy docs list 401 for unauthorized or invalid client credentials and 500 for an internal error; they list no 403 for this policy. In general HTTP terms 401 means the credentials were not accepted and 403 means the caller is known but not allowed, so check which policy produced a 403 before drawing a conclusion.' },
    { q: 'How could you rotate the secret with zero downtime?', a: 'Update and redeploy every consumer as part of the same change, timed right after the reset, with a smoke test. Where the identity provider supports two active secrets (e.g. external IdP client management), add the new one, roll consumers over, then revoke the old one.' },
    { q: 'How would you have detected this earlier?', a: 'An alert on 401 rate per client application and a synthetic transaction (a test payment) that runs every few minutes would have fired within minutes of the reset.' },
  ],
}
