export default {
  id: 'inc-168',
  category: 'incidents',
  title: 'Rogue Agent Detection Is Applied to Two Model Proxies but Nothing Is Ever Flagged',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'agent-fabric', 'llm', 'security', 'policies'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-20 10:00:03 INFO  [policy-audit] mp-hr-assistant: Rogue Agent Detection, Anomalies to Detect: (none)', relevant: true, why: 'With no rules, the docs say the policy forwards every request and detects nothing.' },
      { text: '2026-11-20 10:00:03 INFO  [policy-audit] mp-loan-support: Rogue Agent Detection, Anomalies to Detect: 1 rule, Anomaly Type: Custom, Detection Prompt: (empty)', relevant: true, why: 'A Custom rule has no built in definition, so it does nothing until a detection prompt is added.' },
      { text: '2026-11-20 10:00:03 INFO  [policy-audit] mp-hr-assistant, mp-loan-support: JWT Validation applied', relevant: true, why: 'The verified claims that identify the agent are available, so missing identity is not the explanation.' },
      { text: '2026-11-20 10:04:18 INFO  [red-team] Test prompt asking for other staff salary records sent to mp-hr-assistant: forwarded to provider', relevant: true, why: 'Illustrative line: a request that should look risky goes straight through, which fits a policy with nothing to check.' },
      { text: '2026-11-20 10:05:02 INFO  [red-team] Test prompt asking to ignore lending rules sent to mp-loan-support: forwarded to provider', relevant: true, why: 'Illustrative line: the same result on the second proxy, with a different configuration gap.' },
      { text: '2026-11-20 10:06:00 INFO  [governance] Security > Needs Review: 0 agents', relevant: true, why: 'The review queue is empty because nothing is being flagged, not because the agents are behaving well.' },
      { text: '2026-11-20 10:06:41 INFO  [sys-hr] GET /employees/4471/leave 200 (28 ms)', relevant: false },
      { text: '2026-11-20 10:07:12 INFO  [monitor] Daily latency report sent to platform channel', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Rogue Agent Detection is on two model proxies. One has no anomaly rules, and the other has one Custom rule with no detection prompt. Why is nothing flagged?',
        options: [
          'With no rules the policy detects nothing, and a Custom rule does nothing until it has a detection prompt',
          'The Deduplication Window hides every alert, so flags exist but the review queue never displays them',
          'The agents share one identity provider account, so the policy cannot create any flag at all',
          'Detection runs on model responses only, and the test prompts never reached the model provider',
        ],
        answer: 0,
        explain: 'Both gaps are documented on the detect and contain page. The policy checks each incoming prompt against its rules. With no rules it forwards every request, and a Custom rule has no built in definition. The Deduplication Window controls how long to wait before alerting again on the same agent, anomaly type and verdict.',
      },
      {
        type: 'single',
        prompt: 'A bank wants Rogue Agent Detection to catch prompt injection on a model proxy as quickly as possible. What is the smallest correct change?',
        options: [
          'Add a rule with the Prompt Injection anomaly type, which has a built in definition',
          'Add a Custom rule named Prompt Injection and leave its Detection Prompt field empty',
          'Add Agent Kill Switch to the proxy, which detects prompt injection without any rules',
          'Change the System Evaluation Prompt and leave the Anomalies to Detect list empty',
        ],
        answer: 0,
        explain: 'PII Leak, Privilege Escalation and Prompt Injection have built in definitions, so a detection prompt is optional. A Custom rule needs its prompt whatever it is called. Agent Kill Switch blocks an identity and does not detect anything.',
      },
      {
        type: 'single',
        prompt: 'A lender needs Rogue Agent Detection to catch agents giving advice that breaks its own lending rules. No built in anomaly type covers this. What must the rule include?',
        options: [
          'The Custom anomaly type with a Detection Prompt that describes the behaviour to flag',
          'The PII Leak anomaly type with the name of the lending policy as the rule label',
          'The Custom anomaly type with a shorter Deduplication Window so that it runs more often',
          'The Privilege Escalation anomaly type with a User Identifier that names the lending team',
        ],
        answer: 0,
        explain: 'A Custom rule has no built in definition, so the detection prompt is what gives it meaning. The Deduplication Window is about repeat alerts, and the User Identifier is recorded for attribution only and does not affect detection.',
      },
      {
        type: 'multi',
        prompt: 'A Rogue Agent Detection rollout must flag the right agent once rules are in place. Which two setup items does it rely on?',
        options: [
          'JWT Validation on each model proxy, which publishes the verified claims',
          'A unique non human identity provider account for each agent',
          'A separate model proxy for every agent in the company',
          'One shared service account, so that all agents are covered by one rule',
        ],
        answer: [0, 1],
        explain: 'The Agent Identity Selector reads the agent identity from validated JWT claims, so JWT Validation is a prerequisite. If agents shared one account, a flag could not point at one agent. Nothing in the docs asks for one proxy for each agent.',
      },
      {
        type: 'order',
        prompt: 'Order the response to a Rogue Agent Detection policy that never flags anything.',
        items: [
          'Stop treating the empty review queue as proof that agents are safe',
          'Read the Anomalies to Detect list on each model proxy',
          'Add the missing rules and detection prompts',
          'Send a safe test prompt that should match a rule',
          'Confirm that the agent appears in Needs Review',
          'Add a rollout check that every proxy has a working rule',
        ],
        explain: 'Question the quiet result first, read the configuration, fix it, and prove detection with a test. A control that has never fired has not been shown to work.',
      },
    ],
  },
  description: `
## Symptoms
- A bank runs two **agents**, AI programs that decide for themselves which steps to take: an HR assistant for staff and a loan support assistant for branch teams.
- Each reaches its **LLM** (large language model, the AI model that reads a prompt and writes a reply) through a **Model Proxy**, one governed endpoint for many LLM providers.
- Security applied **Rogue Agent Detection** to both proxies six weeks ago. Since then, **Governance > Security > Needs Review** has shown no flagged agents at all.
- A security review now asks why. A red team (testers who act like attackers) sends test prompts that should look risky, and both go straight through with no flag.

## Change / Context
- Rogue Agent Detection is a policy on a model proxy. It checks each incoming prompt against anomaly rules and flags risky behaviour for human review.
- \`mp-hr-assistant\`: the engineer filled in the required fields and saved. The **Anomalies to Detect** list was left empty, to be "tuned later".
- \`mp-loan-support\`: the engineer added one rule with the anomaly type **Custom**, to cover lending rules, and left **Detection Prompt** empty.
- JWT Validation is on both proxies. A JWT (JSON Web Token) is a signed token that carries claims about the caller.
- Each agent has its own non human account at the identity provider, the system that issues its tokens.
- The project status report shows the control as "live, no incidents".

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
10:00:03 INFO [policy-audit] mp-hr-assistant: Rogue Agent Detection, Anomalies to Detect: (none)
10:00:03 INFO [policy-audit] mp-loan-support: Rogue Agent Detection, Anomalies to Detect: 1 rule, Anomaly Type: Custom, Detection Prompt: (empty)
10:04:18 INFO [red-team] Test prompt sent to mp-hr-assistant: forwarded to provider
10:05:02 INFO [red-team] Test prompt sent to mp-loan-support: forwarded to provider
10:06:00 INFO [governance] Security > Needs Review: 0 agents
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
    'Rogue Agent Detection checks each incoming prompt against the anomaly rules on that model proxy.',
    'The docs say that with no rules the policy forwards every request and detects nothing.',
    'A Custom rule has no built in definition, so it does nothing until you add a detection prompt.',
    'PII Leak (PII is personal data), Privilege Escalation and Prompt Injection have built in definitions, so their detection prompt is optional.',
    'Applied does not mean working: an empty review queue proves nothing until a test has fired.',
    'JWT Validation and a unique non human identity for each agent are prerequisites, and here they are in place.',
    'The Deduplication Window only limits repeat alerts. The User Identifier does not affect detection.',
    'Each prompt check uses extra inference calls, so rules add token usage. Plan for that in budgets.',
  ],
  solution: `
