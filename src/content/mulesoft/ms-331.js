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
      prompt: 'Why does Mule 4 make streams repeatable by default?',
      options: [
        'To make files smaller',
        'So a Logger, a transform and a write can all read the payload without the developer copying it',
        'To encrypt data',
        'Because Java needs it',
      ],
      answer: 1,
      explain: 'In Mule 3 a second read of a stream often got nothing. Mule 4 buffers the bytes read so far.',
    },
    {
      type: 'single',
      prompt: 'Which strategy is the usual default in the Enterprise runtime?',
      options: ['Non repeatable', 'Repeatable in memory', 'Repeatable file store', 'None'],
      answer: 2,
      explain: 'The community edition defaults to in memory. Check the docs for your runtime.',
    },
    {
      type: 'single',
      prompt: 'A 2 GB file is read with a repeatable in memory stream that has a small maximum buffer. What happens?',
      options: [
        'It works, slower',
        'The read fails once the buffer is full',
        'Mule switches to file store on its own',
        'The file is cut at the limit without an error',
      ],
      answer: 1,
      explain: 'Raise the limit only if memory allows. File store or non repeatable fit large files better.',
    },
    {
      type: 'single',
      prompt: 'When is a non repeatable stream a good choice?',
      options: [
        'Always',
        'When the payload is read exactly once, such as a file copied from SFTP to blob storage with no other step reading it',
        'When you log the payload',
        'When two steps read it',
      ],
      answer: 1,
      explain: 'It has no buffer at all, so it uses the least memory and disk.',
    },
    {
      type: 'single',
      prompt: 'Where do you set the strategy?',
      options: [
        'In the pom.xml',
        'On the operation that produces the stream, such as a File Read or HTTP Request, in its streaming strategy setting',
        'In the Logger',
        'In the DataWeave header',
      ],
      answer: 1,
      explain: 'Each source and operation that returns a stream has its own setting.',
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
