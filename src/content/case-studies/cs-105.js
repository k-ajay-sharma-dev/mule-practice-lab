export default {
  id: 'cs-105',
  category: 'case-studies',
  title: 'Regional Government Applying the Once-Only Principle Across 12 Departments',
  level: 'ADVANCED',
  tags: ['public-sector', 'government', 'api-led', 'master-data', 'events', 'gdpr', 'pii', 'governance', 'api-management'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Citizens give their address separately to 12 departments. A citizen moves house. What design best meets "tell us once" while respecting data protection law?',
      options: [
        'Build a central citizen database with every department\'s data, which all departments read',
        'Publish an address-changed event from the population register to entitled subscribers',
        'Let the portal send each new address to all 12 departments through their System APIs',
        'Give each department a nightly file of every address in the population register',
      ],
      answer: 1,
      explain: 'One authoritative source and an event lets departments update their records without a central copy of everything. Each department subscribes only if it has a legal basis, which keeps the sharing lawful and visible. A central database of everything breaks minimisation and the departments\' control. The portal pushing to all 12 sends data to departments with no legal basis and misses moves registered elsewhere. A nightly full file shares far more than the changes.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which conditions should a department meet before it may subscribe to "address changed"? (choose all that apply)',
      options: [
        'A documented legal basis and purpose for holding the address',
        'An entry in the data sharing register, approved by the data protection officer',
        'Agreement to receive only the fields it needs (for example, no previous addresses)',
        'Consent from each citizen before their address change is sent to the department',
        'Agreement to receive the full household record with each event, so it never has to ask again',
        'Approval by the population register\'s integration team, which runs the event topic',
      ],
      answer: [0, 1, 2],
      explain: 'A legal basis and purpose make the sharing lawful. A register entry approved by the data protection officer makes it visible and checkable. Minimal fields keep to data minimisation. Consent is the wrong basis here: once-only sharing between public bodies rests on the law, and a citizen cannot freely refuse a public task. The full household record shares far more than an address change needs. The integration team runs the topic, but it does not decide who may lawfully receive data; that is the register and the data protection officer.',
    },
    {
      type: 'match',
      prompt: 'Match each kind of data to the department or register that should own it.',
      pairs: [
        ['Legal name, date of birth, registered address', 'Population register'],
        ['Property ownership and parcel boundaries', 'Land registry'],
        ['Business registration and directors', 'Business register'],
        ['Benefit entitlements and payments', 'Social services department'],
      ],
      explain: 'Once-only works when each fact has one owner that others trust. Departments reuse those facts instead of collecting them again.',
    },
    {
      type: 'single',
      prompt: 'The social services department wants to query the tax department\'s income data in real time for every citizen who logs in to the portal "to pre-fill forms". What is the best architectural response?',
      options: [
        'Allow the query at login, and cache the income for the session so the tax API is called once',
        'Allow the query only when an application needs income, through the tax API, with its purpose logged',
        'Give social services a nightly copy of the income data so the portal does not depend on tax',
        'Ask the citizen to consent at login, then query the tax API for every logged-in citizen',
      ],
      answer: 1,
      explain: 'Purpose limitation means data is fetched when a specific process needs it, not on every login. The query goes through the owning department\'s API, which records the purpose and the case. Caching or consenting at login still fetches income for citizens who never apply, and a nightly copy hands social services the income of everyone.',
    },
    {
      type: 'order',
      prompt: 'Put the steps of the programme in a sensible order.',
      items: [
        'Map the data each department collects and the legal basis for it',
        'Agree the owner of each shared data item and publish a data sharing register',
        'Build System APIs and events for the most reused items (identity, address, household)',
        'Connect the citizen portal and the first three departments',
        'Remove the duplicate questions from forms in those departments',
        'Measure forms shortened and errors avoided, then extend to the next departments',
      ],
      explain: 'Data mapping and ownership come before any API, because once-only fails without agreed owners. Removing questions from forms is the real benefit and has to be done on purpose and measured.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A subscriber department\'s system was down for three days and missed 4,000 address-changed events. What should the design allow?',
      options: [
        'Events sent while it is down are lost; the department reloads all 2.1 million addresses',
        'A durable queue per subscriber, plus an address API with a "changed since" filter',
        'The population register re-sends the last week of events to every subscriber',
        'The integration team replays the missed events by hand from the register\'s audit log',
      ],
      answer: 1,
      explain: 'Durable queues per subscriber and a replay window cover outages. A current-address API with a "changed since" filter lets a department reconcile without a full reload. A full reload is heavy and needless, and re-sending to every subscriber gives the others duplicates. A manual replay from the audit log can work once, but it is a support task for every outage, and the audit log is a control record, not a feed built to be resent.',
    },
  ],
  description: `
**Context.** A regional government has 12 departments: health, social services, housing, transport, education, tax, business licensing, land registry and others. Each built its own systems over 25 years. A citizen applying for a housing grant fills in name, address, household, income and property details that four other departments already hold.

A new regional law adopts the **once-only principle**: citizens and businesses should provide the same information only once, and departments must reuse data they can lawfully obtain from each other.

**What exists.**
- A population register (identity, address, household), a business register and a land registry, each with a good data owner.
- A citizen portal with a regional digital identity.
- An Anypoint Platform used by three departments; the others use point-to-point database links and file exchanges.
- Data protection law requires a legal basis, purpose limitation and minimisation for every sharing.

**Goals**
- Cut the questions on the 20 most used forms by half within two years.
- When a citizen moves, every department that is entitled to know is updated within a day.
- Every data sharing is recorded and can be shown to the data protection authority.

**Constraints**
| Item | Detail |
|---|---|
| Ownership | Departments are separate legal controllers; none can be forced to give up its system |
| Volume | 2.1 million citizens; about 9,000 address changes a week |
| Systems | Mix of mainframe, Oracle and SaaS; some departments have no integration staff |
| Politics | Departments fear losing control of "their" data and being blamed for others' errors |

**Your task.** Answer the questions about data ownership, sharing patterns and governance.
`,
  answerTemplate: `## Data ownership

## Sharing patterns: events and queries

## Legal basis and the sharing register

## Reliability and reconciliation

## Phasing and benefits

## Politics and trust
`,
  keyPoints: [
    'Each shared fact has one owner (population register, business register, land registry) that exposes it through System APIs and events.',
    'Changes are shared as events to departments with a legal basis; on-demand facts are queried when a specific process needs them, with purpose recorded.',
    'A data sharing register, approved by the data protection officer, lists who receives what and why; API Manager policies enforce it.',
    'Subscribers get durable delivery with replay, plus a "changed since" API for reconciliation after outages.',
    'Benefits come from removing questions from forms, which must be planned and measured, not from APIs alone.',
    'Departments keep their systems; trust grows through clear ownership, quality reporting and a federated governance board.',
  ],
  solution: `
**Ownership.** Identity, address and household belong to the population register; property to the land registry; businesses to the business register. Each owner publishes System APIs (\`sys-population-api\`, \`sys-land-registry-api\`) and change events.

**Patterns.**
- **Events** for facts that departments keep a copy of: "address changed", "household changed", "business dissolved". Each subscriber has its own durable queue and receives a minimal payload.
- **Queries** for facts that are only needed in a process: income, property ownership. The calling Process API sends purpose and case reference; the owner's API checks the register and logs the call.

**Register and enforcement.** The data sharing register lists each consumer, data items, legal basis and review date. Client applications in API Manager are approved only with a register entry; scopes match the items allowed.

**Reliability.** Replay window of 14 days per subscriber queue; a \`GET /addresses?changedSince=\` API for reconciliation; a monthly quality report back to the owner (addresses that bounced, mismatches found).

**Phasing.** Start with address and household for housing, social services and transport. Remove the address and household questions from their forms and measure completion time and error rates. Extend to income and property next.

**Governance.** A federated board with one data owner per department, a shared integration team for departments without staff, and a published register so citizens can see who uses their data.
`,
  followUps: [
    { q: 'Why not build one central citizen database?', a: 'It would hold everything about everyone, create a single target and need every department to give up control. Owners publishing facts through APIs and events share only what is lawful.' },
    { q: 'When do you use an event and when a query?', a: 'Use an event when a department keeps its own copy and must update it on change. Use a query when the fact is needed only at one step of a process, with the purpose recorded.' },
    { q: 'How do you enforce the data sharing register technically?', a: 'Only approve API client applications that have a register entry. Map the allowed items to scopes, and audit every call with its purpose.' },
    { q: 'What do you measure to show the programme works?', a: 'Questions removed from forms, time to complete applications, errors from outdated data, and the number of departments updated within a day of a change.' },
  ],
}
