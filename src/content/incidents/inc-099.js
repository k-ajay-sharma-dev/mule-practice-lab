export default {
  id: 'inc-099',
  category: 'incidents',
  title: 'A Tidy-Up of SLA Tiers Approves Blocked Partners and Sends Paying Partners 429s',
  level: 'INTERMEDIATE',
  tags: ['api-manager', 'api-management', 'sla-tiers', 'contracts', 'rate-limiting', 'change-management'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '16:01:12 AUDIT API Manager: tier "Silver" on meter-readings-api updated by j.ortiz (limit 600/min to 300/min)', relevant: true, why: 'The edit applies at once to all apps approved on the tier.' },
      { text: '16:01:40 AUDIT API Manager: tier "Silver" approval changed from Manual to Automatic by j.ortiz', relevant: true, why: 'Moving from manual to automatic grants any pending requests.' },
      { text: '16:01:41 NOTIFY Contract auto-approved: app "voltline-sync" on Silver', relevant: true, why: 'This app was one of the pending requests, held by the credit team.' },
      { text: '16:01:41 NOTIFY Contract auto-approved: app "gridnest-portal" on Silver', relevant: false },
      { text: '16:02:03 INFO  [meter-readings-api] GET /readings/991 200 (41 ms)', relevant: false },
      { text: '16:03:15 WARN  [gateway] client northwind-billing: 429 quota exceeded, limit 300 per 60000 ms', relevant: true, why: 'An approved partner now hits the new, lower limit. It sends the same volume as yesterday.' },
      { text: '16:03:16 WARN  [gateway] client northwind-billing: 429 quota exceeded, limit 300 per 60000 ms', relevant: false },
      { text: '16:05:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '16:20:44 INFO  [meter-readings-api] GET /readings/1877 200 client=voltline-sync', relevant: true, why: 'The unapproved company now has access and is calling the API.' },
    ],
    questions: [
      {
        type: 'multi',
        prompt: 'Which documented behaviours explain the two problems?',
        options: [
          'Editing a tier holds its approved applications to the new terms immediately',
          'Changing a tier from manual to automatic approval grants pending requests',
          'The limit change needed a redeployment, so the 429s have another cause',
          'Automatic approval removes the need for a client ID',
        ],
        answer: [0, 1],
        explain: 'Both are stated on the SLA tiers page, which warns about changing throughput without notice. No redeployment is involved.',
      },
      {
        type: 'single',
        prompt: 'What should you do first about voltline-sync, which failed the credit check?',
        options: [
          'Revoke its contract, which blocks the app and can be restored later',
          'Delete the client application from Exchange without revoking',
          'Change Silver back to manual and wait, because that removes the contract',
          'Add an IP blocklist policy for the whole API',
        ],
        answer: 0,
        explain: 'Revoking blocks the application. The docs do not say that setting the tier back undoes contracts already created, so act on the contract itself.',
      },
      {
        type: 'single',
        prompt: 'How do you stop the 429s for approved partners?',
        options: [
          'Edit the tier back to 600 per minute, which takes effect immediately, and plan the reduction with notice',
          'Ask each partner to request access again',
          'Remove the Rate Limiting SLA policy from the API',
          'Restart the API so that contracts are downloaded',
        ],
        answer: 0,
        explain: 'A tier edit is immediate in both directions. Removing the policy would also drop every partner\'s limit, which is a much wider change.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the prevention plan?',
        options: [
          'Review and reject pending requests before changing a tier from manual to automatic',
          'Announce limit changes to application owners with a date',
          'Review the current traffic of each app on a tier before lowering its limit',
          'Restrict who has the Manage Contracts and API Manager Environment Administrator permissions',
          'Make all tiers automatic so that nobody has to approve anything',
        ],
        answer: [0, 1, 2, 3],
        explain: 'A tier change is a production change for every application on that tier. Automatic approval for all tiers would remove the commercial check.',
      },
    ],
  },
  description: `
## Symptoms
- Thursday 16:03: **northwind-billing**, a Silver partner with no change at its end, reports HTTP **429** on about half of its calls to \`meter-readings-api\`.
- Thursday 16:30: the credit team asks why **voltline-sync**, which failed its credit check, is calling the API.

## Change / Context
- An API administrator spent the afternoon "tidying up" tiers after a capacity review. The change was not raised as a production change, because no code or deployment was involved.
- Silver had two edits: the limit from 600 to 300 per minute, and approval from Manual to Automatic.
- Before the change, Silver had 12 pending requests. The credit team had been keeping two of them pending on purpose, because "if nobody approves them, they cannot get in."
- \`meter-readings-api\` uses Rate Limiting SLA.

## Logs
\`\`\`
16:01:12 AUDIT tier "Silver" updated by j.ortiz (limit 600/min to 300/min)
16:01:40 AUDIT tier "Silver" approval changed from Manual to Automatic
16:01:41 NOTIFY Contract auto-approved: app "voltline-sync" on Silver
16:03:15 WARN  [gateway] client northwind-billing: 429 quota exceeded
16:20:44 INFO  [meter-readings-api] GET /readings/1877 200 client=voltline-sync
\`\`\`

## Your tasks
1. What is the root cause of each symptom?
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
    'Editing a tier immediately applies to the applications already approved on it. No redeploy is involved.',
    'Changing manual to automatic grants any pending approval requests.',
    'A pending request is not a rejection. Requests that must not pass should be rejected.',
    'Revoke blocks an app and can be undone; delete needs a revoke first.',
    'Restore the limit first, because it hurts paying partners now, and handle the two unapproved apps at the same time.',
    'Contract auto-approved alerts go to administrators, so the evidence was in their inboxes.',
    'SLA tier changes are production changes and need review, notice and a traffic check.',
  ],
  solution: `
