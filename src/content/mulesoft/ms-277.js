export default {
  id: 'ms-277',
  category: 'mulesoft',
  title: 'Streaming a Large Inventory Snapshot to the Planning Platform Over SFTP Without Running Out of Memory',
  level: 'ADVANCED',
  tags: ['myproject', 'sftp', 'large-files', 'streaming', 'database', 'planning-platform', 'inventory-feed'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'A flow selects 9 million inventory rows and writes them as one CSV file over SFTP. Which setup keeps memory flat?',
      options: [
        'Select all rows into a variable, transform, then write',
        'Stream the select with a fetch size, let DataWeave write CSV as a stream, and pass that stream to the SFTP Write',
        'Split the rows into 9 million messages',
        'Raise the heap to 16 GB',
      ],
      answer: 1,
      explain: 'Rows flow from the database through DataWeave to the server in pieces. No step holds the whole file.',
    },
    {
      type: 'single',
      prompt: 'Someone adds a Logger with the payload before the SFTP Write. What happens with a 2 GB stream?',
      options: [
        'It logs the first line only',
        'The logger reads the whole stream into a String, which can exhaust memory and fill the logs',
        'Nothing changes',
        'The SFTP Write gets faster',
      ],
      answer: 1,
      explain: 'Log counts, file names and sizes, never the content of a large file.',
    },
    {
      type: 'multi',
      prompt: 'Which DataWeave steps stop a large transform from streaming?',
      options: [
        'groupBy or orderBy over the whole input',
        'sizeOf(payload) before the main map',
        'A plain map that writes each row once',
        'Referring to the payload twice in a way that needs it all at once',
      ],
      answer: [0, 1, 3],
      explain: 'A forward only map can stream. Anything that needs all rows at once forces DataWeave to keep them.',
    },
    {
      type: 'single',
      prompt: 'The SFTP Write fails at 70 percent. What is on the partner server if Mule wrote straight to the final name?',
      options: [
        'Nothing',
        'A partial file under the final name, which the partner may load',
        'The full file',
        'An error file',
      ],
      answer: 1,
      explain: 'This is why large uploads go to a temporary name and are renamed only when complete.',
    },
    {
      type: 'single',
      prompt: 'The snapshot is 1.8 GB of text. What often cuts the transfer time most?',
      options: [
        'More SSH keys',
        'Compressing it, for example as gzip or zip, if the planning platform accepts compressed files',
        'Writing it twice',
        'Using APPEND mode',
      ],
      answer: 1,
      explain: 'Text files with repeated codes often compress to a fraction of their size. Agree the format with the receiver first.',
    },
    {
      type: 'single',
      prompt: 'Where should the record count for the trailer or control file come from in a streamed run?',
      options: [
        'sizeOf on the full payload before writing',
        'A separate count query in the same snapshot, or a counter kept while streaming, written after the data',
        'A guess from yesterday',
        'The partner',
      ],
      answer: 1,
      explain: 'Counting the stream before writing would load it. Count separately, or write the control file after the data with the count gathered on the way.',
    },
  ],
  description: `
Marrow & Pine Home sends a nightly inventory snapshot to the planning platform: one row per store and item, about 9 million rows and 1.8 GB as CSV. The data comes from a SQL Server database and goes to the platform's SFTP server. The first version ran out of memory on a 4 GB worker.

**Questions**
1. Why did the flow run out of memory?
2. How do you stream from the database to the SFTP server?
3. What do you avoid in the flow and the DataWeave script?
4. How do you make the file safe and quick to deliver?
`,
  answerTemplate: `## Why it ran out of memory

## Streaming end to end

## Things to avoid

## Safe and quick delivery
`,
  keyPoints: [
    'Holding all rows or the whole file in memory breaks large runs.',
    'Stream the select with a fetch size, write CSV with DataWeave streaming, pass the stream to SFTP Write.',
    'Avoid logging content, converting to String, sorting or grouping the whole set.',
    'Write to a temporary name and rename when complete.',
    'Compress if the receiver accepts it. Count records separately for the control file.',
  ],
  solution: `
**1. Why it ran out of memory.** The first version selected all rows into a list, built the CSV as a String and then wrote it. Each step held the full data set, and some held it twice.

**2. Streaming end to end.** Let the database select return a stream with a sensible fetch size, so rows arrive in pages. Order rows in SQL if the platform needs an order. The DataWeave script maps each row to a CSV line with streaming turned on, and its output stream goes straight into the SFTP Write. Memory use stays close to one page of rows, whatever the total.

**3. Things to avoid.** A Logger with the payload, variables that hold the payload as a String, sizeOf on the input, and groupBy or orderBy over all rows in DataWeave. Each one forces the whole data set into memory. Log the row count and file size instead.

**4. Safe and quick delivery.** Write to a temporary name and rename when the write completes, so the platform never loads a partial file. Get the record count from a count query in the same snapshot, or count while streaming, and write the control file after the data. Compress the file if the platform accepts it: text with repeated store and item codes shrinks a lot.
`,
  followUps: [
    {
      q: 'The platform wants the trailer as the last line of the same file. How do you get the count?',
      a: 'Run a count query first and pass it in as a variable, or keep a running count in the script output. Both avoid reading the stream twice.',
    },
    {
      q: 'Why not use a Batch Job here?',
      a: 'Batch suits record level work with errors per record. Writing one file in order is a straight stream, and batch would add disk queues and aggregation for no gain.',
    },
    {
      q: 'How do you test this before go live?',
      a: 'Run it against a copy with full volume on the same worker size, and watch heap, disk and time. Small test data hides memory problems.',
    },
  ],
}
