export default {
  id: 'inc-188',
  category: 'incidents',
  title: 'Every Product Shows Out of Stock After a Supplier Changes Tools: a Semicolon CSV Read With a Comma Separator',
  level: 'INTERMEDIATE',
  tags: ['csv', 'dataweave', 'file', 'validation', 'suppliers'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '2026-11-18 05:00:02 INFO  [stock-import] File picked up fileName=stock_20261118.csv sizeBytes=812440', relevant: false },
      { text: '2026-11-18 05:00:03 INFO  [stock-import] First line: sku;description;qty;unit_price', relevant: true, why: 'The header uses semicolons, not commas.' },
      { text: '2026-11-18 05:00:09 INFO  [stock-import] Rows mapped=18240 skuMissing=18240', relevant: true, why: 'Every row lacks a sku field, so each row was read as a single column.' },
      { text: '2026-11-18 05:00:11 INFO  [stock-import] Stock updated products=18240 qty set to 0 by default', relevant: true, why: 'A default of 0 turned a parse problem into out-of-stock products.' },
      { text: '2026-11-18 05:00:12 INFO  [stock-import] File archived fileName=stock_20261118.csv', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does every row have no sku?',
        options: [
          'The file now uses semicolons, and the reader still splits on commas, so each row is one column named after the whole header',
          'The supplier deleted all SKUs',
          'The file is too large for DataWeave',
          'The archive step ran before the mapping',
        ],
        answer: 0,
        explain: 'With the wrong separator the reader sees one column per row. A field called sku does not exist, so the mapping finds nothing.',
      },
      {
        type: 'single',
        prompt: 'What turned a reading problem into a stock outage on the website?',
        options: [
          'The mapping used default 0 for a missing quantity, so missing data became a real zero',
          'The archive folder was full',
          'The scheduler ran too early',
          'The website cached the old stock',
        ],
        answer: 0,
        explain: 'A default hides the fact that the field was never found. Missing data should stop the load, not write a zero.',
      },
      {
        type: 'multi',
        prompt: 'What do you do right away?',
        options: [
          'Stop the next scheduled load from writing more zeros',
          'Restore yesterday\'s stock levels or reload a corrected file',
          'Read the file with separator set to a semicolon and check a few rows',
          'Ask the supplier never to change format again',
        ],
        answer: [0, 1, 2],
        explain: 'Stop the damage, put back good data, and confirm the right reader settings. Formats will change again, so the import must defend itself.',
      },
      {
        type: 'single',
        prompt: 'The prices now look like 12,50. What else must change?',
        options: [
          'Turn the decimal comma into a point before converting the price to a number',
          'Nothing, numbers read the same',
          'Store prices as text forever',
          'Multiply every price by 100',
        ],
        answer: 0,
        explain: 'A decimal comma does not convert to a number as it is. Replace the comma with a point first, and test values such as 1.234,50 if thousands separators can appear.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Pause the scheduled import',
          'Restore the last good stock levels',
          'Set the reader separator to a semicolon and parse the decimal comma',
          'Reject a file whose header lacks the expected columns',
          'Agree with the supplier how format changes are announced',
        ],
        explain: 'Stop, restore, fix the read, then make a bad file fail loudly next time.',
      },
    ],
  },
  description: `
## Symptoms
- At 05:00 the nightly import set every product to zero stock. The website shows everything as out of stock.
- The file arrived on time and was not empty.

## Change / Context
- The supplier moved to a new export tool last week.
- The import reads the file as \`application/csv\` with default settings and maps \`qty default 0\`.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 05:00:03 INFO  [stock-import] First line: sku;description;qty;unit_price
2026-11-18 05:00:09 INFO  [stock-import] Rows mapped=18240 skuMissing=18240
2026-11-18 05:00:11 INFO  [stock-import] Stock updated products=18240 qty set to 0 by default
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
    'The CSV reader splits on a comma unless told otherwise.',
    'A semicolon file read with a comma gives one column per row.',
    'A default of 0 turned missing data into real zeros.',
    'Check the header for the expected columns before mapping.',
    'Decimal commas must be converted before reading a number.',
    'Stop and restore first, then fix the reader.',
  ],
  solution: `
**Diagnosis.** The new export tool writes semicolons. The reader still splits on commas, so every row is one column. No field is called \`sku\` or \`qty\`, and \`qty default 0\` writes zero for every product.

**Immediate mitigation.**
- Pause the import so the next run does not repeat the damage.
- Restore the last good stock levels, or reload the file with the right settings.

**Root cause.** The import trusted the file format and used a default that hid missing data.

**Permanent fix.**
- Read the file with \`separator=";"\` and turn decimal commas into points before converting prices.
- Before mapping, check the header holds the expected columns. Fail the file and alert if not.
- Remove \`default 0\` on quantity. A missing quantity is an error, not a zero.

**Prevention.** A guard that refuses a load that would zero more than a small share of products. A contract with the supplier on format changes, with a sample file sent first.
`,
  followUps: [
    { q: 'How do you set the separator in DataWeave?', a: 'As a reader property on the CSV type, for example application/csv with separator set to a semicolon, on the source or in the reader settings.' },
    { q: 'Why is a header check better than a row count check?', a: 'Here the row count was normal. Only the columns were wrong, so a header check catches it and a count does not.' },
    { q: 'When is a default right?', a: 'When a missing value really means that value. A missing quantity means you do not know, which is not zero.' },
    { q: 'What guard stops a mass change?', a: 'Compare the new values with the current ones and stop when too many products would change in one run, for a person to approve.' },
  ],
}
