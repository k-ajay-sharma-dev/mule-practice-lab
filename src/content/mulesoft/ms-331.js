export default {
  id: 'ms-331',
  category: 'mulesoft',
  title: 'Repeatable and Non Repeatable Streams in Mule 4',
  level: 'BEGINNER',
  tags: ['myproject', 'large-files', 'streaming', 'repeatable-streams', 'memory'],
  estMinutes: 12,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each streaming strategy to how it behaves.',
      pairs: [
        ['Repeatable in memory', 'Keeps the read bytes in a memory buffer up to a maximum, then fails'],
        ['Repeatable file store', 'Keeps a part in memory and writes the rest to a temp file on disk'],
        ['Non repeatable', 'Can be read once. A second read finds the stream used up'],
      ],
      explain: 'Repeatable streams let several processors read the same payload.',
    },
    {
      type: 'single',
      prompt: 'A flow gets a 40 MB response from an HTTP Request, logs #[payload] with a Logger, then a Transform maps it. With default settings, both steps see the full body. Why?',
      options: [
        'The Logger copies the payload into a variable, and the Transform reads that copy',
        'The HTTP Request reads every response into a string before the flow sees it',
        'The default repeatable stream buffers the bytes, so the Transform reads from the start',
        'The Transform makes the HTTP Request send the call again to get a fresh stream',
      ],
      answer: 2,
      explain: 'Mule 4 makes streams repeatable by default. It buffers the bytes read so far, so a second reader starts again from the first byte. The developer does not have to copy the payload, and the Logger makes no copy. The response is a stream, not a string, and nothing calls the server again. In Mule 3 a second read of a stream often got nothing.',
    },
    {
      type: 'single',
      prompt: 'An app on the Enterprise runtime reads 200 MB files with File Read and no streaming setting. Where do the bytes go once the in memory part of the buffer is full?',
      options: [
        'To a temp file on local disk, since the default is a repeatable file store stream',
        'Into heap until a maximum is hit, since the default is a repeatable in memory stream',
        'Nowhere, since the default is non repeatable and each byte is read only once',
        'To the object store of the app, which holds large payloads between components',
      ],
      answer: 0,
      explain: 'The usual Enterprise default is the repeatable file store stream: a small part stays in memory and the rest spills to a temp file. Repeatable in memory is the community edition default. Non repeatable is never the default, you choose it. The object store is not used for stream buffers. Check the docs for your runtime.',
    },
    {
      type: 'single',
      prompt: 'A 2 GB file is read with a repeatable in memory stream that has a small maximum buffer. What happens?',
      options: [
        'It works, but slower, since the buffer is cleared as it goes',
        'The read fails once the buffer is full',
        'Mule switches to file store when the buffer is full',
        'The payload is cut at the limit with no error',
      ],
      answer: 1,
      explain: 'Raise the limit only if memory allows. File store or non repeatable fit large files better.',
    },
    {
      type: 'single',
      prompt: 'When is a non repeatable stream a good choice?',
      options: [
        'When a Choice router checks the payload content before a write reads it',
        'When the payload is read exactly once, such as an SFTP to blob storage copy',
        'When a Logger logs the payload and a File Write then stores it',
        'When the step that reads it sits in an Until Successful scope',
      ],
      answer: 1,
      explain: 'No other step may read it, and a retry cannot read it again. It has no buffer at all, so it uses the least memory and disk.',
    },
    {
      type: 'single',
      prompt: 'A flow copies 3 GB files from SFTP to blob storage and reads each file once. You want a non repeatable stream to save temp disk. Where do you set it?',
      options: [
        'On the blob storage write, since the component that reads the stream sets its buffer',
        'In the pom.xml, as a setting of the Mule Maven plugin for the whole app',
        'In the output header of the first Transform Message after the read',
        'On the SFTP Read operation that produces the stream, as its streaming strategy',
      ],
      answer: 3,
      explain: 'It is the streaming strategy setting. Each source and operation that returns a stream has its own setting, so you set it on the SFTP Read. The component that reads the stream does not choose how it is buffered. The pom.xml and a DataWeave header have no say in it.',
    },
  ],
  description: `
Hollin Garden Supply copies large files from SFTP to blob storage. A developer added a Logger of the payload for debugging. In production a 1.5 GB file filled the temp disk, and a test with an in memory stream failed with a buffer error.

**Questions**
1. What are the three streaming strategies?
2. Why are streams repeatable by default, and what does that cost?
3. Which strategy fits a straight copy, and why?
`,
  answerTemplate: `## Strategies

## Repeatable by default

## A straight copy
`,
  keyPoints: [
    'Repeatable in memory buffers in memory up to a limit.',
    'Repeatable file store spills to temp disk beyond its memory part.',
    'Non repeatable can be read once and buffers nothing.',
    'Repeatable streams let several processors read the payload.',
    'Every extra read of a large file costs memory or disk.',
    'A straight copy read once fits a non repeatable stream.',
  ],
  solution: `
**1. Strategies.** Repeatable in memory keeps what was read in a memory buffer, up to a maximum. Repeatable file store keeps a part in memory and writes the rest to a temp file. Non repeatable keeps nothing, so it can be read once.

**2. Repeatable by default.** Developers can read the payload in a Logger, a transform and a write without thinking about consumed streams. The cost is that the bytes are kept. For a 1.5 GB file with file store, that is 1.5 GB of temp disk, per file in flight.

**3. A straight copy.** The file is read once, from SFTP into the blob upload. A non repeatable stream moves it with little memory and no temp file. Remove the Logger of the payload and log the file name and size from the attributes instead.
`,
  followUps: [
    {
      q: 'What happens if a non repeatable stream is read twice?',
      a: 'The second reader gets an empty or closed stream, which often shows up as an error or an empty file.',
    },
    {
      q: 'Does the strategy matter for a 10 KB file?',
      a: 'Hardly. It matters when files are large or many are processed at once.',
    },
    {
      q: 'Can you see the temp files of a file store stream?',
      a: 'Yes, in the temp folder of the runtime while the event is in flight. They are removed when the event ends.',
    },
  ],
}
