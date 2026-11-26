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
        'payload filter (r) -> r.qty > 0',
      ],
      answer: [0, 1, 2],
      explain: 'Sorting, grouping and counting need all elements before the first result can be written. map and filter work one element at a time, so they can stream.',
    },
    {
      type: 'single',
      prompt: 'A script uses payload twice: once for a header count and once for the rows. What happens with a streamed input?',
      options: [
        'It streams fine, since each use reads its own copy of the stream',
        'The input is read fully and kept for the second use, so streaming is lost',
        'The second use finds the stream used up and gets an empty list',
        'DataWeave fails at compile time because of the double use',
      ],
      answer: 1,
      explain: 'Streaming needs one pass in order. Two uses mean the data is kept.',
    },
    {
      type: 'single',
      prompt: 'A Transform reads its input with streaming=true and maps it to a 1.5 GB JSON output that a File Write saves. The worker runs out of heap inside the Transform. Which change helps most?',
      options: [
        'Set a repeatable file store stream on the File Write, so the output spills to disk',
        'Add deferred=true to the output directive, so the output streams into the File Write',
        'Add @StreamCapable() to the input, so the output of the script is streamed too',
        'Change the output to application/java, so no JSON text is built in memory',
      ],
      answer: 1,
      explain: 'With deferred=true the writer produces output while the next processor reads it, so the full output is not built first. It helps when the output is large and the target can read a stream, such as a file write or an HTTP request. A streaming strategy belongs to the operation that produces a stream, not to a write. @StreamCapable() checks how the input is read. Java output still builds the whole object in memory.',
    },
    {
      type: 'single',
      prompt: 'A Transform with output application/json deferred=true feeds a File Write. At row 80,000 the script hits a value it cannot coerce. Where does the error show up?',
      options: [
        'In the File Write while it reads the output, with part of the file already written',
        'In the Transform, before any byte of the output reaches the file',
        'Nowhere, since deferred output skips the rows that raise errors',
        'At deploy time, since a deferred script is checked in full before it runs',
      ],
      answer: 0,
      explain: 'With deferred output, script errors show up later, while the next processor reads the output. They may be raised from that processor instead of the Transform. Error handling and logs then point at the writer, which surprises people, and a part file may be left behind. Errors are not skipped, and a coercion error on data cannot be found at deploy time.',
    },
    {
      type: 'single',
      prompt: 'An input has @StreamCapable(). The script reads payload[-1].total for a summary line, then maps the rows. What happens?',
      options: [
        'It works, and the input is buffered in full so that the last element can be read',
        'It works, since the annotation makes the input repeatable for a second read',
        'It fails with an error, since the input must be read once, in order, and [-1] needs the end',
        'It works for JSON, since the annotation is checked only for CSV input',
      ],
      answer: 2,
      explain: 'The annotation checks that the script reads that input once and in order, and fails if not. Reading the last element and then mapping the rows breaks both rules. Without the annotation the script would work by buffering the whole input in silence. It turns a silent full read into a clear error, and it does not make the input repeatable. Check that your DataWeave version supports it.',
    },
    {
      type: 'single',
      prompt: 'A large CSV must be sorted by store before it is written. What do you do?',
      options: [
        'orderBy in DataWeave on the whole file, with deferred output',
        'Sort where it is cheap, such as in the source query or the database',
        'Split the file into parts and sort each part in DataWeave',
        'Add @StreamCapable() so orderBy runs in one pass',
      ],
      answer: 1,
      explain: 'The database can sort after loading, or the sender can send sorted files. Sorting parts does not sort the whole file, and @StreamCapable() makes a script with orderBy fail. Databases sort on disk well. A sort in Mule holds the whole file.',
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
