export default {
  id: 'ar-049',
  category: 'architecture',
  title: 'Classify 10 APIs into API-led Layers',
  level: 'BEGINNER',
  tags: ['api-led', 'layers', 'classification', 'exercise'],
  estMinutes: 15,
  quiz: [
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which of these are System APIs?',
      options: [
        '#1 Core-banking balances (mainframe via MQ) as REST/JSON',
        '#4 Wraps Salesforce Contact and Case',
        '#6 Wraps the third-party KYC vendor SOAP service',
        '#8 Reads the HR database over JDBC',
        '#2 Relationship view combining accounts, cards and loans',
        '#9 Loan eligibility rules',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Each of #1, #4, #6 and #8 hides exactly one system — a third-party vendor is still a system of record from the bank\'s point of view. #2 and #9 are Process APIs.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which of these are Process APIs?',
      options: [
        '#2 Relationship view combining accounts, cards and loans',
        '#5 Open account: CRM + KYC + core banking + welcome email',
        '#9 Loan eligibility rules on income, credit score and debt',
        '#3 Mobile home screen',
        '#10 Branch-teller app API',
      ],
      answer: [0, 1, 2],
      explain: 'Aggregation (#2), orchestration (#5) and pure channel-agnostic business rules (#9) are Process responsibilities. #3 and #10 serve one consumer each.',
    },
    {
      type: 'match',
      needsScenario: true,
      prompt: 'Match each API to its layer and reason.',
      pairs: [
        ['#3 Mobile home screen with promo banner', 'Experience — shaped for one channel'],
        ['#7 Open Banking API for regulated third parties', 'Experience — consumer-specific contract, consent and security'],
        ['#10 Teller web app API calling #2 and #5', 'Experience — serves one consumer by composing Process APIs'],
        ['#5 Open account', 'Process — orchestration with compensation needs'],
      ],
      explain: '#7 looks like a "product API" because regulation dictates its contract. But its shape and security are consumer-specific, so it sits in the Experience layer on top of Process APIs such as #2.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'API #4 is changed to also read the core-banking customer record and merge it with Salesforce. What is it now?',
      options: [
        'Still a System API',
        'A Process API — it combines two systems',
        'An Experience API',
        'A batch job',
      ],
      answer: 1,
      explain: 'A System API that joins two systems is a Process API in disguise. Keep #4 a pure Salesforce wrapper and do the merge in the Process layer.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Which pair is the MOST and the LEAST likely to be reused?',
      options: [
        'Most: #3 home screen · Least: #1 balances',
        'Most: #1 balances · Least: #10 teller API',
        'Most: #10 teller API · Least: #2 relationship view',
        'Most: #7 Open Banking · Least: #4 Salesforce wrapper',
      ],
      answer: 1,
      explain: 'Every account-related process needs balances, while Experience APIs like #3 and #10 are consumer-specific by design — low reuse there is expected, not a failure.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: '#9 eligibility is currently used only inside #5. When does it deserve to be its own Process API?',
      options: [
        'Never — rules always belong inside orchestration',
        'When several processes (loan application, pre-approval marketing) need the same rules',
        'Only when it calls a backend',
        'When the mobile app needs it directly',
      ],
      answer: 1,
      explain: 'With a single caller it could be a module inside #5; a second consumer makes it a reusable Process API.',
    },
  ],
  description: `
A bank is cataloguing its APIs in Exchange. Classify each one as **System**, **Process** or **Experience**, and give a one-line reason. Some are deliberately ambiguous — flag them and say what would change your answer.

| # | API (what it does) |
|---|---|
| 1 | Exposes core-banking account balances (from a mainframe via MQ) as REST/JSON |
| 2 | Returns a customer's accounts, cards and loans combined into one "relationship view" |
| 3 | Serves the iOS/Android app home screen: balance summary + last 5 transactions + promo banner |
| 4 | Wraps the Salesforce \`Contact\` and \`Case\` objects |
| 5 | "Open account" — creates a customer in CRM, runs KYC check, creates the account in core banking, sends welcome email |
| 6 | Wraps the third-party KYC vendor's SOAP service |
| 7 | Open Banking API for regulated third parties (PSD2-style), with consent checks and strict field set |
| 8 | Reads the HR database (JDBC) to get employee records |
| 9 | Calculates loan eligibility using rules on income, credit score and existing debt |
| 10 | Internal branch-teller web app API that calls API #2 and API #5 and returns teller-friendly screens |

**Then answer:** which of these is most likely to be reused by many consumers, and which is least likely?
`,
  answerTemplate: `## Classification table

## Ambiguous cases

## Reuse expectations
`,
  keyPoints: [
    'Wrappers of a single system or external vendor (1, 4, 6, 8) are System APIs — a third-party SaaS/vendor is still a system of record from the bank\'s view.',
    'Composition across systems or business rules (2, 5, 9) are Process APIs; 9 is a rule-only Process API that may not call any system.',
    'Consumer-specific shaping and security (3, 7, 10) are Experience APIs.',
    'Ambiguity is resolved by asking: does it hide one system (System), implement a business capability (Process), or serve one consumer (Experience)?',
    'System and core Process APIs (1, 2, 5) are the most reused; channel-specific Experience APIs (3, 10) are the least reused — by design.',
  ],
  solution: `
| # | Layer | Reason |
|---|---|---|
| 1 | **System** | Unlocks one SoR (core banking); hides MQ/mainframe protocol and copybook formats. |
| 2 | **Process** | Aggregates several System APIs (accounts, cards, loans) into a business view. |
| 3 | **Experience** | Shaped for one channel (mobile home screen), mixes in marketing content. |
| 4 | **System** | One SaaS system (Salesforce); scoped to customer-service entities. |
| 5 | **Process** | Orchestration across CRM, KYC, core banking and notification — a business process with compensation needs. |
| 6 | **System** | External vendor is still a system to integrate; the API hides SOAP/WS-Security. |
| 7 | **Experience** | Consumer-specific contract and security (third-party providers, consent). Business logic stays in Process APIs below it. |
| 8 | **System** | Single database; hides JDBC/SQL. |
| 9 | **Process** | Pure business rules, channel-agnostic. May get inputs from System APIs or from the caller. |
| 10 | **Experience** | Serves one consumer (teller app) by composing Process APIs. |

**Ambiguous cases.**
- **#7 Open Banking:** the contract is dictated by regulation, so some argue it is a "product API". In API-led terms it is still **Experience** — consumer-specific shape, consent and security — reusing Process APIs (#2) underneath.
- **#9 Eligibility:** if it only ever ran inside #5, it might be an internal module/library rather than an API. It becomes a Process API when several processes (loan application, pre-approval marketing) need it.
- **#4:** If it combined Salesforce *and* another system it would become Process. A wrapper over one SaaS is System.
- **#3 vs #10:** both Experience; if the web and mobile channels needed identical data, one shared "digital channels" Experience API is fine.

**Reuse.**
- Most reused: **#1** (every account-related process needs balances), **#2** (relationship view used by mobile, web, teller, Open Banking), **#4/#6**.
- Least reused: **#3** and **#10** — Experience APIs are intentionally consumer-specific; their value is decoupling the channel, not reuse. That is expected and fine.
`,
  followUps: [
    { q: 'Is an API wrapping a SaaS product like Salesforce really a System API? Salesforce already has an API.', a: 'Yes. The System API adds a stable, canonical contract, hides Salesforce-specific objects, auth and limits, and gives you one place to apply policies and protect API quotas.' },
    { q: 'What if a "System API" needs a lookup from a second system to make sense?', a: 'Keep the System API pure and do the lookup in a Process API. If the dependency is trivial reference data, some teams cache it in the System API, but that should be a documented exception.' },
    { q: 'How do you mark the layer in Exchange?', a: 'Use naming conventions plus Exchange categories/tags (e.g. a "layer" category with values system/process/experience) so assets are searchable and governable by layer.' },
  ],
}
