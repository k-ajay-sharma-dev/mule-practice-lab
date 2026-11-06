export default {
  id: 'ms-205',
  category: 'mulesoft',
  title: 'Rogue Agent Detection and Agent Kill Switch: Flag, Review, Contain',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'agent-fabric', 'omni-gateway', 'llm', 'security', 'policies'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A bank applies Rogue Agent Detection and Agent Kill Switch to a Model Proxy, the governed endpoint its AI agents use to call large language models. What is the job of each policy?',
      options: [
        'Kill Switch checks prompts against anomaly rules, and Rogue Agent Detection blocks the agent',
        'Rogue Agent Detection checks prompts and flags risks, and Kill Switch blocks a flagged agent',
        'Rogue Agent Detection blocks risky prompts, and Kill Switch deletes the agent from the registry',
        'Both check prompts against anomaly rules, and each blocks the agent on the first rule it matches',
      ],
      answer: 1,
      explain: 'Rogue Agent Detection checks each incoming prompt against anomaly rules and flags risky behaviour for review. Once a reviewer quarantines a flagged agent, Agent Kill Switch blocks its identity from the proxy. One finds the problem and the other contains it.',
    },
    {
      type: 'single',
      prompt: 'At a retailer, Rogue Agent Detection flags the returns agent for a possible Prompt Injection. Agent Kill Switch is also on the Model Proxy. Nobody has opened the review yet. What is the state of the agent?',
      options: [
        'It has been quarantined by the flag, and a reviewer must restore its model access',
        'It has been quarantined for a fixed time, and it returns once that time has passed',
        'It can still reach the models, as a person must review it and choose to quarantine',
        'It can still reach the models, as a second flag is what triggers the quarantine',
      ],
      answer: 2,
      explain: 'Flagging never quarantines an agent by itself. Containment happens only after human review. The reviewer chooses Quarantine agent, or Clear flags if the activity was legitimate.',
    },
    {
      type: 'single',
      prompt: 'A shipping company quarantines a flagged agent, but it keeps reaching the Model Proxy. Both policies are on that proxy. Rogue Agent Detection uses the selector `claims.act.sub` and Agent Kill Switch uses `claims.sub`. What is the most likely cause?',
      options: [
        'The selectors differ, so Kill Switch does not see the same identity that was flagged',
        'The selectors differ, so the JWT Validation policy rejected the claims of the agent',
        'The quarantine needs a redeploy of the proxy, as a policy reads its settings at startup',
        'The quarantine covers the agent\'s user, so it only stops the person the agent acts for',
      ],
      answer: 0,
      explain: 'Both policies identify an agent from JWT claims through an Agent Identity Selector. The selectors must match, so that the agent that gets flagged is the one that gets blocked.',
    },
    {
      type: 'single',
      prompt: 'An HR team applied Rogue Agent Detection with its identity selectors set but left the list of anomaly rules empty. After a month there are no flags and the team reports that its agents are clean. What is wrong with that conclusion?',
      options: [
        'Nothing, as the built in anomaly types run even when the list of rules is empty',
        'Nothing, as a month with no flags proves that no prompt was risky in that time',
        'With no rules the policy blocks all requests, so no prompt was ever checked at all',
        'With no rules the policy forwards all requests and detects nothing at all',
      ],
      answer: 3,
      explain: 'If you add no rules, the policy forwards every request and detects nothing. PII Leak, Privilege Escalation and Prompt Injection have built in definitions, but you still add them as rules. A Custom rule does nothing until you add a detection prompt.',
    },
    {
      type: 'multi',
      prompt: 'A bank is preparing to use Rogue Agent Detection on a Model Proxy. Which two things must be in place so each agent can be identified?',
      options: [
        'The JWT Validation policy applied to the Model Proxy',
        'A shared service account that all of the agents use',
        'A unique non human identity provider account for each agent',
        'The Client ID Enforcement policy applied to each LLM provider',
      ],
      answer: [0, 2],
      explain: 'JWT Validation supplies the verified claims that the selector reads. Each agent needs its own non human account in the identity provider. If agents shared an account, a block on one identity would hit them all, and a flag could not point to one agent.',
    },
    {
      type: 'order',
      prompt: 'Put these steps in order for an agent that is flagged, contained and later returned to service.',
      items: [
        'Rogue Agent Detection flags the agent for review',
        'A reviewer opens the flag history of the agent',
        'The reviewer selects Quarantine agent',
        'Agent Kill Switch blocks the agent from the Model Proxy',
        'After the issue is resolved, a reviewer selects Restore Model Access',
      ],
      explain: 'Detection flags, a person decides, and Kill Switch enforces. Quarantine can be reversed with Restore Model Access. Quarantine, clear flags and restore actions are all audited.',
    },
  ],
  description: `
A bank has an **AI agent** that helps staff answer customer questions. An agent is a program that uses a **large language model (LLM)**, an AI model that reads and writes text, to decide and act. The agent calls its LLMs through a **Model Proxy**, one governed endpoint for many providers on **Omni Gateway (formerly Flex Gateway)**.

The security team worries about two things. An agent could start sending customer data in its prompts. Someone could also trick it with a **prompt injection**, a prompt written to make the model ignore its instructions.

The team plans to use two policies on the proxy: **Rogue Agent Detection** and **Agent Kill Switch**.

**Questions**
1. What does each policy do?
2. What has to be in place before they can identify an agent?
3. Who decides to contain an agent, and how is that undone?
4. What mistakes in the setup would leave the bank unprotected?
`,
  answerTemplate: `## What each policy does

## What has to be in place

## Containment

## Setup mistakes
`,
  keyPoints: [
    'Rogue Agent Detection is a policy on each model proxy. It checks each incoming prompt against anomaly rules and flags risky behaviour for review.',
    'Built in anomaly types are PII Leak, Privilege Escalation and Prompt Injection. A Custom rule does nothing until you add a detection prompt.',
    'With no rules, the policy forwards every request and detects nothing.',
    'Agent Kill Switch blocks a flagged agent identity from the model proxy once a reviewer quarantines it. Its Agent Identity Selector must match the one in Rogue Agent Detection.',
    'The agent is identified from validated JWT claims, so the proxy needs JWT Validation and each agent needs its own non human identity provider account.',
    'Containment only follows human review: Quarantine agent or Clear flags. Restore Model Access reverses a quarantine, and these actions are audited.',
  ],
  solution: `
**What each policy does**

| | Rogue Agent Detection | Agent Kill Switch |
|---|---|---|
| Job | Finds and flags | Blocks |
| Works on | Each incoming prompt, checked against anomaly rules | The identity of a quarantined agent |
| Result | A flag for a person to review | The agent cannot use the model proxy |

Apply both to each model proxy you want to protect.

**What has to be in place**
- The JWT Validation policy on the proxy, which supplies the verified claims.
- A unique non human account for each agent in the identity provider.
- Each agent registered with a unique instance name and ID, and linked to its model proxies.
- The same Agent Identity Selector in both policies.
- At least one anomaly rule.

**Containment.** A flag does not stop the agent. A person reviews the flag history and chooses **Quarantine agent** or **Clear flags**. A quarantined agent can return with **Restore Model Access**. These actions are audited.

**Setup mistakes**
- No rules: everything is forwarded and nothing is detected.
- A Custom rule with no detection prompt: it does nothing.
- Different selectors: the flagged identity is not the one that is blocked.
- Agents sharing one account: you cannot tell them apart.
- Kill Switch missing from a proxy: quarantine blocks access only on proxies with that policy.
`,
  followUps: [
    {
      q: 'Why does containment wait for a person?',
      a: 'A flag means the activity looks risky, and it may be legitimate. The reviewer looks at the flag history and then quarantines the agent or clears the flags.',
    },
    {
      q: 'What does each rule in Rogue Agent Detection contain?',
      a: 'An anomaly type and a detection prompt. The prompt is optional for PII Leak, Privilege Escalation and Prompt Injection, and needed for a Custom rule to do anything.',
    },
    {
      q: 'Does Rogue Agent Detection add cost?',
      a: 'Yes. It adds token usage, because each prompt check uses extra inference calls.',
    },
  ],
}
