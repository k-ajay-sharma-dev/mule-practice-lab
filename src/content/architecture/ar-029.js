export default {
  id: 'ar-029',
  category: 'architecture',
  title: 'Writing an Architecture Decision Record',
  level: 'BEGINNER',
  tags: ['adr', 'documentation', 'decision-making', 'governance'],
  estMinutes: 15,
  quiz: [
    {
      type: 'multi',
      prompt: 'A team wants a template for Architecture Decision Records (ADRs), short notes that each record one design decision. Writing one must take minutes, not days. Which three sections belong in the template?',
      options: [
        'Context: the forces and constraints behind the decision',
        'Alternatives considered: the options rejected, and why',
        'Consequences: what becomes easier and what becomes harder',
        'Implementation: the full code of the flows',
        'Requirements: the full requirements document for the project',
      ],
      answer: [0, 1, 2],
      explain: 'An ADR records one decision in minutes. Besides these sections it has a title and number, a status (Proposed, Accepted, Deprecated or Superseded) and the decision itself. Code and long requirement documents belong elsewhere and would make teams stop writing ADRs.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The new architect asks why customer updates go through Anypoint MQ. Which ADR section answers that best?',
      options: [
        'The title',
        'The context and the rejected alternatives (e.g. direct call rejected because ERP outages would surface as Salesforce errors and lose updates)',
        'The date',
        'The list of deciders',
      ],
      answer: 1,
      explain: 'A diagram shows *what* was built; the context and rejected alternatives explain *why* the simpler-looking option was not chosen.',
    },
    {
      type: 'multi',
      prompt: 'An Architecture Decision Record (ADR) explains why customer updates from Salesforce go to the ERP through Anypoint MQ and not through a direct call. Its Consequences section must be honest. Which three consequences should it list?',
      options: [
        'ERP outages are buffered and load is levelled',
        'Updates reach the ERP with eventual consistency of minutes',
        'DLQ monitoring and a replay procedure are needed',
        'Updates arrive in the ERP instantly with no extra work',
        'Updates for one customer stay in order with no design work',
      ],
      answer: [0, 1, 2],
      explain: 'Consequences list what becomes easier **and** what becomes harder. An ADR with only positives is a sales pitch. Ordering is one of the costs here: it must be handled per customer, with a FIFO queue or a version check.',
    },
    {
      type: 'multi',
      prompt: 'A team has started writing Architecture Decision Records (ADRs), short notes that each explain one design decision. They do not want to write one for everything. Which three decisions deserve an ADR?',
      options: [
        'Messaging or a synchronous call for a cross-team flow',
        'mTLS or OAuth as the partner security pattern',
        'CloudHub 2.0 or Runtime Fabric as the deployment target',
        'Which DataWeave function to use for a date format',
        'Which naming style to use for variables in one flow',
      ],
      answer: [0, 1, 2],
      explain: 'ADRs are for significant, hard-to-reverse or cross-team choices, not routine implementation details.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Two years later the team moves the sync to Kafka. What happens to ADR-0007?',
      options: [
        'Edit ADR-0007 to say Kafka',
        'Delete ADR-0007',
        'Write ADR-0015 with its own context and mark ADR-0007 as Superseded by ADR-0015',
        'Leave ADR-0007 as Accepted and say nothing',
      ],
      answer: 2,
      explain: 'Accepted ADRs are immutable. The chain of superseded records shows how the system evolved and prevents repeated debates.',
    },
    {
      type: 'single',
      prompt: 'Where should ADRs be stored?',
      options: [
        'In personal email',
        'Numbered files in the Git repo of the app or a central architecture repo, linked from the Exchange asset',
        'Only in a slide deck',
        'In code comments of one flow',
      ],
      answer: 1,
      explain: 'Next to the code or API asset, ADRs are findable by new developers and consumers.',
    },
  ],
  description: `
Your integration team made a decision six months ago: **customer updates from Salesforce to the ERP go through Anypoint MQ instead of a direct synchronous API call.** A new architect joins and asks "why did we do this? A direct call is simpler." Nobody remembers the full reasoning; the Confluence page only has a diagram.

The CTO asks you to introduce **Architecture Decision Records (ADRs)** for integration choices.

Constraints:
- Teams dislike heavy documentation; the format must take minutes, not days.
- Decisions should be findable next to the code or the API asset.
- Some decisions will be reversed later.

**Questions:**
- What sections would your ADR template have?
- Write a short ADR for the Anypoint MQ decision above.
- Which integration decisions deserve an ADR, and which do not?
- How do you handle a decision that is later changed?
`,
  answerTemplate: `## ADR template

## Example ADR

## What deserves an ADR

## Superseding decisions
`,
  keyPoints: [
    'An ADR is short and records one decision: context, decision, alternatives considered, consequences (positive and negative) and status.',
    'The value is in the context and rejected alternatives, which explain why the simpler-looking option was not chosen.',
    'ADRs are stored with the code or architecture repo (e.g. docs/adr/0007-*.md), numbered and immutable once accepted.',
    'Only significant, hard-to-reverse or cross-team decisions need ADRs (messaging choice, API style, security model), not routine implementation details.',
    'A changed decision gets a new ADR that supersedes the old one; the old one is marked Superseded, not edited away.',
  ],
  solution: `
**Template (lightweight, Michael Nygard style).**
- **Title & number** — "ADR-0007: Use Anypoint MQ for Salesforce → ERP customer sync"
- **Status** — Proposed / Accepted / Deprecated / Superseded by ADR-xxxx
- **Context** — forces, constraints, requirements, numbers
- **Decision** — one or two sentences in active voice
- **Alternatives considered** — and why rejected
- **Consequences** — what becomes easier, what becomes harder, follow-up actions
- Date, deciders, links (Exchange asset, tickets)

**Example ADR-0007.**
- *Context:* ERP is down for maintenance every Sunday 02:00–06:00 and slows down during month-end close. Salesforce users must not wait for the ERP when saving a customer. About 5,000 updates/day, bursts after imports. Updates for the same customer must apply in order.
- *Decision:* Salesforce changes are captured by a Mule app and published to an Anypoint MQ queue; an ERP consumer applies them with retries and a DLQ.
- *Alternatives:* (1) Direct synchronous call — rejected: ERP outages would surface as Salesforce errors and lose updates. (2) Nightly batch — rejected: business needs updates within minutes. (3) Kafka — rejected: no existing Kafka platform; volume does not justify running one.
- *Consequences:* + ERP outages buffered, load levelled. − Eventual consistency (minutes); ordering must be handled per customer (FIFO queue or version check); need DLQ monitoring and a replay procedure.

**What deserves an ADR.** Messaging vs synchronous, broker choice, API style, security pattern (mTLS vs OAuth), deployment target, canonical model or not, build vs buy. Not: variable naming, which DataWeave function to use.

**Changing decisions.** Write ADR-0015 "Move customer sync to Kafka" with its own context, mark ADR-0007 *Superseded by ADR-0015*. The history shows how the system evolved and prevents repeated debates.
`,
  followUps: [
    { q: 'Where do you keep ADRs in a MuleSoft landscape?', a: 'In the Git repository of the main application or in a central architecture repo, linked from the Exchange asset documentation so API consumers and new developers can find them.' },
    { q: 'How do you get teams to actually write them?', a: 'Keep the template to one page, make an ADR a checklist item in the design review, and write the first few yourself as examples.' },
  ],
}