**Diagnosis.** The two proxies have different gaps with the same result. The docs state: "If you add no rules, the policy forwards every request and detects nothing." That covers \`mp-hr-assistant\`. For \`mp-loan-support\`, they state that a Custom rule "does nothing until you add a detection prompt." Identity is not the issue, because JWT Validation and separate accounts are in place. The red team log lines are illustrative, and the diagnosis rests on the two documented behaviours and the configuration.

**Immediate mitigation.**
- Add the built in rules that fit each proxy now. For example, PII Leak and Prompt Injection on \`mp-hr-assistant\`.
- Write a detection prompt for the Custom rule on \`mp-loan-support\`, describing the behaviour to flag.
- Send a safe test prompt to each proxy, and confirm that the agent appears in **Needs Review**.
- Tell the security review that the last six weeks had no effective detection. Review what other logs can show for that period.

**Root cause.** The policy was treated as finished once it was applied. Nothing proved that it could fire, and "no flags" was reported as good news.

**Permanent fix.**
- Agree with security which anomaly types each proxy needs, and record the reason.
- Write Custom detection prompts with the business owner, because they define what risky means for lending.
- Decide who reviews flagged agents and how quickly. Containment happens only after a human review.
- Allow for the extra token usage in budgets.

**Prevention.** Make a test prompt part of every rollout, and repeat it on a schedule. Add a checklist item that each proxy has at least one working rule. Report controls as "tested" and not as "applied".
`,
  followUps: [
    {
      q: 'Why does the policy allow you to save with no rules?',
      a: 'The docs say to add at least one rule, and they describe the result if you do not, but they do not say why it is allowed. Treat an empty rule list as a configuration error in your own reviews.',
    },
    {
      q: 'Does a flag block the agent?',
      a: 'No. Detection flags behaviour for review. Blocking comes from Agent Kill Switch, after a person chooses Quarantine agent. The reviewer can instead choose Clear flags if the activity was legitimate.',
    },
    {
      q: 'Should every proxy have every anomaly type?',
      a: 'Choose by risk. Each prompt check uses extra inference calls, so more checking has a token cost. A proxy that handles employee data has a clear reason for PII Leak, for example.',
    },
    {
      q: 'What does the System Evaluation Prompt do here?',
      a: 'It sits under Advanced Configuration, and the docs say most deployments do not need to change it. It does not replace the rule list, so check Anomalies to Detect first.',
    },
  ],
}
