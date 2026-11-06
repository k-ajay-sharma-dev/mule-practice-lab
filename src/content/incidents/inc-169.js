export default {
  id: 'inc-169',
  category: 'incidents',
  title: 'A Quarantined Agent Keeps Calling the Model Proxy: The Agent Kill Switch Selector Differs From Rogue Agent Detection',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'agent-fabric', 'llm', 'security', 'policies'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-23 09:12:44 WARN  [rogue-agent-detection] mp-returns: flagged agent=returns-agent-07 anomaly=PII Leak', relevant: true, why: 'Illustrative line: detection works and names the identity taken from its own selector.' },
      { text: '2026-11-23 09:31:05 INFO  [audit] Quarantine agent: instance returns-agent-07 by s.okafor, environment Production', relevant: true, why: 'A person reviewed the flag and quarantined the agent, so the human step was done. The audit log records this action.' },
      { text: '2026-11-23 09:33:50 INFO  [policy-audit] mp-returns: Rogue Agent Detection, Agent Identity Selector: claims.act.sub', relevant: true, why: 'This selector produced the flagged identity.' },
      { text: '2026-11-23 09:33:50 INFO  [policy-audit] mp-returns: Agent Kill Switch, Agent Identity Selector: claims.sub', relevant: true, why: 'This selector is different. The docs say the two must match, so that the flagged identity is the blocked identity.' },
      { text: '2026-11-23 09:34:12 INFO  [model-proxy] mp-returns: request from returns-agent-07 forwarded to provider', relevant: true, why: 'Illustrative line: the agent still reaches the provider after quarantine, which is the reported symptom.' },
      { text: '2026-11-23 09:35:00 INFO  [sys-returns] POST /returns/88120/refund 200 (52 ms)', relevant: false },
      { text: '2026-11-23 09:36:30 INFO  [monitor] Budget report: mp-returns within daily budget', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'An agent was quarantined after review, yet it still reaches the model proxy. Rogue Agent Detection uses `claims.act.sub`, and Agent Kill Switch on the same proxy uses `claims.sub`. What is the root cause?',
        options: [
          'The selectors differ, so the identity that was flagged is not the identity Agent Kill Switch blocks',
          'Quarantine needs a second person to confirm it, so the action on the agent is still pending',
          'Agent Kill Switch blocks an agent only after its current JWT expires and it requests a new one',
          'Rogue Agent Detection must be removed from the proxy before Agent Kill Switch can take effect',
        ],
        answer: 0,
        explain: 'The docs state: "The selectors must match so that the identity Rogue Agent Detection flags is the identity this policy blocks." They do not describe the failure, so the proxy log line is illustrative. The other options are not documented behaviour.',
      },
      {
        type: 'single',
        prompt: 'What is the correct fix for an Agent Kill Switch selector that differs from the one on Rogue Agent Detection?',
        options: [
          'Set the Agent Kill Switch selector to the same CEL expression as Rogue Agent Detection',
          'Leave the selectors as they are, and add a second Agent Kill Switch policy to the proxy',
          'Clear the flags on the agent, so that Rogue Agent Detection can flag the agent again',
          'Change the User Identifier on both policies, so that they share one value for the person',
        ],
        answer: 0,
        explain: 'The docs say to enter, on Agent Kill Switch, the same CEL expression used on Rogue Agent Detection. The User Identifier is recorded for attribution only, and Clear flags is for activity that was legitimate.',
      },
      {
        type: 'single',
        prompt: 'During an active data leak, an engineer wants to type the agent id into the Killed Agent IDs field of Agent Kill Switch. What should you know about that field?',
        options: [
          'Matching is exact, character by character, and the docs say to leave it empty in normal operation',
          'Matching ignores case and spacing, so any close form of the agent id blocks the agent',
          'The field is required on every proxy, and it holds every agent allowed to call the proxy',
          'The field holds the claim names to read, so it replaces the Agent Identity Selector',
        ],
        answer: 0,
        explain: 'It is an optional comma separated list of identifiers to block. Each entry is compared exactly with the value the Agent Identity Selector resolves, so with the wrong selector an entry may match nothing. It is no substitute for fixing the selector.',
      },
      {
        type: 'multi',
        prompt: 'An agent is quarantined and you must confirm the containment is real across its model proxies. Which two checks matter most?',
        options: [
          'Confirm that every model proxy the agent uses has Agent Kill Switch applied',
          'Compare the Agent Identity Selector on both policies on each of those proxies',
          'Confirm that the User Identifier claim contains the email of a real employee',
          'Confirm that the Deduplication Window is the same length on every model proxy',
        ],
        answer: [0, 1],
        explain: 'Quarantine blocks access to any model proxy that uses the Agent Kill Switch policy, so a proxy without it is not covered. The selectors decide whether the blocked identity is the flagged one. The other two settings do not affect blocking.',
      },
      {
        type: 'order',
        prompt: 'Order the response to a quarantined agent that still reaches a model proxy.',
        items: [
          'Confirm in the audit log that quarantine was done',
          'Check that Agent Kill Switch is on the proxy',
          'Compare the two Agent Identity Selector values',
          'Correct the Agent Kill Switch selector',
          'Confirm that calls from the agent are now blocked',
          'Review what the agent did after quarantine',
          'Add a containment test to the rollout checklist',
        ],
        explain: 'Rule out the human step and the missing policy first, then fix the selector. Verify with real traffic, because a quarantine status alone did not stop the agent here.',
      },
    ],
  },
  description: `
## Symptoms
- A retailer's returns **agent**, an AI program that decides for itself which steps to take, reaches its **LLM** (large language model, the AI model that reads a prompt and writes a reply) through the model proxy \`mp-returns\`, one governed endpoint for many LLM providers.
- Monday 09:12: **Rogue Agent Detection** flags \`returns-agent-07\` for a PII Leak (PII is personal data). The agent had been putting customer details in its prompts.
- 09:31: the security reviewer opens **Governance > Security > Needs Review**, reads the flag history and chooses **Quarantine agent**.
- 09:34: the agent shows as quarantined under **Reviewed**, but it is still reaching the LLM provider through \`mp-returns\`.

## Change / Context
- Rogue Agent Detection flags risky behaviour for review. **Agent Kill Switch** is the policy that blocks a flagged agent identity from the model proxy.
- Both policies have an **Agent Identity Selector**, a CEL (Common Expression Language) expression that reads the agent identity from validated JWT claims. A JWT (JSON Web Token) is a signed token that carries claims about the caller.
- Detection was set up by the security team with \`claims.act.sub\`. Agent Kill Switch was added two weeks later by a platform engineer, who used \`claims.sub\` from an older JWT policy note.
- JWT Validation is on the proxy, and each agent has its own non human identity provider account.
- Quarantine has never been used in production before today.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
09:12:44 WARN [rogue-agent-detection] mp-returns: flagged agent=returns-agent-07 anomaly=PII Leak
09:31:05 INFO [audit] Quarantine agent: instance returns-agent-07 by s.okafor, environment Production
09:33:50 INFO [policy-audit] mp-returns: Rogue Agent Detection, Agent Identity Selector: claims.act.sub
09:33:50 INFO [policy-audit] mp-returns: Agent Kill Switch, Agent Identity Selector: claims.sub
09:34:12 INFO [model-proxy] mp-returns: request from returns-agent-07 forwarded to provider
\`\`\`

## Your tasks
1. What is the most likely root cause?
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
    'Rogue Agent Detection flags. Agent Kill Switch blocks. They are two separate policies on the proxy.',
    'Both read the agent identity through an Agent Identity Selector, a CEL expression over validated JWT claims.',
    'The docs say the selectors must match, so that the flagged identity is the blocked identity.',
    'Here the two expressions differ, while the human review and quarantine were done correctly.',
    'Quarantine blocks access to any model proxy that uses Agent Kill Switch, so a proxy without the policy is not covered.',
    'Killed Agent IDs is optional, uses exact matching, and the docs say to leave it empty in normal operation.',
    'The audit log records quarantine actions with the agent instance id, user, timestamp and environment.',
    'A containment control is proven only by testing it before an emergency.',
  ],
  solution: `
