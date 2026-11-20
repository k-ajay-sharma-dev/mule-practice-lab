export default {
  id: 'ms-240',
  category: 'mulesoft',
  title: 'Transforming a Huge File in DataWeave: the streaming Reader Property, @StreamCapable and deferred Output',
  level: 'EXPERT',
  tags: ['myproject', 'dataweave', 'streaming', 'memory', 'reader-properties', 'writer-properties', 'performance', 'large-files', 'telecom'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'Which reader property lets DataWeave read a large JSON input as a stream instead of loading it all?',
      options: ['streaming=true', 'deferred=true', 'indent=false', 'encoding=UTF-8'],
      answer: 0,
      explain: 'streaming is a reader property for formats such as JSON, XML and CSV. deferred is a writer property.',
    },
    {
      type: 'single',
      prompt: 'A script reads a 3 GB JSON array with streaming on and starts with `payload orderBy $.callDate`. What happens?',
      options: [
        'It streams as normal, one record at a time',
        'It cannot stream, because sorting needs every record',
        'DataWeave sorts on disk with no memory cost',
        'The orderBy is skipped while streaming',
      ],
      answer: 1,
      explain: 'Sorting needs every record before the first one can be written. Sorting, grouping and counting need the whole input. Streaming only works when the script reads the input once, from start to end.',
    },
    {
      type: 'multi',
      prompt: 'Which script shapes work well with a streamed input?',
      options: [
        'One `payload map` that turns each record into an output record',
        'A `filter` followed by a `map`, reading the records once in order',
        'Reading `payload` twice, once to count and once to map',
        'Calling `sizeOf(payload)` before mapping',
      ],
      answer: [0, 1],
      explain: 'Each record should be read once, in order. A second pass or a count over the whole input forces DataWeave to keep it.',
    },
    {
      type: 'single',
      prompt: 'What does the @StreamCapable annotation on an input do?',
      options: [
        'It turns any script into a streaming script',
        'It makes DataWeave check the script can stream it',
        'It compresses the input as it is read',
        'It turns on the deferred writer for the output',
      ],
      answer: 1,
      explain: 'It is a guard. DataWeave checks that the script uses that input in a way that can stream, and fails if it does not. A later change that breaks streaming fails at once, instead of passing tests and running out of memory in production.',
    },
    {
      type: 'single',
      prompt: 'The output has `deferred=true`. A record deep in the file has a value that fails a conversion. Where does the error show up?',
      options: [
        'Inside the Transform, before the next step starts',
        'Later, in the step that reads the output',
        'Nowhere, the bad record is skipped',
        'At deploy time, when the script compiles',
      ],
      answer: 1,
      explain: 'With deferred output, the transform runs as its output is read. Errors appear where the output is consumed, so error handling around the Transform alone may not see them.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to make a large transform stream.',
      items: [
        'Measure memory and time with a file of real size',
        'Set the streaming reader property on the input, for example in the source MIME type',
        'Rewrite the script so it reads the records once, in order',
        'Add @StreamCapable to the input to guard the script',
        'Consider deferred output, and test again under load',
      ],
      explain: 'Measure first so you know the change helped, and guard the script so it stays streamable.',
    },
  ],
  description: `
Fenmore Telecom receives a nightly call detail file from a network partner: a JSON array of about 25 million call records, around 3 GB. A Mule app reads it from SFTP, maps each record to the billing system's CSV layout and writes the result to another SFTP folder.

The app runs out of memory halfway through. The current script sorts the records by call date before mapping, and logs the number of records at the start.

**Questions**
1. How can DataWeave read a large input without loading it all?
2. Which parts of the current script stop that, and how would you change them?
3. What do @StreamCapable and deferred output add?
4. What changes for error handling and testing?
`,
  answerTemplate: `## Streaming input

## What stops streaming here

## @StreamCapable and deferred

## Errors and testing
`,
  keyPoints: [
    'The streaming reader property lets DataWeave read JSON, XML or CSV as a stream.',
    'A streamed input must be read once, in order.',
    'Sorting, grouping, counting or reading the input twice stops streaming.',
    '@StreamCapable makes DataWeave check that the script can stream that input.',
    'deferred output passes the result on as it is written.',
    'With deferred output, errors show up where the output is consumed.',
  ],
  solution: `
**1. Streaming input.** By default DataWeave may load the whole input into memory to work on it. With the reader property \`streaming=true\`, it reads a JSON, XML or CSV input as it goes, so a 3 GB file never needs to be in memory at once. Set it where the input is read, for example as part of the MIME type of the SFTP read: \`application/json; streaming=true\`. XML streaming has extra rules, so check the reader properties for your DataWeave version.

**2. What stops it here.** The \`orderBy\` needs every record before it can write the first, so the whole file is kept. The record count at the start reads the input once before the map reads it again. Remove both: ask the partner whether the file is already in date order, or sort later in the billing system, and count the records as they are written, for example in a later step, instead of up front. A script that does one \`payload map\` or \`filter\` then \`map\` reads each record once.

**3. @StreamCapable and deferred.** Putting \`@StreamCapable()\` on the input asks DataWeave to check that the script uses it in a streamable way. If someone later adds a sort, the script fails at once, not after a slow night in production. \`deferred=true\` on the output passes the result on as it is produced, so the SFTP write can start before the transform has finished.

**4. Errors and testing.** With deferred output, a bad record deep in the file fails while the next step reads the output, not inside Transform Message, so handle the error around the write as well. Test with a file of real size and watch memory, because a 1,000 record test file streams or not without showing any difference.
`,
  followUps: [
    {
      q: 'The billing system needs the records in date order. What are the options?',
      a: 'Ask the partner to send the file sorted, sort it in the billing database after loading, or split the file by date into smaller files that each fit in memory.',
    },
    {
      q: 'Does a repeatable stream from SFTP help here?',
      a: 'It lets the payload be read more than once by buffering it, partly to disk. That avoids errors, but buffering 3 GB costs disk and time, so a script that reads once is still better.',
    },
    {
      q: 'Could a batch job do this instead?',
      a: 'Yes, a batch job splits the records and processes them in blocks with its own error handling per record. It suits work per record, such as API calls, more than a straight file to file mapping.',
    },
  ],
}
