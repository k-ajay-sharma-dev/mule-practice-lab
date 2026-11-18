export default {
  id: 'cs-144',
  category: 'case-studies',
  title: 'Solar Installer Sending Generation Readings and Export Claims to Nine Energy Suppliers',
  level: 'INTERMEDIATE',
  tags: ['energy', 'partners', 'batch', 'reconciliation', 'iot'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Each supplier wants export readings in its own way. How do you organise the sending?',
      options: [
        'Build one monthly claim per home in a common form, then one adapter per supplier for format and channel',
        'Send every raw reading to every supplier',
        'Ask homeowners to send their own readings',
        'Write one flow per home',
      ],
      answer: 0,
      explain: 'The claim is the same business fact for all suppliers. Only the format and channel differ, so those live in adapters.',
    },
    {
      type: 'single',
      prompt: 'Some inverters go offline for days, so readings have gaps. What should the claim do?',
      options: [
        'Use the meter totals at the start and end of the month if available, and mark claims with gaps for review',
        'Fill gaps with zeros',
        'Fill gaps with the highest reading',
        'Skip the month',
      ],
      answer: 0,
      explain: 'Meter totals are usually the safest base. Guessing values would over or under pay, so gaps are flagged.',
    },
    {
      type: 'multi',
      prompt: 'Which three must each claim carry?',
      options: [
        'The supply point number the supplier uses',
        'The period and the kWh exported',
        'Whether any part was estimated',
        'The homeowner\'s bank password',
      ],
      answer: [0, 1, 2],
      explain: 'The supplier needs which meter, which period, how much, and whether it is estimated.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A supplier rejects 40 claims with "unknown supply point". What should happen?',
      options: [
        'Hold those claims, send the list to the customer team to fix the numbers, and resend them',
        'Drop them',
        'Resend them every hour unchanged',
        'Send them to another supplier',
      ],
      answer: 0,
      explain: 'Bad reference data needs a person to fix it. Resending unchanged will fail every time.',
    },
    {
      type: 'match',
      prompt: 'Match each supplier channel to how you send.',
      pairs: [
        ['Supplier with an API', 'Call it per claim and record the answer'],
        ['Supplier with SFTP', 'Write one monthly file and read its response file'],
        ['Supplier with a portal only', 'Produce a file for staff to upload'],
        ['Supplier with an industry message hub', 'Send the standard message through the hub'],
      ],
      explain: 'Meet each supplier through what they support, with the same claim behind it.',
    },
    {
      type: 'order',
      prompt: 'Order the monthly run.',
      items: [
        'Collect readings and meter totals for the month',
        'Build one claim per home, flagging gaps',
        'Send claims to each supplier through its adapter',
        'Read supplier answers and hold rejected claims',
        'Reconcile payments received against claims sent',
      ],
      explain: 'Collect, build, send, handle answers, then check the money.',
    },
  ],
  description: `
**Context.** A solar installer manages panels on **18,000 homes**. Homeowners are paid for electricity they export to the grid, by their own energy supplier. The installer sends export claims to **nine suppliers** each month on their behalf.

**Facts gathered so far**
- Inverters send readings every 30 minutes to the installer's cloud platform. Some go offline for days.
- Many homes also have a smart meter that gives monthly totals.
- Three suppliers have APIs, four take SFTP files, one has a portal only, and one uses an industry message hub.
- Supplier rejections today come back by email and are often missed.
- Homeowners complain when payments are late or wrong.

**Opinions**
- Operations: "Rejections get lost."
- Finance: "We need to know what each supplier owes."

**Your task.** Design the monthly claim process to all nine suppliers.
`,
  answerTemplate: `## Decision

## Readings and gaps

## Common claim

## Supplier adapters

## Rejections

## Reconciliation

## Risks
`,
  keyPoints: [
    'Build one common claim per home per month.',
    'One adapter per supplier for format and channel.',
    'Use meter totals where possible and flag gaps.',
    'Hold rejected claims for a person to fix the data.',
    'Read supplier answers in every channel, not by email.',
    'Reconcile payments against claims.',
  ],
  solution: `
**Decision.** A monthly run builds a common claim per home, then adapters send each claim the way each supplier needs.

**Readings and gaps.** Meter totals are the base when present. Inverter readings fill in otherwise. Claims with gaps are marked estimated or held for review.

**Common claim.** Supply point number, supplier, period, kWh exported, and an estimated flag.

**Supplier adapters.** API, SFTP file, portal file or hub message, each also reading the supplier answer.

**Rejections.** Rejected claims go to a work list with the reason. Fixed claims are sent again.

**Reconciliation.** Payments received are matched to claims, and gaps are chased.

**Risks.** Wrong supply point numbers, supplier format changes, and estimated claims challenged later.
`,
  followUps: [
    { q: 'Why not let each supplier read from your platform?', a: 'Each supplier has its own process and channel. Sending in their form is what gets homeowners paid.' },
    { q: 'How do you avoid sending a claim twice?', a: 'Key each claim by supply point and period, and record what was sent and the answer.' },
    { q: 'What if a supplier changes format?', a: 'Change only that adapter. The common claim stays the same.' },
    { q: 'What do you show homeowners?', a: 'The claim sent, its status, and the payment once received.' },
  ],
}