**Diagnosis.** The human step happened: the audit log shows the quarantine. Agent Kill Switch is on the proxy, so that is not the gap. The policy audit shows two different selectors. The docs state: "The selectors must match so that the identity Rogue Agent Detection flags is the identity this policy blocks." The docs do not describe what a mismatch looks like, so the proxy log line is illustrative. The diagnosis rests on the documented rule and on the configuration.

**Immediate mitigation.**
- Change the Agent Kill Switch selector on \`mp-returns\` to \`claims.act.sub\`, the expression used by Rogue Agent Detection.
- Confirm with live traffic that calls from the agent stop. The docs do not state the response a blocked agent gets, or whether an earlier quarantine needs repeating after the fix, so check the result and do not assume it.
- If the agent must stop before the policy change lands, disable it at its own platform or pause the returns flow.
- Check every other proxy the agent uses for the same mismatch.

**Root cause.** Two teams configured two halves of one control separately, with no check that the identity matched. The control had never been exercised, so the mismatch stayed hidden until the first real use.

**Permanent fix.**
- Keep one agreed selector for the environment, and record it in the policy standard.
- Apply both policies together on each protected proxy, with the same expression.
- Assess the customer data the agent sent after 09:12 and follow the data incident process.

**Prevention.** Add a containment test to the rollout: flag a test agent, quarantine it, confirm that it is blocked, then use **Restore Model Access** and confirm that it works again. Repeat the test after any policy change.
`,
  followUps: [
    {
      q: 'Why not always use Killed Agent IDs in an emergency?',
      a: 'It is a static list, and the docs say to leave it empty in normal operation. Entries are compared character by character with the value the selector resolves, so with the wrong selector the flagged id may not match. It also leaves the mismatch in place for the next agent. Fix the selector, and remove any temporary entry afterwards.',
    },
    {
      q: 'Why does containment wait for a human?',
      a: 'The docs put quarantine after review: a person reads the flag history and chooses Quarantine agent or Clear flags. This avoids blocking a legitimate agent on a false alarm, but it makes response time depend on your review process.',
    },
    {
      q: 'How do you put the agent back into service?',
      a: 'Under Governance > Security > Reviewed, choose Restore Model Access and confirm. The audit log records the reactivation too.',
    },
    {
      q: 'Why does each agent need its own identity provider account?',
      a: 'The selector can only single out an agent if its identity is unique. With a shared account, blocking one agent would mean blocking all of them, or none.',
    },
  ],
}
