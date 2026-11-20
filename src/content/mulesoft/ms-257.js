export default {
  id: 'ms-257',
  category: 'mulesoft',
  title: 'Uploading Large Files as Block Blobs: Staged Blocks, the Block List, Streaming and Half Finished Uploads',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-blob', 'block-blobs', 'large-files', 'streaming', 'retry', 'memory', 'media'],
  estMinutes: 22,
  quiz: [
    {
      type: 'order',
      prompt: 'Order the steps of a block upload for a large file.',
      items: [
        'Split the file into blocks and give each block an id',
        'Upload each block with Put Block',
        'Commit the blocks in order with Put Block List',
        'The blob becomes readable with its new content',
      ],
      explain: 'Blocks are staged first and do not change the blob. Only the block list commit makes the new content visible.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about block ids are true?',
      options: [
        'They are Base64 encoded strings',
        'All block ids in one blob must have the same length before encoding',
        'They must be numbers in order',
        'The block list decides the order of the blocks in the blob',
      ],
      answer: [0, 1, 3],
      explain: 'Ids only need to be unique and of equal length. Their order in the committed list sets the order in the blob.',
    },
    {
      type: 'single',
      prompt: 'An upload of 800 blocks fails at block 612. The blob already existed with old content. What do readers see?',
      options: [
        'A half written file, up to block 611',
        'The old content, as nothing is committed yet',
        'An empty blob until the upload resumes',
        'An error on every read until it ends',
      ],
      answer: 1,
      explain: 'Nothing is committed until Put Block List. Staged blocks are invisible until committed. Readers keep seeing the last committed version.',
    },
    {
      type: 'single',
      prompt: 'How can the upload continue after that failure without sending all 800 blocks again?',
      options: [
        'It cannot, staged blocks are dropped on failure',
        'Upload only the missing blocks, then commit',
        'Delete the blob and start again',
        'Append the rest with an append blob',
      ],
      answer: 1,
      explain: 'Get the list of uncommitted blocks, upload only the missing ones, then commit the full list. Uncommitted blocks are kept for a while. A resume uploads what is missing and commits once.',
    },
    {
      type: 'single',
      prompt: 'A Mule flow reads a 6 GB video from SFTP and uploads it. The app runs out of memory. What is the likely cause?',
      options: [
        'The block size is set too small',
        'The whole payload was loaded into memory',
        'Azure rejects files over 5 GB',
        'The SAS expired during the upload',
      ],
      answer: 1,
      explain: 'A transform or a Logger that reads the content loads it fully, instead of streaming it to the upload. Pass the stream from the read to the upload without touching the content. Any step that reads the whole payload pulls it into memory or into the stream buffer.',
    },
    {
      type: 'single',
      prompt: 'Is there a limit on the number of blocks in one block blob?',
      options: ['No, the number of blocks is unlimited', 'Yes, 50,000 committed blocks per blob', 'Yes, 100 blocks per blob', 'Only for blobs in the Archive tier'],
      answer: 1,
      explain: 'Very large files need large enough blocks. The block count limit and the block size together set the largest file. Pick a block size that fits the largest file you expect.',
    },
  ],
  description: `
Corvid Studios uploads finished video files from an SFTP drop to Azure Blob Storage with a Mule app. Files range from 2 GB to 40 GB. Uploads sometimes fail near the end and start again from zero, and last week the app ran out of memory on a 6 GB file.

**Questions**
1. How does a block upload work?
2. What happens to readers and to staged data when an upload fails?
3. How do you resume instead of starting again?
4. How do you keep the Mule app's memory under control?
`,
  answerTemplate: `## Block uploads

## Failures

## Resuming

## Memory
`,
  keyPoints: [
    'Large files go up as staged blocks, committed with Put Block List.',
    'Block ids are Base64 strings of equal length. The list sets the order.',
    'Nothing is visible to readers until the commit.',
    'A resume uploads only missing blocks, then commits once.',
    'The block count limit means block size must fit the largest file.',
    'Stream the file from source to upload, and never log or transform the content.',
  ],
  solution: `
**1. Block uploads.** A large file is cut into blocks. Each block goes up with Put Block and a block id, a Base64 string, with all ids in one blob the same length. When every block is staged, Put Block List commits them in the listed order and the blob takes the new content. Blocks can go up in parallel, which speeds up big files. A blob can have at most 50,000 committed blocks, so the block size must be large enough for the largest file.

**2. Failures.** Staged blocks do not change the blob. Readers keep seeing the old content, or nothing for a new blob, until the commit. Uncommitted blocks are kept for a limited time and then cleaned up if no commit arrives.

**3. Resuming.** Use block ids that can be worked out again, for example from the block number padded to a fixed width. After a failure, read the uncommitted block list, upload only the missing blocks, then commit. Many SDKs and connectors do this inside their upload operation, so check whether yours exposes block control or retries on its own.

**4. Memory.** Let the SFTP read stream go straight into the upload. Avoid a Transform Message, a Logger with \`#[payload]\`, or anything else that reads the content on the way. With a repeatable stream, large content spills to disk beyond the buffer size, so watch disk space. A non repeatable stream uses less, but can be read only once.
`,
  followUps: [
    {
      q: 'How do you check the uploaded file matches the source?',
      a: 'Compute a checksum while streaming, such as MD5 or SHA-256, and store it as metadata. Compare it with the checksum the source provides, or send per block MD5 values so Azure checks each block.',
    },
    {
      q: 'Two uploads of the same file run at once. What can happen?',
      a: 'Both stage blocks, and the last commit wins. Use a lease or a conditional commit on the ETag so only one writer can finish.',
    },
    {
      q: 'Why does a bigger block size not always help?',
      a: 'A failed big block costs more to resend and uses more memory per parallel upload. Balance it against the block count limit and the network.',
    },
  ],
}
