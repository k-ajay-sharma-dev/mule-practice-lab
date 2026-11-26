export default {
  id: 'cs-129',
  category: 'case-studies',
  title: 'Online Retailer Handling GDPR Erasure Requests Across 25 Systems in Under 30 Days',
  level: 'EXPERT',
  tags: ['privacy', 'gdpr', 'orchestration', 'audit', 'compliance'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Erasure requests are handled by emails to 25 system owners today, and some are never done. What is the core of the new design?',
      options: [
        'An orchestration that tracks a case per request until every system confirms',
        'A shared mailbox that sends one email to all 25 owners at once',
        'An erase in the CRM, which then syncs the deletion to the other systems',
        'A delete event on a topic, closing the case once the event is published',
      ],
      answer: 0,
      explain: 'A tracked case per request, with an answer from every system, shows what is done and what is late. Email gives no proof, not every system syncs from the CRM, and a published event does not prove that anyone erased anything.',
    },
    {
      type: 'single',
      prompt: 'Finance must keep invoices for seven years by law. What happens to the customer’s data in finance?',
      options: [
        'Keep what the law requires, restrict its use, and record why in the case',
        'Anonymise the name and address on the invoices, and keep the amounts and dates',
        'Keep the invoices, and mark finance as erased in the case so it can close',
        'Keep all finance data, including marketing preferences, unchanged',
      ],
      answer: 0,
      explain: 'A legal duty to keep records can override erasure for that data. The case must record the reason, and the data must not be used for other purposes. An invoice with the customer removed no longer meets the duty to keep it. Marking finance as erased records something that did not happen. Marketing preferences are not covered by the duty, so they must go.',
    },
    {
      type: 'multi',
      prompt: 'Which three things should the case record keep?',
      options: [
        'Which systems confirmed erasure and when',
        'Which data was kept and the legal reason',
        'The date of the request and the due date',
        'A full copy of the erased personal data, for proof',
        'Only an overall status of Open or Done, so the record holds no detail',
        'The emails from system owners saying they have deleted the data',
      ],
      answer: [0, 1, 2],
      explain: 'The record proves the request was handled in time and explains what was kept. Keeping a copy of the erased data would defeat the request. A single status cannot show which of the 25 systems are still open, which is how four systems were missed. Emails are today\'s process: they are not tied to each system and nobody can see what is missing, so each system must confirm into the case record.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Six old systems cannot delete one customer through an API. What do you do?',
      options: [
        'Give the owner a tracked task with a due date, and plan an API or job later',
        'Leave those six systems out of scope until they are replaced',
        'Email the six owners and close the case when the other 19 confirm',
        'Mark the six as erased in the case, and ask owners to delete at their next maintenance',
      ],
      answer: 0,
      explain: 'Manual steps are fine if they are tracked and due. Leaving systems out breaks the law, and closing before all have confirmed gives false proof.',
    },
    {
      type: 'match',
      prompt: 'Match each system type to how it handles erasure.',
      pairs: [
        ['CRM and e-commerce with APIs', 'Erase through an API call from the orchestration'],
        ['Data warehouse', 'Anonymise the customer key in a nightly job'],
        ['Finance', 'Keep required records, restrict use, record the reason'],
        ['Old system with no API', 'Manual task for the owner, tracked in the case'],
      ],
      explain: 'Each system gets the method it can support, and all report back to one case.',
    },
    {
      type: 'order',
      prompt: 'Order the handling of one request.',
      items: [
        'Verify the requester’s identity',
        'Find the customer in every system through the customer ID map',
        'Send erasure requests or tasks to each system',
        'Collect confirmations and chase late systems',
        'Close the case and tell the customer',
      ],
      explain: 'Identity first, so data is not erased for the wrong person. Then find, erase, confirm and close.',
    },
  ],
  description: `
**Context.** An online retailer with **6 million customers** receives about **900 erasure requests** a month under GDPR. They must be handled within one month.

**Facts gathered so far**
- Customer data sits in 25 systems: CRM, e-commerce, marketing, customer service, finance, warehouse, data warehouse and several old systems.
- Today a privacy officer emails system owners. There is no record of who finished.
- An audit found requests that were never completed in four systems.
- Each system has its own customer ID. A master data service maps most of them.
- Six old systems have no way to delete one customer except by hand.

**Opinions**
- Data protection officer: "I need proof for every request."
- CFO: "We must keep invoices for seven years."
- System owners: "Do not send us more emails."

**Your task.** Design how an erasure request is handled across all systems, with proof and within the deadline.
`,
  answerTemplate: `## Decision

## Finding the customer

## Erasing in each system

## Data that must be kept

## Tracking and proof

## Rollout

## Risks
`,
  keyPoints: [
    'One orchestration per request, with an answer from every system.',
    'The customer ID map finds the customer in each system.',
    'Systems erase through APIs, jobs or tracked manual tasks.',
    'Legal duties to keep data are recorded with the reason, and use is restricted.',
    'The case record holds dates, confirmations and reasons, not the erased data.',
    'Late systems are chased automatically before the deadline.',
  ],
  solution: `
**Decision.** A privacy orchestration that opens a case per request, sends work to each system, and closes only when all have answered.

**Finding the customer.** After identity checks, the orchestration uses the master data service to find the customer's ID in each system. Systems not in the map are searched by agreed fields.

**Erasing.** Systems with APIs get an erase call and answer with a confirmation. The data warehouse anonymises the customer key in a nightly job and reports back. Old systems get a task for their owner, with a due date, tracked in the same case.

**Data that must be kept.** Finance keeps invoices for the legal period, marks them restricted, and the case records the reason and the retention end date.

**Tracking and proof.** The case holds the request date, due date, each system's answer and time, and anything kept with its reason. Systems that are late get reminders, then escalation, well before the deadline.

**Rollout.** Start with the systems that hold the most personal data, then add the rest. Plan APIs or jobs for the old systems.

**Risks.** Copies of data outside the 25 systems, backups that still hold the data, and identity checks that are too weak.
`,
  followUps: [
    { q: 'What about backups?', a: 'Backups usually cannot be edited. Document that erased data is not restored into live systems, and that backups expire on their normal schedule.' },
    { q: 'Why not erase in the CRM and let it sync to everyone?', a: 'Not every system listens to the CRM, and a sync may not delete. Each system must confirm its own erasure.' },
    { q: 'How do you stop data coming back after erasure?', a: 'Keep a suppression record, such as a hashed identifier, so imports and syncs do not recreate the customer.' },
    { q: 'How do you show the DPO the process works?', a: 'A report of requests by status, time to close, late systems, and data kept with reasons.' },
  ],
}
