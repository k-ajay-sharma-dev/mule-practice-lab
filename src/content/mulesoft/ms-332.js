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
        'The number of rows, from the attributes of the file listener',
        'A checksum of the content, from the attributes of the file listener',
      ],
      answer: [0, 1, 2],
      explain: 'Name, path, size and last modified time come from the attributes, and the run ID and correlation ID come from the flow. The attributes hold none of the content. The row count and a checksum both need the file to be read. Log the count at the end, when a step has counted it anyway, and compute a checksum while you stream the file.',
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
        'At the start, from a pass that counts the lines before the flow processes them',
        'At the end, from the count the writer or the batch job result already holds',
        'After each step, from sizeOf(payload), so support can follow the progress',
        'At the start, from the file size in the attributes divided by the average row size',
      ],
      answer: 1,
      explain: 'Count once, while the data flows past: the writer or the batch job result already has the number. A counting pass at the start reads the whole file one extra time. sizeOf(payload) after each step reads the stream again each time. Size divided by an average row size is an estimate, not a count, so it cannot show that rows were lost.',
    },
    {
      type: 'single',
      prompt: 'Support wants to see "some rows" when a file fails. What is a safe option?',
      options: [
        'Log the failed row at DEBUG, and raise the app log level when a run fails',
        'Log the line and key of the failed row, and archive the file with access control',
        'Write the failed rows to a reject file in the inbound folder, next to the source',
        'Log the first 20 lines of the file at INFO, together with the error',
      ],
      answer: 1,
      explain: 'Keys point to the row, and the archive keeps the content where access is controlled. A level raised after the failure does not catch the run that failed, and it puts row data in the logs. A reject file in the inbound folder can be picked up by the listener and is open to everyone who reads that folder. The first lines are rarely the failed row, and they put business data in the logs.',
    },
    {
      type: 'single',
      prompt: 'A DEBUG Logger in the large file flow prints the whole payload. Production runs at INFO. What should the team do with it?',
      options: [
        'Keep it, since the runtime strips DEBUG Loggers out of the app at deploy time',
        'Log the file name, size and correlation ID instead of the payload',
        'Keep it, since the logger only prints the first part of a large payload',
        'Move it to INFO, so the payload is in the log when an incident starts',
      ],
      answer: 1,
      explain: 'Someone turns on DEBUG during an incident, and the whole file then lands in the log and has to be read to build the line. A few facts about the file are enough to trace it. The runtime does not remove Loggers at deploy. The Logger prints the whole message it is given, with no cut off. Moving it to INFO writes every large file to the log on every run.',
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
