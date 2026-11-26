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
        'A repeatable file store stream, which moves data past its buffer to temp disk',
        'A logger that prints #[attributes.fileName] and #[attributes.size]',
      ],
      answer: [0, 1, 3],
      explain: 'Printing the payload, grouping, sorting or counting the whole input, and turning it into a string all need every byte in memory at once. Reading once with a streaming reader is the pattern that keeps memory flat. A file store stream keeps only its buffer in memory and puts the rest on temp disk. Logging attributes does not touch the content.',
    },
    {
      type: 'single',
      prompt: 'The flow sets a repeatable in memory stream with a large maximum buffer, and two steps read the payload. What happens with a large file?',
      options: [
        'Each step reads the file again from the server, so memory stays flat',
        'The buffer keeps what was read, so it grows with the file',
        'The second read fails at once, since the stream is consumed',
        'The stream spills to a temporary file once the buffer is full',
      ],
      answer: 1,
      explain: 'The stream buffers what was read so it can be read again, up to its maximum buffer size. Spilling to disk is what a repeatable file store stream does, the default on the Enterprise runtime. Use that, or design the flow to read once.',
    },
    {
      type: 'single',
      prompt: 'A Scatter Gather sends the payload to two routes. Why can memory double?',
      options: [
        'Scatter Gather turns a streamed payload into a Java string before it splits',
        'Each route needs the content, and all results are held until the end',
        'Each route runs on its own worker, with its own copy of the heap',
        'The routes run in turn, and the first route keeps its copy for the second',
      ],
      answer: 1,
      explain: 'A stream is buffered so both routes can read it, and the results are collected together at the end. Pass a reference, such as a blob path, to the routes instead of the content.',
    },
    {
      type: 'single',
      prompt: 'How do you get evidence after the next crash?',
      options: [
        'Set the root log level to DEBUG so every step logs its payload',
        'Write a heap dump on OutOfMemoryError, and log file size per run',
        'Move the flow to a bigger worker and watch whether it crashes again',
        'Add a Try scope that catches the OutOfMemoryError and logs it',
      ],
      answer: 1,
      explain: 'Turn on the heap dump where the platform allows it, and log heap use and file size per run. A heap dump shows which objects filled memory. Check how your deployment model supports it. An OutOfMemoryError is a JVM error, not a Mule error a Try scope can handle, and DEBUG payload logs add to the memory problem.',
    },
    {
      type: 'single',
      prompt: 'Is a bigger worker the right fix?',
      options: [
        'Yes, if it has at least twice the heap of the largest file seen',
        'Only as a stopgap while the step that holds the file is fixed',
        'No, since the heap size does not change with the worker size',
        'Yes, once streaming is turned off so memory use is predictable',
      ],
      answer: 1,
      explain: 'If memory grows with file size, the next bigger file crashes again. Fix the step that holds the whole file, then size the worker for real peaks.',
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
