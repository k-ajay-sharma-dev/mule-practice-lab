export default {
  id: 'inc-185',
  category: 'incidents',
  title: 'Products Go Live at Zero Price: a default 0 Hides a Field the Supplier Renamed',
  level: 'INTERMEDIATE',
  tags: ['dataweave', 'default', 'validation', 'data-quality', 'pricing'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '2026-11-17 06:00:04 INFO  [catalog-feed] Supplier file read, 2,140 products', relevant: false },
      { text: '2026-11-17 06:00:05 INFO  [catalog-feed] First row keys: sku, title, unitPrice, stock', relevant: true, why: 'The supplier now sends unitPrice instead of price.' },
      { text: '2026-11-17 06:00:07 INFO  [catalog-feed] Mapped 2,140 products, price=0 for 2,140', relevant: true, why: 'Every product got a price of zero, which no rule caught.' },
      { text: '2026-11-17 06:00:09 INFO  [catalog-feed] Published 2,140 products to the web shop', relevant: true, why: 'The zero prices went live with no error.' },
      { text: '2026-11-17 06:14:52 INFO  [web-shop] 63 orders placed with total 0.00', relevant: true, why: 'Customers bought products for nothing.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did every product get a price of zero?',
        options: [
          'The field is now `unitPrice`, so `$.price` is null and `default 0` fills in zero',
          'The supplier sent `unitPrice` as text, and the coercion to Number gave zero',
          'The supplier sent prices with a comma decimal, so they were read as zero',
          'The shop rejects prices in a field it does not know and sets them to zero',
        ],
        answer: 0,
        explain: 'The mapping uses price: $.price default 0. When the field disappeared, the default hid the problem and produced a valid looking zero.',
      },
      {
        type: 'single',
        prompt: 'What should the mapping do when the price is missing?',
        options: [
          'Fail the row, or the file, with a clear error that names the field',
          'Keep `default 0`, and hide products with a zero price on the shop',
          'Use `$.price default $.unitPrice default 0`, so any name is accepted',
          'Use yesterday’s price for the product, and log a warning for the row',
        ],
        answer: 0,
        explain: 'A missing price is a data error. A row or file failure stops bad data going live and tells someone to act. Accepting any name, or a stale price, still guesses and still keeps the zero fallback.',
      },
      {
        type: 'multi',
        prompt: 'What should happen right away?',
        options: [
          'Take the affected products offline or restore yesterday\'s prices',
          'Decide with the business what to do with the 63 orders',
          'Update the mapping to read unitPrice, after confirming the change with the supplier',
          'Rerun the feed now with the same file, so prices are mapped again',
        ],
        answer: [0, 1, 2],
        explain: 'Stop more zero price orders, handle the ones already placed, and read the new field once the supplier confirms the change. Rerunning the same file with the same mapping gives the same zeros.',
      },
      {
        type: 'single',
        prompt: 'When is default the right choice?',
        options: [
          'When absence has a known meaning, such as no discount meaning zero',
          'On every field, so that one bad row never stops the whole feed',
          'On required fields only, so that they always hold a value',
          'On numeric fields only, because text fields can be left empty',
        ],
        answer: 0,
        explain: 'default fits optional fields whose absence means a known value. It hides errors when used on required fields.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Take the zero priced products offline',
          'Confirm the renamed field with the supplier',
          'Change the mapping and fail rows with no valid price',
          'Add a file check that stops publishing when many prices change at once',
          'Agree with suppliers how they announce format changes',
        ],
        explain: 'Stop the damage, confirm the cause, fix the mapping safely, add a guard on the whole file, then fix the process.',
      },
    ],
  },
  description: `
## Symptoms
- An online shop sells products from a supplier feed. This morning every product from one supplier showed a price of 0.00.
- Customers placed 63 orders before the team noticed.

## Change / Context
- The supplier changed its file format overnight and renamed \`price\` to \`unitPrice\`. Nobody was told.
- The mapping uses \`price: $.price default 0\`. A developer added the default a year ago "so one bad row never breaks the feed".
- The feed publishes to the shop without any check on prices.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-17 06:00:05 INFO  [catalog-feed] First row keys: sku, title, unitPrice, stock
2026-11-17 06:00:07 INFO  [catalog-feed] Mapped 2,140 products, price=0 for 2,140
2026-11-17 06:14:52 INFO  [web-shop] 63 orders placed with total 0.00
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
    'default on a required field turns a missing value into a valid looking wrong value.',
    'A renamed field makes the selector return null, and default hides it.',
    'Missing required data should fail the row or the file with a clear error.',
    'Use default only where absence has a known meaning.',
    'Check the whole file, such as how many prices changed, before publishing.',
    'Agree with suppliers how format changes are announced.',
  ],
  solution: `
**Diagnosis.** The supplier renamed \`price\` to \`unitPrice\`. The mapping reads \`$.price\`, which is now null, and \`default 0\` turns it into zero. Every product went live at 0.00 with no error.

**Immediate mitigation.**
- Take the supplier's products offline, or restore yesterday's prices.
- Agree with the business how to handle the 63 orders.
- Read \`unitPrice\` once the supplier confirms the new format.

**Root cause.** A default was used to keep the feed running at any cost. On a required field it hides missing data and produces wrong data that looks valid.

**Permanent fix.**
- Remove the default on price. Fail a row whose price is missing or not a positive number, and send it to an error report.
- If more than a set share of rows fail, or prices move more than a set amount, stop the whole file and alert the team.

**Prevention.** Ask suppliers to announce format changes and test them on a sandbox feed first. Review every \`default\` in mappings and keep it only where absence has a real meaning.
`,
  followUps: [
    { q: 'Why stop the whole file and not only bad rows?', a: 'When every row fails the same way, the cause is the file format. Publishing the rest would still be wrong, and one stop is clearer than 2,140 row errors.' },
    { q: 'Where is default safe?', a: 'For optional fields whose absence means a known value, such as no discount meaning zero discount.' },
    { q: 'How could a schema help?', a: 'Validating the file against the agreed fields would fail at once when price disappeared, with a message that names the missing field.' },
    { q: 'What would you tell the business about the 63 orders?', a: 'The facts and the options, such as cancelling with an apology or honouring them. It is their decision, not the integration team\'s.' },
  ],
}
