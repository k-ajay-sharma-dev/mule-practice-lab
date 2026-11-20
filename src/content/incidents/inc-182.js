export default {
  id: 'inc-182',
  category: 'incidents',
  title: 'Large Purchase Orders Skip Approval: Amounts From a CSV Compared as Text in a Choice Router',
  level: 'BEGINNER',
  tags: ['dataweave', 'types', 'choice', 'csv', 'approvals'],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: '2026-11-14 10:02:11 INFO  [po-intake] File po-20261114.csv read, 3 rows', relevant: false },
      { text: '2026-11-14 10:02:11 INFO  [po-intake] PO-7710 amount=900 route=approval', relevant: true, why: 'A small order went to approval.' },
      { text: '2026-11-14 10:02:11 INFO  [po-intake] PO-7711 amount=12500 route=auto', relevant: true, why: 'A large order skipped approval.' },
      { text: '2026-11-14 10:02:11 INFO  [po-intake] PO-7712 amount=4000 route=auto', relevant: true, why: 'Routing follows the first digit compared with 5, not the size of the number.' },
      { text: '2026-11-14 10:02:12 INFO  [po-intake] 3 purchase orders sent to ERP', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did the 12,500 order skip approval while the 900 order did not?',
        options: [
          'The amounts are text, so "12500" is compared with "5000" letter by letter',
          'The CSV reader drops the last digits of values longer than four characters',
          'The Choice router sends a row to its default route when the amount overflows',
          'The CSV reader reads the amount column as a Number but loses its scale',
        ],
        answer: 0,
        explain: 'The CSV reader gives every value as a String. Comparing Strings goes character by character, so "12500" is below "5000" and "900" is above it.',
      },
      {
        type: 'single',
        prompt: 'Which condition compares the amounts correctly?',
        options: [
          '`payload.amount as Number > 5000`',
          '`payload.amount > "5000"`',
          '`payload.amount as String > "5000"`',
          '`(payload.amount as Number) as String > "5000"`',
        ],
        answer: 0,
        explain: 'Coerce the value to a Number first, then compare numbers. Every other option still compares two Strings, so the order is by character, not by value.',
      },
      {
        type: 'multi',
        prompt: 'What should happen right away?',
        options: [
          'List the orders that went to auto approval since the release and check their amounts',
          'Hold or review the large ones that skipped approval',
          'Fix the condition and add tests with amounts of different lengths',
          'Send every order to approval until the fix ships, and tell managers why',
        ],
        answer: [0, 1, 2],
        explain: 'Find the orders that went through wrongly, review them, and fix the rule. Sending every order to approval needs a code change of its own and floods managers, so fixing the condition is the better use of that release.',
      },
      {
        type: 'single',
        prompt: 'Which test data would have caught this?',
        options: [
          'Amounts of 900 and 12500, with the route checked for each',
          'Amounts of 4999 and 5001, with the route checked for each',
          'Amounts of 6000 and 9000, with the route checked for each',
          'Amounts of 1000 and 4000, with the route checked for each',
        ],
        answer: 0,
        explain: 'The bug shows when the numbers have different lengths. Values with the same number of digits sort the same as text and as numbers.',
      },
      {
        type: 'order',
        prompt: 'Order the fix.',
        items: [
          'Confirm from the logs that routing follows the first digit',
          'Review orders that skipped approval since the release',
          'Coerce the amount to a Number once, early in the flow',
          'Add tests with amounts of different lengths',
          'Check other flows that read numbers from CSV',
        ],
        explain: 'Prove the cause, deal with the orders already through, fix the type at the source, test the exact case, then look for the same pattern.',
      },
    ],
  },
  description: `
## Symptoms
- A purchase order intake app reads a daily CSV from a procurement tool. Orders above 5,000 should go to a manager for approval.
- Finance found a 12,500 order that was never approved, while some 900 orders were sent for approval.

## Change / Context
- Last week a developer replaced a Transform that built typed records with a direct read of the CSV.
- The Choice router condition is \`#[payload.amount > "5000"]\`. The developer added the quotes after a test file with a blank amount failed with \`Cannot coerce String to Number\`.
- Tests used amounts of 500 and 5000 only.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-14 10:02:11 INFO  [po-intake] PO-7710 amount=900 route=approval
2026-11-14 10:02:11 INFO  [po-intake] PO-7711 amount=12500 route=auto
2026-11-14 10:02:11 INFO  [po-intake] PO-7712 amount=4000 route=auto
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
    'The CSV reader gives every value as a String.',
    'Strings compare character by character, so "900" is greater than "5000" and "12500" is less.',
    'Coerce to a Number before comparing amounts.',
    'Fix the type once, early, so every later step sees numbers.',
    'Review orders that skipped approval since the release.',
    'Test with values of different lengths.',
  ],
  solution: `
**Diagnosis.** The amount comes from a CSV, so it is a String. The condition compares it with the String "5000". Text comparison goes character by character, so "12500" is less than "5000" because "1" comes before "5", and "900" is greater because "9" comes after "5". Large orders starting with 1 to 4 skip approval, and small orders starting with 6 to 9 are sent to it.

**Immediate mitigation.**
- List orders routed to auto approval since the release, and hold or review those above 5,000.
- Tell finance which orders need a late approval.

**Root cause.** The removed Transform used to build typed records. Without it, the amount stayed text. The coercion error came from one blank amount. It was silenced by making both sides text, instead of fixing the type and rejecting bad rows.

**Permanent fix.**
- Coerce types once, right after reading the file: \`amount: $.amount as Number\`.
- Keep the condition numeric: \`#[payload.amount > 5000]\` on the typed record.
- Reject rows where the amount is not a valid number, instead of guessing.

**Prevention.** Add tests with amounts of different lengths, such as 900, 5000 and 12500. Review other flows that read numbers from CSV, JSON strings or query parameters.
`,
  followUps: [
    { q: 'Why did the original error appear?', a: 'With a String on one side and a Number on the other, DataWeave turns the String into a Number. A blank amount cannot be turned into one, so the condition failed. The right fix was to coerce the amounts early and reject rows that are not valid numbers.' },
    { q: 'What if an amount has a thousands separator?', a: 'Coerce with a format, or clean the value first. An amount such as "12,500" fails a plain as Number.' },
    { q: 'Where else do numbers arrive as text?', a: 'CSV files, query parameters, headers, XML text and some JSON from partners.' },
    { q: 'How would you make the type problem visible early?', a: 'Map the file into a typed record at the start and fail rows that do not convert, with a clear error per row.' },
  ],
}
