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
        'Copy the full citizen record from every department into one central database that all departments read',
        'Make the population register the source for address; when it changes, publish an "address changed" event, and let each department subscribe only if it has a legal basis to receive it',
        'Let each department call every other department\'s database to look for newer addresses',
        'Email all 12 departments when a citizen updates their address in the portal',
      ],
      answer: 1,
      explain: 'One authoritative source and an event lets departments update their records without a central copy of everything. Subscription per legal basis keeps the sharing lawful and visible.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which conditions should a department meet before it may subscribe to "address changed"? (choose all that apply)',
      options: [
        'A documented legal basis and purpose for holding the address',
        'An entry in the data sharing register, approved by the data protection officer',
        'A technical contact who can fix failed deliveries',
        'Agreement to receive only the fields it needs (for example, no previous addresses)',
        'A budget code from the department, since subscribers pay per event',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Legal basis, a register entry, minimal fields and an owner who can act on failures are what make sharing lawful and reliable. Charging per event has nothing to do with whether sharing is allowed.',
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
        'Allow it, since it improves the citizen experience',
        'Allow a query only when the citizen starts an application that needs income, with the purpose and the citizen\'s case recorded, through the tax System API and its audit',
        'Give social services a nightly copy of the tax database',
        'Refuse all access to tax data',
      ],
      answer: 1,
      explain: 'Purpose limitation means data is fetched when a specific process needs it, not on every login. The query goes through the owning department\'s API, which records the purpose and the case.',
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
        'Nothing; the department must ask citizens again',
        'Durable delivery per subscriber with a replay window, and a "current address" API the department can call to reconcile records changed in that period',
        'The population register re-sends every address in the region',
        'The department reads the event broker\'s internal storage',
      ],
      answer: 1,
      explain: 'Durable queues per subscriber and a replay window cover outages. A current-address API with a "changed since" filter lets a department reconcile without a full reload.',
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
