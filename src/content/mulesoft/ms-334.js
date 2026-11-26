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
      prompt: 'A 6 GB CSV is mapped row by row in a Transform, yet the heap fills before the first row is written. The File Read uses a repeatable file store stream. What is missing?',
      options: [
        'A non repeatable stream on the File Read, so no buffer is kept for the bytes',
        'The deferred=true writer property on the output directive of the script',
        'The output header application/csv streaming=true in the script',
        'The reader property streaming=true on the input MIME type of the file',
      ],
      answer: 3,
      explain: 'Set the reader property on the source, for example application/csv; streaming=true. Without it, the reader may build the whole document in memory before the script runs, whatever the stream strategy is. The stream strategy only decides how bytes are buffered, and the file store keeps them on disk. deferred=true helps the output, not the read, and streaming is a reader property, not an output one.',
    },
    {
      type: 'single',
      prompt: 'A JSON file is one large array of records. What must be true for a streaming read?',
      options: [
        'The file is pretty printed with one record per line, so the reader can split it',
        'The script reads the elements once, in order, and the reader has streaming=true',
        'The file fits in heap, since the JSON reader parses the whole array first',
        'Every record in the array has the same keys, like the rows of a CSV',
      ],
      answer: 1,
      explain: 'Random access, like payload[-1], forces a full read.',
    },
    {
      type: 'single',
      prompt: 'An XML file has a header and then 2 million <item> elements. What helps the XML reader stream it?',
      options: [
        'Nothing, since the XML reader cannot stream at all',
        'Tell the reader which repeated element to stream, such as with collectionPath',
        'Convert it to JSON first with a Java library, then stream that',
        'Select the items with an XPath over the whole document in the script',
      ],
      answer: 1,
      explain: 'The script must also read the items in order. Check the exact property names for your DataWeave version in the XML reader docs.',
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
        'It is much smaller than a JSON array with the same records',
        'Each line is a full record, so a reader can take one line at a time',
        'It carries no field names, so each line parses as fast as a CSV row',
        'It is stored as binary, so the reader skips parsing the text',
      ],
      answer: 1,
      explain: 'A bad line does not break the rest. It also splits into parts at any line break.',
    },
    {
      type: 'single',
      prompt: 'The streaming CSV read works, but the flow still uses lots of memory. What do you check next?',
      options: [
        'The file extension, since only .csv files are read as a stream',
        'Later steps: a Logger of the payload, a second read, or functions that need all rows',
        'The CSV separator, since a wrong one makes the reader buffer',
        'The header setting, since a header row makes the reader load all rows',
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
