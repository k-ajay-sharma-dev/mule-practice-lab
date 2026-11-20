export default {
  id: 'inc-193',
  category: 'incidents',
  title: 'A Partner Rejects Every Order After a CSV Source Is Added: Quantities Sent as Text in JSON',
  level: 'BEGINNER',
  tags: ['dataweave', 'csv', 'json', 'types', 'partners'],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: '2026-11-18 10:20:01 INFO  [order-sync] File read fileName=orders_1020.csv rows=64', relevant: false },
      { text: '2026-11-18 10:20:03 WARN  [order-sync] Partner answered 400 orderId=WB-7701 body={"error":"quantity must be a number"}', relevant: true, why: 'The partner expects a number and gets something else.' },
      { text: '2026-11-18 10:20:03 DEBUG [order-sync] Request body {"orderId":"WB-7701","sku":"LM-220","quantity":"5","price":"12.40"}', relevant: true, why: 'Quantity and price are strings in quotes.' },
      { text: '2026-11-18 10:20:04 INFO  [order-sync] Orders from the web shop sent=118 failed=0', relevant: true, why: 'Orders from the JSON source still work, so the problem is in the CSV path.' },
      { text: '2026-11-18 10:21:00 INFO  [order-sync] Scheduler idle', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why are the quantities sent as text?',
        options: [
          'CSV values are read as strings, and the mapping copies them as they are',
          'The JSON writer quotes every value unless the output sets `quoteValues=false`',
          'The partner changed its schema on Monday to require numbers in quotes',
          'The CSV reader reads numbers as numbers, but the HTTP Request turns them to text',
        ],
        answer: 0,
        explain: 'A CSV file carries no types, so DataWeave reads every value as a string. Without "as Number" they stay strings in the output.',
      },
      {
        type: 'single',
        prompt: 'Which mapping line fixes quantity?',
        options: ['`quantity: row.quantity as Number`', '`quantity: row.quantity as String`', '`quantity: row.quantity default 0`', '`quantity: (row.quantity as Number) as String`'],
        answer: 0,
        explain: 'Convert the string to a number. A default would not change its type, and it would hide a missing value. Converting back to a String undoes the fix.',
      },
      {
        type: 'multi',
        prompt: 'What else should the CSV mapping check?',
        options: [
          'That the value converts, and send the row to an error list if it does not',
          'Price as a number too',
          'That `orderId` is converted to a Number as well',
          'That `sku` is converted to a Number as well',
        ],
        answer: [0, 1],
        explain: 'Every value from a CSV is text. Convert each one to the type the partner schema needs and handle the rows that do not convert. `orderId` and `sku` are text in the schema, and values such as `WB-7701` would not convert anyway.',
      },
      {
        type: 'single',
        prompt: 'Why did the web shop orders keep working?',
        options: [
          'JSON input already carries numbers, so the same copy keeps them numbers',
          'Web shop orders go to a different partner endpoint that accepts text',
          'The web shop path converts every value with `as Number` before the mapping',
          'The partner checks types only on orders that arrive in a file batch',
        ],
        answer: 0,
        explain: 'The types come from the source. The same mapping gives numbers for JSON and strings for CSV.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Hold the CSV orders that failed',
          'Convert quantity and price to numbers in the CSV mapping',
          'Send the held orders again',
          'Add a test with a CSV row to the mapping tests',
          'Validate the request against the partner schema before sending',
        ],
        explain: 'Hold, fix, resend, then add the test and a schema check so it cannot return quietly.',
      },
    ],
  },
  description: `
## Symptoms
- Since a CSV order source was added on Monday, every CSV order is rejected by the partner with 400.
- Orders from the web shop, which arrive as JSON, still work.

## Change / Context
- The team reused the existing JSON mapping for the CSV rows: \`quantity: row.quantity\`, \`price: row.price\`.
- The partner API schema says quantity is an integer and price a number. \`orderId\` and \`sku\` are strings.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 10:20:03 WARN  [order-sync] Partner answered 400 orderId=WB-7701 body={"error":"quantity must be a number"}
2026-11-18 10:20:03 DEBUG [order-sync] Request body {"orderId":"WB-7701","sku":"LM-220","quantity":"5","price":"12.40"}
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
    'CSV values are read as strings.',
    'A mapping copies the type it receives, so CSV text stays text in JSON.',
    'Convert each value with as Number, as Date and so on.',
    'Send rows that do not convert to an error list.',
    'Test mappings with every source format.',
    'Validate against the partner schema before sending.',
  ],
  solution: `
**Diagnosis.** The CSV reader gives strings. The reused mapping copies them, so the JSON holds \`"quantity":"5"\` and the partner rejects it.

**Immediate mitigation.** Hold the failed CSV orders, deploy the fixed mapping, and send them again.

**Root cause.** A mapping written for typed JSON input was reused for untyped CSV input without converting the values.

**Permanent fix.** In the CSV path, write \`quantity: row.quantity as Number\` and \`price: row.price as Number\`. Rows that fail to convert go to an error list with the reason.

**Prevention.** Mapping tests with a CSV sample. A schema check of the request before it is sent, so a wrong type fails in Mule with a clear message.
`,
  followUps: [
    { q: 'What happens if a CSV quantity is "five"?', a: 'as Number fails. Catch it per row, so one bad row goes to the error list and the rest are sent.' },
    { q: 'Why not let the partner convert?', a: 'Their contract says number. Sending the right type is your side of the contract.' },
    { q: 'Do decimal prices need care?', a: 'Yes. Check the separator in the file, and keep prices as numbers, not floats you round by hand.' },
    { q: 'Where would a schema check go?', a: 'Before the HTTP Request, using the partner JSON schema with the JSON module or an APIkit-style validation.' },
  ],
}
