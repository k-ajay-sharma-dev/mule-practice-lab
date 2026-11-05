export default {
  id: 'inc-017',
  category: 'incidents',
  title: 'Fresh JWTs Rejected on Only One Gateway Node',
  level: 'INTERMEDIATE',
  tags: ['jwt', 'security', 'clock-skew', 'ntp', 'on-prem'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-03 08:15:24.100 INFO  [mule-node-a] GET /accounts/me 200 corrId=e10c', relevant: true, why: 'node-a accepts the same fresh tokens without problem.' },
      { text: '2026-11-03 08:12:04.311 DEBUG [mule-node-b jwt-validation] Token rejected: token is not yet valid (nbf=1793693720 = 08:15:20Z)', relevant: true, why: 'node-b thinks it is 08:12 while the token was issued at 08:15:20, so nbf looks like the future.' },
      { text: '2026-11-03 08:12:04.312 WARN  [mule-node-b jwt-validation] Request rejected with 401 Unauthorized', relevant: false },
      { text: '2026-11-03 08:15:30.002 INFO  [f5] Pool accounts-xapi: round robin, members node-a, node-b UP', relevant: true, why: 'Round robin sends about half the requests to node-b, matching the half of requests that fail.' },
      { text: 'mule-node-a: date -u -> Tue Nov  3 08:15:27 UTC 2026', relevant: false },
      { text: 'mule-node-b: date -u -> Tue Nov  3 08:12:07 UTC 2026', relevant: true, why: 'node-b clock is about 3 min 20 s behind node-a, after the weekend snapshot restore.' },
      { text: '2026-11-03 08:15:40.000 INFO  [mule-node-a] GET /health 200', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'node-b clock is about 3 minutes behind, so fresh tokens have an nbf in its future',
          'The identity provider signs some tokens with a wrong key',
          'The JWT policy on node-b has a different audience',
          'Tokens expire too early',
        ],
        answer: 0,
        explain: 'Only node-b rejects, with "not yet valid", and date -u shows a 3 min 20 s offset. Once a token is older than the skew, node-b accepts it, which is why retrying later works.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now**?',
        options: [
          'Disable nbf validation in the JWT policy',
          'Drain node-b from the F5 pool, fix its time sync, verify the offset and add it back',
          'Ask the IdP to issue tokens with nbf 5 minutes in the past',
          'Restart both nodes',
        ],
        answer: 1,
        explain: 'Remove the faulty node so users stop failing, then fix the clock. Weakening validation hides a broken server.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'NTP or chrony enabled on boot on all Mule nodes, without conflicting hypervisor time sync',
          'A small leeway (30 to 60 s) for nbf and exp if the validator supports it',
          'Clock offset monitoring with alerts above a few seconds',
          'Verify time sync in the snapshot restore runbook',
          'A 10-minute leeway to be safe',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Small leeway covers normal drift; a large one would hide a broken clock and accept expired tokens for too long.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Notice that only node-b rejects tokens and compare the clocks',
          'Drain node-b from the load balancer',
          'Confirm the 401 rate is back to normal',
          'Resync node-b time and re-add it after checking the offset',
          'Add clock offset alerts and update the restore runbook',
        ],
        explain: 'Diagnose, contain, verify, repair the node, prevent recurrence.',
      },
    ],
  },
  description: `
## Symptoms
- Mobile app users intermittently get **401** from \`accounts-xapi\` immediately after logging in. Retrying a few minutes later usually works.
- About **half** of the failing requests per hour; the other half succeed with the same token.
- Tokens are fresh: issued seconds before the failing call, with a 15-minute lifetime.

## Change / Context
- \`accounts-xapi\` runs on a **two-node on-prem Mule cluster** behind an F5 load balancer (round robin). A **JWT Validation** policy checks signature, \`exp\`, \`nbf\` and audience.
- Last weekend the VMware team **restored \`mule-node-b\` from a snapshot** after a disk issue.
- The identity provider sets \`iat\` and \`nbf\` to the issue time.

## Logs (mule-node-b)
\`\`\`
2026-11-03 08:12:04.311 DEBUG [jwt-validation] Token rejected: token is not yet valid (nbf=1793693720 = 08:15:20Z)
2026-11-03 08:12:04.312 WARN  [jwt-validation] Request rejected with 401 Unauthorized
\`\`\`
Running \`date -u\` on both nodes at the same moment:
\`\`\`
mule-node-a: Tue Nov  3 08:15:27 UTC 2026
mule-node-b: Tue Nov  3 08:12:07 UTC 2026
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
    'Identifies clock skew: mule-node-b is about 3 minutes 20 seconds behind real time, so a fresh token\'s nbf/iat is "in the future" for that node and it rejects it as not yet valid.',
    'Explains the intermittent pattern: round robin sends ~half the calls to node-b; once the token is a few minutes old, node-b accepts it.',
    'Links the restore from snapshot to the clock problem (VM restored with an old clock and no working time sync).',
    'Immediate: take node-b out of the load balancer pool (or fix its time) and confirm 401s stop.',
    'Permanent fix: working NTP/chrony on every node with monitoring; optionally a small leeway (clock-skew tolerance) on time claims if the validator supports it.',
    'Prevention: alert on clock offset per server, and include time sync in the post-restore checklist.',
  ],
  solution: `
**Diagnosis.** \`date -u\` shows **node-b is ~3 min 20 s behind** node-a. The IdP sets \`nbf\` = issue time, so for a fresh token node-b sees \`nbf\` **in the future** and rejects it as *not yet valid*. Node-a accepts it. With round robin, ~half the requests go to node-b → intermittent 401s. Once a token is older than the skew, node-b accepts it too, which is why "retry a few minutes later" works. The weekend **snapshot restore** is the trigger: the VM came back with a wrong clock and time sync wasn't working.

**Immediate mitigation.** Remove \`mule-node-b\` from the F5 pool (or drain it) and confirm the 401 rate drops to normal. Then fix its time (resync NTP/chrony, check the VM's host time-sync settings). Add it back after verifying the offset is near zero.

**Root cause.** A gateway node with a drifted clock and **no working time synchronisation**, combined with strict validation of time claims. Nothing monitored clock offset.

**Permanent fix.**
- Ensure NTP/chrony is enabled, pointed at reliable servers, and starts on boot on all Mule nodes; avoid conflicting hypervisor time sync.
- If the validator supports it, allow a **small leeway** (e.g. 30–60 s) for \`nbf\`/\`exp\`/\`iat\` — enough for normal drift, not enough to hide a broken clock.

**Prevention.** Monitor clock offset on every server and alert above a few seconds; add "verify time sync" to the restore/rebuild runbook; dashboards of 401 rate **per node** would have shown a single node failing.
`,
  followUps: [
    { q: 'What other problems can clock skew cause in an integration platform?', a: 'Expired-looking tokens and SAML assertions, TLS certificate "not yet valid" errors, wrong watermarks and timestamps in logs (making correlation across nodes misleading), and scheduler jobs firing at the wrong time.' },
    { q: 'Would a large leeway (e.g. 10 minutes) be a good fix?', a: 'No. It weakens security by accepting expired tokens for longer and hides the real infrastructure problem. Keep leeway small and fix time sync.' },
    { q: 'How did you narrow it down to node-b?', a: 'By adding the node name to the error log/analytics and seeing that all rejections came from one node, then comparing the token\'s nbf with that node\'s clock.' },
  ],
}
