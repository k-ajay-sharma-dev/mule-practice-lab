export default {
  id: 'cs-133',
  category: 'case-studies',
  title: 'Industrial Group Rolling Out a New CRM Country by Country While the Old One Keeps Running',
  level: 'EXPERT',
  tags: ['crm', 'migration', 'coexistence', 'sync', 'master-data'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'For two years some countries use the new CRM and some the old one. Who owns each customer during that time?',
      options: [
        'The CRM used by the serving country owns it; the other gets a read copy',
        'Both CRMs own every customer, with a two way sync between them',
        'The old CRM owns everyone until the last country has moved',
        'Whichever CRM last edited the record owns it from then on',
      ],
      answer: 0,
      explain: 'One owner per customer avoids conflicts. Two way ownership of every record during a long migration leads to endless conflict rules.',
    },
    {
      type: 'single',
      prompt: 'A global customer is served in France on the new CRM and in Spain on the old one. What do you do?',
      options: [
        'One golden identity in master data; each CRM owns only its local account',
        'Two separate customers, one in each CRM, with no link between them',
        'Move this customer’s Spanish accounts to the new CRM ahead of Spain',
        'Let both countries edit all of the customer’s data in either CRM',
      ],
      answer: 0,
      explain: 'Master data holds the shared identity. Each country owns its local relationship, so changes do not collide.',
    },
    {
      type: 'multi',
      prompt: 'Which three things make each country’s cut-over safe?',
      options: [
        'A rehearsal the week before, on a copy of that country’s production data',
        'A freeze on edits in the old CRM for that country while its records move',
        'A rollback plan that hands that country’s ownership back to the old CRM',
        'A rehearsal the week before, on generated test data so no customer data is copied',
        'Two way sync of that country’s customers between both CRMs for a month after go live',
        'The old CRM keeps ownership for a month after go live while users work in the new one',
      ],
      answer: [0, 1, 2],
      explain: 'Rehearse on real data, freeze while moving, and be able to go back. Generated test data does not have the duplicates, gaps and odd values of real records, so the rehearsal misses the problems the real move will hit. Two way sync gives each customer two owners, and edits on both sides turn into conflicts. If the old CRM stays the owner while users edit in the new one, their changes are overwritten or lost.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The ERP, the marketing platform and the service desk all read customers from the old CRM today. How do you avoid changing them every time a country moves?',
      options: [
        'A Customer System API over both CRMs that routes each call to the owner',
        'Change each consumer’s integration when each country moves',
        'Copy the new CRM into the old database so consumers see no change',
        'Ask each consumer to call both CRMs and merge the answers itself',
      ],
      answer: 0,
      explain: 'A facade hides where each customer lives. Consumers change once, to the API, and each country move is a routing change.',
    },
    {
      type: 'match',
      prompt: 'Match each part to its job during the migration.',
      pairs: [
        ['Master data hub', 'One global identity per customer'],
        ['Customer System API', 'Routes reads and writes to the owning CRM'],
        ['Ownership table', 'Says which CRM owns which country'],
        ['Change events from each CRM', 'Keep read copies and consumers up to date'],
      ],
      explain: 'Identity, routing, ownership and change flow are separate jobs, each with one place.',
    },
    {
      type: 'order',
      prompt: 'Order the programme.',
      items: [
        'Build the Customer System API over the old CRM and move consumers to it',
        'Set up the master data hub and the ownership table',
        'Move a small country first, with rehearsal and rollback',
        'Move the rest in waves, learning from each one',
        'Retire the old CRM when the last country has moved',
      ],
      explain: 'Moving consumers to the API first makes every later country move a routing change, not a project.',
    },
  ],
  description: `
**Context.** An industrial group sells in **28 countries**. It is replacing an old on-premises CRM with a SaaS CRM, one country at a time, over **two years**.

**Facts gathered so far**
- 300 global customers buy in many countries.
- The ERP, the marketing platform and the service desk read customers from the old CRM through direct database queries.
- Each country move needs a weekend and a trained sales team.
- The first move was planned with two way sync of all customers. A pilot produced thousands of conflicts in a week.

**Opinions**
- Programme director: "Each country move must be boring."
- Head of sales, Europe: "Global accounts cannot have two versions."
- ERP owner: "Do not make us change our integration 28 times."

**Your task.** Design how customers are owned, shared and moved during the two years of coexistence.
`,
  answerTemplate: `## Decision

## Ownership

## Global customers

## Consumers during the migration

## Each country move

## Retiring the old CRM

## Risks
`,
  keyPoints: [
    'One owner per customer, set by the country that serves it.',
    'A master data hub keeps one global identity for customers in many countries.',
    'A Customer System API routes to the owning CRM, so consumers change once.',
    'Change events keep read copies and consumers current.',
    'Each move has a rehearsal, a short freeze and a rollback.',
    'Two way sync of everything produces conflicts and should be avoided.',
  ],
  solution: `
**Decision.** Ownership per country, a master data hub for global identity, and a Customer System API that hides which CRM owns a customer.

**Ownership.** An ownership table says which CRM owns each country. The owning CRM is the only place to edit that country's accounts. The other CRM gets read copies through change events.

**Global customers.** The master data hub keeps one golden identity. Each country owns its local account details, linked to that identity. Sales teams see other countries' details as read only.

**Consumers.** First, put a Customer System API over the old CRM and move the ERP, marketing and service desk to it. After that, a country move changes routing in the API, not the consumers.

**Each country move.** Rehearse with real data, freeze edits for that country in the old CRM, load and check, switch ownership, and keep a rollback that switches it back.

**Retiring the old CRM.** When the last country moves, the API routes everything to the new CRM and the old one becomes read only, then is shut down.

**Risks.** Consumers that keep direct database access, master data matching errors, and countries that want to move out of order.
`,
  followUps: [
    { q: 'Why not two way sync of every customer?', a: 'Both systems would accept edits to the same record, and every overlap becomes a conflict. One owner per record removes most of them.' },
    { q: 'How do you find consumers still reading the old database?', a: 'Database audit logs and connection lists. Agree a date after which direct access is closed.' },
    { q: 'What if a move goes wrong on the Monday?', a: 'Switch ownership back in the table, so the old CRM owns the country again, and replay any edits made in the new CRM.' },
    { q: 'How do you keep moves boring?', a: 'A checklist, a rehearsal, the same tooling every time, and lessons from each wave applied to the next.' },
  ],
}
