export default {
  id: 'ms-334',
  category: 'mulesoft',
  title: 'Streaming Readers for CSV, JSON and XML in DataWeave',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'large-files', 'dataweave', 'reader-properties', 'csv', 'xml'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'How do you ask DataWeave to read a large CSV as a stream?',
      options: [
        'Use output application/csv',
        'Set the reader property streaming=true on the input MIME type, such as application/csv; streaming=true',
        'Rename the file to .stream',
        'Use a Java class',
      ],
      answer: 1,
      explain: 'Without it, the reader may build the whole document in memory before the script runs.',
    },
    {
      type: 'single',
      prompt: 'A JSON file is one large array of records. What must be true for a streaming read?',
      options: [
        'Nothing',
        'The script reads the array elements in order, once, and the reader has streaming=true',
        'The file must be under 10 MB',
        'Every record must have the same keys',
      ],
      answer: 1,
      explain: 'Random access, like payload[-1], forces a full read.',
    },
    {
      type: 'single',
      prompt: 'An XML file has a header and then 2 million <item> elements. What helps the XML reader stream it?',
      options: [
        'Nothing, XML cannot stream',
        'Tell the reader which repeated element to stream, with a property such as collectionPath, and read items in order',
        'Convert it to JSON first',
        'Use XPath on the whole document',
      ],
      answer: 1,
      explain: 'Check the exact property names for your DataWeave version in the XML reader docs.',
    },
    {
      type: 'multi',
      prompt: 'Which scripts can stream a large CSV input?',
      options: [
        'payload map (r) -> { sku: r.SKU, qty: r.QTY as Number }',
        'payload filter (r) -> r.QTY != "0"',
        'payload orderBy (r) -> r.SKU',
        'payload[sizeOf(payload) - 1]',
      ],
      answer: [0, 1],
      explain: 'Sorting and reading the last element need the whole file.',
    },
    {
      type: 'single',
      prompt: 'A file is newline delimited JSON, one record per line. Why is it friendly for large files?',
      options: [
        'It is smaller',
        'Each line is a full record, so a reader can take one line at a time, and a bad line does not break the rest',
        'It has no keys',
        'It is binary',
      ],
      answer: 1,
      explain: 'It also splits into parts at any line break.',
    },
    {
      type: 'single',
      prompt: 'The streaming CSV read works, but the flow still uses lots of memory. What do you check next?',
      options: [
        'The file name',
        'Later steps: a Logger of the payload, a second read of the payload, or functions that need all rows',
        'The CSV separator',
        'The time zone',
      ],
      answer: 1,
      explain: 'Streaming holds only if every step reads once, in order.',
    },
  ],
  description: `
Larkfield Grocers receives three large feeds: store sales as CSV, stock moves as one big JSON array, and supplier catalogues as XML with a header and millions of item elements. Each feed is mapped to rows for a database. All three flows run out of memory on peak days.

**Questions**
1. How do you make each reader stream?
2. What must the script do to keep streaming?
3. Which file formats are friendliest for large files, and why?
`,
  answerTemplate: `## Streaming readers

## Keeping the script streaming

## Friendly formats
`,
  keyPoints: [
    'Set streaming=true as a reader property for CSV and JSON.',
    'For XML, point the reader at the repeated element.',
    'The script reads each input once, in order.',
    'map and filter stream. Sorting, grouping, counting and random access do not.',
    'Line based formats such as CSV and NDJSON split well.',
    'Check every later step for a second read of the payload.',
  ],
  solution: `
**1. Streaming readers.** Set the reader property on the MIME type of the input, such as \`application/csv; streaming=true\` and \`application/json; streaming=true\`. For XML, the reader needs to know which repeated element to stream, through a reader property such as \`collectionPath\`. Check the property names for your version.

**2. Keeping it streaming.** Read the input once, front to back, with \`map\` and \`filter\`. Avoid \`orderBy\`, \`groupBy\`, \`sizeOf\`, indexing from the end and reading \`payload\` twice. Write with deferred output, or feed a batch job that takes records one by one.

**3. Friendly formats.** CSV and newline delimited JSON hold one record per line. Readers can take them a line at a time, files can be split at any line break, and one bad line does not stop the rest. One huge JSON array or XML document must be parsed with care.
`,
  followUps: [
    {
      q: 'Can you ask a sender to change the format?',
      a: 'Often, for new feeds. Ask for line based files and a size limit per file, with a control file.',
    },
    {
      q: 'How do you test that a reader streams?',
      a: 'Run a file much larger than the heap. If it completes with steady memory, the read streams.',
    },
    {
      q: 'Does a streaming read help a small file?',
      a: 'Little. The gain shows when files are large or many run at once.',
    },
  ],
}
