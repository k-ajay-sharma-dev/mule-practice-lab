export default {
  id: 'ms-338',
  category: 'mulesoft',
  title: 'Sizing Memory and Temp Disk for Large File Flows',
  level: 'ADVANCED',
  tags: ['myproject', 'large-files', 'sizing', 'memory', 'temp-disk', 'concurrency'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'A flow reads files with a repeatable file store stream. Four 3 GB files arrive at once. Roughly how much temp disk can the buffers need?',
      options: [
        'About 3 GB, since the buffers are shared between files',
        'About 12 GB, one buffer per file in flight',
        'About 512 KB, the in memory part of each buffer',
        'None, since file store streams read straight from the source',
      ],
      answer: 1,
      explain: 'Each stream that is read fully spills to its own temp file.',
    },
    {
      type: 'multi',
      prompt: 'What uses heap in a large file flow?',
      options: [
        'In memory stream buffers',
        'DataWeave scripts that sort, group or read the payload twice',
        'Batch blocks and aggregator groups in progress',
        'The file attributes, such as name, size and time',
      ],
      answer: [0, 1, 2],
      explain: 'Find the step that holds the most data at once. It sets the size.',
    },
    {
      type: 'single',
      prompt: 'How do you limit how many large files run at once?',
      options: [
        'You cannot, since each file starts its own run of the flow',
        'Set max concurrency on the flow, so only a few files run at once',
        'Use a smaller worker, so fewer threads are available',
        'Poll less often, so fewer files arrive in each poll',
      ],
      answer: 1,
      explain: 'Polling less often does not help when four files land together, since one poll picks up all of them. Concurrency times the size per file is the real memory and disk need.',
    },
    {
      type: 'single',
      prompt: 'A cloud worker has a small local disk. What is the risk with file store streams?',
      options: [
        'None, since temp files go to network storage with no limit',
        'Temp files can fill the disk, which fails the flow and can hurt the whole app',
        'Disk buffers are slower, so the flow times out on large files',
        'Temp files survive a restart and are read again by mistake',
      ],
      answer: 1,
      explain: 'Check the temp disk limits of your platform and worker size.',
    },
    {
      type: 'single',
      prompt: 'Heap use grows with file size, though the flow should stream. What do you do first?',
      options: [
        'Double the heap so the largest file fits with room to spare',
        'Find the step that keeps all the data, such as a Logger, a second read or a sort',
        'Restart the app every night to clear what has built up',
        'Tune garbage collection so the heap is freed sooner',
      ],
      answer: 1,
      explain: 'A non streaming reader also keeps all the data. A bigger heap hides the problem until the next larger file.',
    },
    {
      type: 'single',
      prompt: 'What is a sound sizing test?',
      options: [
        'One small file on a laptop, with the numbers scaled up after',
        'The largest file, as many at once as expected, on the target worker size',
        'A unit test of each flow with a mocked file as input',
        'The sizing table in the docs for the chosen worker type',
      ],
      answer: 1,
      explain: 'Watch heap, temp disk and time. Add a margin above the largest file seen, since files grow over time.',
    },
  ],
  description: `
Pellow Pharmacy runs its file flows on small cloud workers. At month end, several 3 GB files arrive together. The app ran out of temp disk and then of heap. The team asks whether to buy bigger workers.

**Questions**
1. What uses memory and temp disk in a large file flow?
2. How do concurrency and file size combine?
3. How do you find what holds the data?
4. How do you size and test?
`,
  answerTemplate: `## Memory and temp disk

## Concurrency and size

## Finding the culprit

## Sizing and testing
`,
  keyPoints: [
    'Repeatable streams buffer in memory, then in temp files.',
    'Sorts, groups and second reads keep the whole data.',
    'Need is about files at once x size per file.',
    'Limit files in flight with max concurrency or the listener.',
    'Find the step that holds data before buying bigger workers.',
    'Test with the largest file and peak count on the target worker.',
  ],
  solution: `
**1. Memory and temp disk.** Repeatable in memory streams use heap. Repeatable file store streams use a little heap and then temp disk. DataWeave scripts that sort, group, count or read twice keep the whole data. Batch blocks and aggregator groups in progress use heap too.

**2. Concurrency and size.** The need is roughly the number of files in flight times what each file keeps. Four 3 GB files with file store streams need about 12 GB of temp disk. Set max concurrency on the flow that the file listener starts, so the peak fits.

**3. Finding the culprit.** Look for a Logger of the payload, a second read, a sort or group, or a reader without streaming. Fix those before resizing, since a bigger heap only moves the limit.

**4. Sizing and testing.** Test the largest expected file and the peak number at once on the target worker size. Watch heap, temp disk and time. Add a margin for growth. Use non repeatable streams for flows that read once.
`,
  followUps: [
    {
      q: 'Is it fine to process month end files one at a time?',
      a: 'Often yes. Sequential processing of a few large files is slower but safe, if it meets the deadline.',
    },
    {
      q: 'Where do you see temp disk use?',
      a: 'In the worker metrics of your platform, or with a disk check in a health endpoint.',
    },
    {
      q: 'Why not move large files with a managed transfer tool instead?',
      a: 'For plain copies with no transformation, that is often the better tool. Mule is useful when content is mapped or checked.',
    },
  ],
}
