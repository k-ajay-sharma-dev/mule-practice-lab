export default {
  id: 'ms-332',
  category: 'mulesoft',
  title: 'Logging a Large File Flow Without Reading the Payload',
  level: 'BEGINNER',
  tags: ['myproject', 'large-files', 'logging', 'streaming', 'attributes'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'A Logger has message="#[payload]" in a flow that moves a 900 MB file. What happens?',
      options: [
        'It logs the first line, since a Logger stops at a size limit',
        'It reads the whole stream into a string, which costs memory and log space',
        'Nothing extra, since a Logger reads streams without buffering them',
        'It logs the file name, since the payload is only a file handle',
      ],
      answer: 1,
      explain: 'It can also fill the temp disk and expose data. The log line may also be huge and slow down the log system.',
    },
    {
      type: 'multi',
      prompt: 'What can you log about a file without reading its content?',
      options: [
        'The file name and path from the attributes',
        'The size and last modified time from the attributes',
        'The run ID and correlation ID',
        'The number of rows',
      ],
      answer: [0, 1, 2],
      explain: 'The row count needs the file to be read. Log it at the end, when a step has counted it anyway.',
    },
    {
      type: 'single',
      prompt: 'Does sizeOf(payload) in a log message read the stream?',
      options: [
        'No, it reads the length from the stream header',
        'Yes. For a list or a string it has to read everything to count',
        'Only for JSON, since other formats carry a length',
        'No, it returns the number of bytes read so far',
      ],
      answer: 1,
      explain: 'Use the size in bytes from the attributes for files.',
    },
    {
      type: 'single',
      prompt: 'Where should the row count of a large file be logged?',
      options: [
        'Before reading the file, from a quick count of its lines',
        'At the end, from a step that counts while it processes, such as the writer',
        'In every step, so support can follow progress through the flow',
        'Never, since the size in bytes is enough for support',
      ],
      answer: 1,
      explain: 'The batch job result also has counts. Count once, while the data flows past.',
    },
    {
      type: 'single',
      prompt: 'Support wants to see "some rows" when a file fails. What is a safe option?',
      options: [
        'Log the whole file at DEBUG, and turn DEBUG on when a run fails',
        'Log the line and key of the failed row, and archive the file with access control',
        'Email the file to the support group whenever a run fails',
        'Log the first 10,000 lines, which is enough to find most problems',
      ],
      answer: 1,
      explain: 'Keys point to the row. The archive keeps the content where access is controlled.',
    },
    {
      type: 'single',
      prompt: 'A DEBUG Logger prints the payload. Production runs at INFO. Is the payload still read?',
      options: [
        'Never, since the runtime removes DEBUG Loggers when it deploys',
        'Usually not, since the message is not built when the level is off',
        'Always, since the message is built before the level is checked',
        'Only once, on the first event after the app starts',
      ],
      answer: 1,
      explain: 'Check your logger, and avoid payload in log messages for large flows anyway. Someone turns on DEBUG during an incident, and the large file then lands in the log.',
    },
  ],
  description: `
Pellow Pharmacy moves daily sales files of up to 1 GB from SFTP to a database. Each flow has Loggers with \`#[payload]\` from development. In production, the log system rejected huge events, memory use jumped, and customer IDs appeared in the logs.

**Questions**
1. What is wrong with logging the payload in a large file flow?
2. What do you log instead, and when?
3. How does support find a bad row without the payload in the log?
`,
  answerTemplate: `## Logging the payload

## What to log

## Finding a bad row
`,
  keyPoints: [
    'Logging the payload reads the whole stream.',
    'It costs memory, temp disk and log space and can expose data.',
    'Log name, size and time from the attributes.',
    'Log run ID and correlation ID on every line.',
    'Log counts at the end from steps that counted anyway.',
    'Log line numbers and keys for bad rows, and keep the file in an archive.',
  ],
  solution: `
**1. Logging the payload.** \`#[payload]\` turns the whole stream into one string. For a 1 GB file that means the bytes are buffered and copied into a giant log event. The log system rejects it, memory jumps, and personal data lands in a place with wide access.

**2. What to log.** At the start, log the file name, path, size and modified time from the attributes, with the run ID and correlation ID. At the end, log the row counts from the batch job result or the writer, and the elapsed time.

**3. Finding a bad row.** Log the line number, record key and error code of each failed row, or write them to a reject table. Keep the file in an archive folder with access control, named with the run ID, so support can open it when needed.
`,
  followUps: [
    {
      q: 'How would you log a sample of a row safely?',
      a: 'Log only key fields and mask the rest, and only for failed rows, not for every row.',
    },
    {
      q: 'Why include the run ID in every log line?',
      a: 'Several files may run at once. The run ID lets you filter one file from start to end.',
    },
    {
      q: 'What is a cheap way to know a file is not truncated?',
      a: 'Compare its size with the size in a control file or the source listing, before processing.',
    },
  ],
}
