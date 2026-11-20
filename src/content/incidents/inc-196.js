export default {
  id: 'inc-196',
  category: 'incidents',
  title: 'Supplier Invoices Paid Twice Despite a Duplicate Check: Keys With Spaces and Mixed Case',
  level: 'INTERMEDIATE',
  tags: ['idempotency', 'object-store', 'data-quality', 'payments'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '2026-11-18 08:15:02 INFO  [ap-intake] Invoice stored key=SUP-118|INV-2026-0441 amount=1840.00', relevant: true, why: 'The first copy was stored under this key.' },
      { text: '2026-11-18 08:40:17 DEBUG [ap-intake] Duplicate check key not found', relevant: true, why: 'The check compared the raw text, so it saw a new invoice.' },
      { text: '2026-11-18 08:40:17 INFO  [ap-intake] Invoice stored key=SUP-118|inv-2026-0441  amount=1840.00', relevant: true, why: 'The second copy has lower case letters and trailing spaces, so the key differs.' },
      { text: '2026-11-18 09:00:00 INFO  [ap-intake] Scheduler idle', relevant: false },
      { text: '2026-11-18 10:05:44 INFO  [erp] Payment run paid SUP-118 INV-2026-0441 twice', relevant: true, why: 'Both copies were paid.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did the duplicate check miss the second copy?',
        options: [
          'The key used the number as typed, and its case and spaces differed',
          'The first key had expired from the Object Store before the second copy came',
          'The check runs only on the invoice number, and the supplier ID differed',
          'The two copies were checked at the same moment, before either was stored',
        ],
        answer: 0,
        explain: 'To a computer "INV-2026-0441" and "inv-2026-0441  " are different text. People see the same invoice.',
      },
      {
        type: 'single',
        prompt: 'What should the key be built from?',
        options: [
          'The supplier ID and the invoice number, trimmed and in one case',
          'The invoice number alone, trimmed and in one case',
          'The supplier ID and the name of the PDF file the email carried',
          'The supplier ID and a hash of the PDF file the email carried',
        ],
        answer: 0,
        explain: 'Normalise the parts people type before building the key. Without the supplier ID, two suppliers with the same number would clash. A resent invoice can come as a new file, with another name or other bytes.',
      },
      {
        type: 'multi',
        prompt: 'Which other differences should the normal form remove?',
        options: [
          'Leading and trailing spaces',
          'Upper and lower case',
          'Spaces or dashes inside the number, if the supplier is known to vary them',
          'The supplier ID',
        ],
        answer: [0, 1, 2],
        explain: 'Remove what does not change the meaning. The supplier ID must stay, or two suppliers with the same invoice number would clash.',
      },
      {
        type: 'single',
        prompt: 'Why add a check on supplier, amount and date as well?',
        options: [
          'It flags a resent invoice whose number differs in a way the key misses',
          'It replaces the key, so the Object Store is no longer needed',
          'It blocks every second invoice for the same amount automatically',
          'It lets the ERP pay invoices in one run instead of two',
        ],
        answer: 0,
        explain: 'A softer second check flags likely duplicates for a person, even when the key differs.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Stop the payment of any unpaid duplicates',
          'Find invoices that match once normalised',
          'Recover double payments with the suppliers',
          'Normalise the key before the duplicate check',
          'Flag likely duplicates by supplier, amount and date for review',
        ],
        explain: 'Stop the money, find and recover, fix the key, then add the second line of defence.',
      },
    ],
  },
  description: `
## Symptoms
- Finance found several supplier invoices paid twice this month.
- The intake app has a duplicate check, and it did not stop them.

## Change / Context
- Suppliers email PDFs. A capture tool reads the invoice number, and staff sometimes correct it by hand.
- The app builds the key as \`supplierId ++ "|" ++ invoiceNumber\` and checks it in an Object Store.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 08:15:02 INFO  [ap-intake] Invoice stored key=SUP-118|INV-2026-0441 amount=1840.00
2026-11-18 08:40:17 INFO  [ap-intake] Invoice stored key=SUP-118|inv-2026-0441  amount=1840.00
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
    'A duplicate check on raw text misses differences in case and spaces.',
    'Normalise typed values before building a key.',
    'Keep the supplier ID in the key.',
    'A softer check on supplier, amount and date catches the rest.',
    'Stop unpaid duplicates first, then recover paid ones.',
    'Test the key with case, spaces and dashes.',
  ],
  solution: `
**Diagnosis.** The key uses the invoice number as typed. The second copy had lower case letters and trailing spaces, so the key was new and the invoice was stored and paid again.

**Immediate mitigation.** Block unpaid duplicates, find pairs that match once normalised, and recover the paid ones.

**Root cause.** The check assumed the invoice number is always written the same way. Hand corrections broke that.

**Permanent fix.** Build the key from \`upper(trim(invoiceNumber))\`, and remove inner spaces or dashes if suppliers vary them. Keep the supplier ID.

**Prevention.** A second check that flags invoices with the same supplier, amount and date for review. Tests with case and spacing variants.
`,
  followUps: [
    { q: 'Should you change the stored invoice number too?', a: 'Keep what the supplier wrote for reference, and store the normal form beside it for matching.' },
    { q: 'What about old keys already in the store?', a: 'They were stored raw. Check new keys against both forms until the old ones expire.' },
    { q: 'Why not compare amounts only?', a: 'Two real invoices can have the same amount. Use it as a hint, not as the key.' },
    { q: 'Who reviews flagged invoices?', a: 'Accounts payable, before the payment run.' },
  ],
}
