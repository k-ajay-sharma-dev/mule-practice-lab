export default {
  id: 'ms-359',
  category: 'mulesoft',
  title: 'OutOfMemoryError on a Large File Flow: What to Check First',
  level: 'ADVANCED',
  tags: ['myproject', 'large-files', 'production-support', 'memory', 'streaming', 'troubleshooting'],
  estMinutes: 25,
  quiz: [
    {
      type: 'order',
      prompt: 'A worker crashed with OutOfMemoryError while processing a 1.5 GB file. Put the first steps in order.',
      items: [
        'Note the file, its size and the time, and check whether smaller files of the same feed pass',
        'Find the last log line before the crash to see which step was running',
        'Look at that step for anything that reads the whole payload: a logger, sizeOf, groupBy, orderBy or a non streaming read',
        'Check the worker size, the streaming strategy and whether a heap dump was written',
      ],
      explain: 'Most memory problems come from one step that needs the whole file at once.',
    },
    {
      type: 'multi',
      prompt: 'Which steps force the whole file into memory?',
      options: [
        'A logger that prints #[payload]',
        'DataWeave that uses groupBy, orderBy or sizeOf on the whole input',
        'A non repeatable stream read once with a streaming reader',
        'Converting the payload to a Java string to check its length',
      ],
      answer: [0, 1, 3],
      explain: 'Reading once with a streaming reader is the pattern that keeps memory flat.',
    },
    {
      type: 'single',
      prompt: 'The flow uses the default repeatable in memory stream and two steps read the payload. What happens with a large file?',
      options: [
        'Nothing',
        'The stream buffers what was read so it can be read again, and the buffer grows with the file up to its limit',
        'The second read fails at once',
        'The file is written to the database',
      ],
      answer: 1,
      explain: 'Use a repeatable file store stream, or design the flow to read once.',
    },
    {
      type: 'single',
      prompt: 'A Scatter Gather sends the payload to two routes. Why can memory double?',
      options: [
        'It cannot',
        'Each route needs the content, so a stream is buffered for both, and the results are collected together at the end',
        'Scatter Gather compresses data',
        'It only runs one route',
      ],
      answer: 1,
      explain: 'Pass a reference, such as a blob path, to the routes instead of the content.',
    },
    {
      type: 'single',
      prompt: 'How do you get evidence after the next crash?',
      options: [
        'Restart and hope',
        'Turn on a heap dump on OutOfMemoryError where the platform allows it, and log heap use and file size per run',
        'Turn off logging',
        'Use a bigger worker only',
      ],
      answer: 1,
      explain: 'A heap dump shows which objects filled memory. Check how your deployment model supports it.',
    },
    {
      type: 'single',
      prompt: 'Is a bigger worker the right fix?',
      options: [
        'Always',
        'Only as a stopgap. If memory grows with file size, the next bigger file crashes again',
        'Never, it has no effect',
        'Only for small files',
      ],
      answer: 1,
      explain: 'Fix the step that holds the whole file, then size the worker for real peaks.',
    },
  ],
  description: `
Fenwick Supply receives a weekly inventory snapshot from a supplier. It used to be 300 MB. This week it was 1.5 GB, and the worker crashed with OutOfMemoryError. The flow reads the file, logs it at debug level, validates rows in DataWeave, and sends the content to a Scatter Gather that stores a copy and runs the load.

**Questions**
1. What do you check first?
2. Which steps hold the whole file in memory?
3. How do streams, repeatable streams and Scatter Gather affect memory?
4. How do you fix it, and is a bigger worker enough?
`,
  answerTemplate: `## First checks

## Steps that hold the whole file

## Streams and Scatter Gather

## The fix
`,
  keyPoints: [
    'Find the step that was running at the crash.',
    'Loggers of the payload and whole input functions load everything.',
    'Repeatable in memory streams grow with what is read.',
    'Scatter Gather can buffer the content for each route.',
    'Read once with a streaming reader and pass references.',
    'A bigger worker is only a stopgap.',
  ],
  solution: `
**1. First checks.** Note the file, size and time. Check whether smaller files pass. Find the last log line before the crash to see the step. Check the worker size and whether a heap dump exists.

**2. Steps that hold the whole file.** A logger with \`#[payload]\`, even at debug level if debug is on. DataWeave with \`groupBy\`, \`orderBy\`, \`sizeOf\` or anything that looks at all rows at once. Converting the payload to a string.

**3. Streams and Scatter Gather.** A repeatable in memory stream keeps what was read so it can be read again, so two readers make the buffer grow with the file. Scatter Gather gives each route the content and collects results, which can double the memory.

**4. The fix.** Log size and counts, not content. Read the file once with a streaming reader and deferred output. Use a file store stream if it must be read twice. Store the file once and give later steps a reference. Use a bigger worker only as a stopgap while the fix is made.
`,
  followUps: [
    {
      q: 'How do you validate rows without groupBy on the whole file?',
      a: 'Check each row on its own as it streams, and push checks that need all rows, such as duplicates, into the database after loading staging.',
    },
    {
      q: 'Why did the 300 MB file pass?',
      a: 'It fit in the heap with all copies. Memory use grew with the file, so a bigger file crossed the limit.',
    },
    {
      q: 'What would you add to monitoring?',
      a: 'File size per run, peak heap per worker and an alert when a file is far larger than usual, before the flow starts on it.',
    },
  ],
}
