export default {
  id: 'inc-189',
  category: 'incidents',
  title: 'The ERP Rejects One Invoice in Twenty: Mule Rounds Tax on Each Line While the ERP Rounds It on the Total',
  level: 'INTERMEDIATE',
  tags: ['dataweave', 'rounding', 'invoices', 'erp', 'finance'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '2026-11-18 11:04:10 INFO  [invoice-api] Invoice posted invoiceId=INV-88120 lines=3 total=118.80', relevant: false },
      { text: '2026-11-18 11:04:31 WARN  [invoice-api] ERP rejected invoiceId=INV-88121 reason=header tax 20.31 does not match calculated tax 20.32', relevant: true, why: 'The ERP works out the tax again and gets one cent more.' },
      { text: '2026-11-18 11:04:31 DEBUG [invoice-api] invoiceId=INV-88121 lineTax=[6.77,6.77,6.77] sumLineTax=20.31', relevant: true, why: 'Mule rounds the tax of each line and adds up the rounded values.' },
      { text: '2026-11-18 11:04:31 DEBUG [invoice-api] invoiceId=INV-88121 netTotal=101.58 rate=0.20 taxOnTotal=20.316', relevant: true, why: 'Tax on the total is 20.316, which rounds to 20.32.' },
      { text: '2026-11-18 11:05:02 INFO  [invoice-api] GET /health 200', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why do the two sides differ by a cent?',
        options: [
          'Mule rounds the tax on each line, then adds them. The ERP rounds once on the total. The small remainders add up differently',
          'The ERP uses a different tax rate',
          'DataWeave cannot add decimals',
          'One line is missing from the invoice',
        ],
        answer: 0,
        explain: 'Three lines of 33.86 at 20% give 6.772 each. Rounded per line that is 6.77 three times, 20.31. On the total, 101.58 at 20% is 20.316, which rounds to 20.32.',
      },
      {
        type: 'single',
        prompt: 'Which side is right?',
        options: [
          'Neither by itself. Both rules can be legal. The two systems must use the same one, and finance decides which',
          'Mule is always right',
          'The ERP is always right',
          'The customer decides',
        ],
        answer: 0,
        explain: 'Tax rules differ by country and contract. The fault is that two systems use different rules for the same invoice.',
      },
      {
        type: 'multi',
        prompt: 'What must match between Mule and the ERP?',
        options: [
          'Whether tax is rounded per line or per invoice',
          'The number of decimal places',
          'The rounding mode, such as half up or half even',
          'The colour of the invoice PDF',
        ],
        answer: [0, 1, 2],
        explain: 'Where you round, to how many places, and how halves are rounded. Any one of them can cause a cent of difference.',
      },
      {
        type: 'single',
        prompt: 'Rejected invoices are piling up. What is the quickest safe relief?',
        options: [
          'Send the rejected invoices again once the rule is fixed, and pause the ones that keep failing',
          'Change the totals by hand in the ERP',
          'Turn off the ERP check',
          'Delete the rejected invoices',
        ],
        answer: 0,
        explain: 'Hand edits break the audit trail, and turning off the check hides real errors. Fix the rule, then send them again.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Collect the rejected invoices and their difference',
          'Ask finance which rounding rule applies',
          'Change the mapping to the same rule as the ERP',
          'Test with invoices where the rounding differs',
          'Send the rejected invoices again',
        ],
        explain: 'Measure, agree the rule, change the mapping, prove it on the hard cases, then clear the backlog.',
      },
    ],
  },
  description: `
## Symptoms
- About one invoice in twenty is rejected by the ERP with a tax difference of one or two cents.
- Invoices with one line are never rejected.

## Change / Context
- The invoice mapping in Mule works out the tax for each line, rounds it to two places, and adds the rounded values for the header.
- The ERP works out the tax again from the net total and compares it with the header.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 11:04:31 WARN  [invoice-api] ERP rejected invoiceId=INV-88121 reason=header tax 20.31 does not match calculated tax 20.32
2026-11-18 11:04:31 DEBUG [invoice-api] invoiceId=INV-88121 lineTax=[6.77,6.77,6.77] sumLineTax=20.31
2026-11-18 11:04:31 DEBUG [invoice-api] invoiceId=INV-88121 netTotal=101.58 rate=0.20 taxOnTotal=20.316
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
    'Rounding per line and rounding on the total can give different results.',
    'One-line invoices never differ, which points at rounding.',
    'Where to round, how many places and which mode must match on both sides.',
    'Finance owns the rule. Integration applies it.',
    'Never fix totals by hand in the ERP.',
    'Keep test invoices where the two rules give different answers.',
  ],
  solution: `
**Diagnosis.** Mule rounds the tax of each line and adds the results. The ERP rounds once on the net total. When the dropped fractions add up past half a cent, the two disagree by a cent.

**Immediate mitigation.**
- List the rejected invoices with their difference.
- Hold the backlog until the rule is fixed, then send it again.

**Root cause.** Nobody wrote down which rounding rule the invoice process uses, so the mapping and the ERP were built with different ones.

**Permanent fix.**
- Agree the rule with finance: per line or per invoice, the number of places and the rounding mode.
- Change the mapping to match the ERP, or configure the ERP to match, so both do the same thing.

**Prevention.** Add the rule to the interface specification. Keep test invoices with several lines where the two rules give different totals, and run them in every release.
`,
  followUps: [
    { q: 'Why did one-line invoices never fail?', a: 'With one line, rounding the line and rounding the total are the same step, so they cannot differ.' },
    { q: 'What if the law says per line?', a: 'Then the ERP must accept line-level rounding, and the header is the sum of the rounded lines. Configure the ERP check to match.' },
    { q: 'How do you find good test cases?', a: 'Pick prices where each line tax ends in a fraction near half a cent, so the dropped parts add up to a cent or more.' },
    { q: 'Should Mule round at all?', a: 'Round only where the rule says, and as late as the rule allows. Carry full precision until then.' },
  ],
}