**Diagnosis.**
- **429s:** the tier limit dropped from 600 to 300 at 16:01. The docs state that approved applications are immediately held to the edited tier. \`northwind-billing\` did not change; its limit did.
- **Unapproved partner:** the docs state that when a tier changes from manual to automatic approval, API Manager grants any pending requests. All 12 pending requests became contracts, including the two the credit team was holding.

**Immediate mitigation.**
1. **Revoke** the \`voltline-sync\` contract and the other held app's contract. This blocks them. Do not delete the contracts yet: a revoked contract can be restored if the business decides so.
2. Edit Silver back to 600 per minute. This also takes effect at once.
3. Set approval back to Manual, so that new requests wait for a decision. Then review the other ten new contracts.
4. Tell the affected partners what happened.

**Root cause.** A tier looks like simple configuration, but it is live production data for every app on it. The change had no review because it did not involve a deployment. The credit team also relied on leaving requests pending, and a pending request is only a request that nobody has decided yet.

**Permanent fix.**
- The credit team **rejects** requests that fail its check.
- Before making a tier automatic, empty the pending list.
- Lower limits with a date, after checking which apps exceed the new limit.
- If only new partners should have a lower limit, create a new tier, and do not edit the existing one.

**Prevention.** Treat tier edits as production changes. Limit who has the permissions. Consider scripting tier work and reviewing it in a pipeline. Anypoint CLI lists \`api-mgr:tier:add\`, \`copy\`, \`delete\` and \`list\`, and no command to edit a tier.
`,
  followUps: [
    { q: 'Could the limit be lowered without any 429s?', a: 'Only if each app already stays below the new limit. Check per-client traffic first, tell owners about the date, and consider moving heavy users to another tier.' },
    { q: 'Would a partner have seen this coming?', a: 'If Expose Headers is on, responses show X-RateLimit-Limit and X-RateLimit-Remaining, so the client can see the new limit. These headers are off by default.' },
    { q: 'Who is told when a contract is auto-approved?', a: 'Organization administrators, environment administrators and contracts managers receive the contract auto-approved alert.' },
  ],
}
