export default {
  id: 'ms-333',
  category: 'mulesoft',
  title: 'DataWeave Functions That Break Streaming, and Deferred Output',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'large-files', 'dataweave', 'streaming', 'deferred', 'memory'],
  estMinutes: 20,
  quiz: [
    {
      type: 'multi',
      prompt: 'Which of these force DataWeave to read the whole input before it writes anything?',
      options: [
        'payload orderBy (r) -> r.storeId',
        'payload groupBy (r) -> r.storeId',
        'sizeOf(payload)',
        'payload map (r) -> { id: r.id }',
      ],
      answer: [0, 1, 2],
      explain: 'map works one element at a time, so it can stream. Sorting, grouping and counting need all elements.',
    },
    {
      type: 'single',
      prompt: 'A script uses payload twice: once for a header count and once for the rows. What happens with a streamed input?',
      options: [
        'It streams fine',
        'The input must be read fully and kept, since it is read twice, so the benefit of streaming is lost',
        'The second read gets nothing',
        'DataWeave fails at compile time',
      ],
      answer: 1,
      explain: 'Streaming needs one pass in order. Two uses mean the data is kept.',
    },
    {
      type: 'single',
      prompt: 'What does output application/json deferred=true do?',
      options: [
        'Delays the script until later',
        'Lets the writer produce output while the next processor reads it, instead of building the full output first',
        'Compresses the output',
        'Turns off validation',
      ],
      answer: 1,
      explain: 'It helps when the output is large and the target can read a stream, such as a file write or an HTTP request.',
    },
    {
      type: 'single',
      prompt: 'What is the catch with deferred output?',
      options: [
        'None',
        'Errors in the script show up later, while the next processor reads, so they may be raised from that processor instead of the Transform',
        'It works only for XML',
        'It needs a license',
      ],
      answer: 1,
      explain: 'Error handling and logs then point at the writer, which surprises people.',
    },
    {
      type: 'single',
      prompt: 'What does the @StreamCapable() annotation on an input do?',
      options: [
        'Makes any script stream',
        'Asks DataWeave to check that the script reads that input in one pass in order, and fail at compile time if not',
        'Compresses the input',
        'Sets the buffer size',
      ],
      answer: 1,
      explain: 'It turns a silent full read into a clear error. Check that your DataWeave version supports it.',
    },
    {
      type: 'single',
      prompt: 'A large CSV must be sorted by store before it is written. What do you do?',
      options: [
        'orderBy in DataWeave on the whole file',
        'Sort where it is cheap, such as in the source query or the database after loading, or ask the sender for sorted files',
        'Use deferred output',
        'Raise the heap to 32 GB',
      ],
      answer: 1,
      explain: 'Databases sort on disk well. A sort in Mule holds the whole file.',
    },
  ],
  description: `
Thornbury Freight converts a 3 GB CSV of shipment events into JSON lines for a data platform. The script groups events by shipment and counts rows for a header. Memory use climbs to the full heap and the worker restarts.

**Questions**
1. Which parts of the script stop streaming, and why?
2. What do deferred output and @StreamCapable do?
3. How would you rewrite the job so it streams?
`,
  answerTemplate: `## What stops streaming

## Deferred output and @StreamCapable

## A streaming design
`,
  keyPoints: [
    'Streaming means one pass over the input in order.',
    'orderBy, groupBy, sizeOf and other whole set functions read everything.',
    'Using the input twice also forces a full read.',
    'Deferred output writes while the next processor reads.',
    'Errors with deferred output appear in the next processor.',
    '@StreamCapable makes DataWeave check the script reads in one pass.',
  ],
  solution: `
**1. What stops streaming.** \`groupBy\` needs every row before it can return a group, and \`sizeOf\` needs every row to count. The script also reads \`payload\` twice, once to count and once to write. So the whole file is read and kept, in memory or temp disk.

**2. Deferred output and @StreamCapable.** \`deferred=true\` on the output lets the next processor read the output while DataWeave writes it, so the full output is never built. Errors then surface when the next processor reads. \`@StreamCapable()\` on an input asks DataWeave to check that the script reads it in one pass, and to fail if not.

**3. A streaming design.** Read the CSV with the streaming reader property, map each row to a line with \`map\` only, and write with deferred output to a file or upload. Count rows in the same pass, for example in the batch result or by the writer, and put the count in a control file. Let the data platform group by shipment, since it is built for it.
`,
  followUps: [
    {
      q: 'Is filter safe for streaming?',
      a: 'Yes. Like map, it handles one element at a time and keeps nothing.',
    },
    {
      q: 'How do you know a script is not streaming?',
      a: 'Heap or temp disk grows with file size. Test with a file several times bigger than usual and watch both.',
    },
    {
      q: 'Can you group a large file at all in Mule?',
      a: 'If the file is sorted by the group key, you can process it in order and close a group when the key changes.',
    },
  ],
}
