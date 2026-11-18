export default {
  id: 'ms-339',
  category: 'mulesoft',
  title: 'Chunked and Ranged Transfers for Very Large Files',
  level: 'EXPERT',
  tags: ['myproject', 'large-files', 'http', 'range-requests', 'chunked', 'azure-blob'],
  estMinutes: 28,
  quiz: [
    {
      type: 'single',
      prompt: 'What does HTTP chunked transfer encoding solve?',
      options: [
        'It compresses the body',
        'It lets a sender stream a body without knowing its total length up front',
        'It resumes broken downloads',
        'It encrypts the data',
      ],
      answer: 1,
      explain: 'It is about streaming, not about resuming. A broken chunked transfer starts again.',
    },
    {
      type: 'single',
      prompt: 'What does a Range request header such as bytes=1048576-2097151 ask for?',
      options: [
        'The first 1 MB',
        'Only that byte range of the file, with both ends included',
        'A file of that size',
        'A compressed copy',
      ],
      answer: 1,
      explain: 'The server answers 206 Partial Content with a Content-Range header if it supports ranges.',
    },
    {
      type: 'single',
      prompt: 'A download resumes after a break. How do you make sure the file did not change in between?',
      options: [
        'Hope',
        'Send the ETag or last modified value from the first response in an If-Range header, and check the final checksum',
        'Download twice and compare',
        'Use a smaller range',
      ],
      answer: 1,
      explain: 'If the file changed, the server sends the whole new file instead of the range.',
    },
    {
      type: 'multi',
      prompt: 'How does a large upload to blob storage often work?',
      options: [
        'Upload the file in blocks, each with its own ID',
        'Retry only the blocks that failed',
        'Commit the block list at the end to make the file visible',
        'Send the whole file in one request no matter its size',
      ],
      answer: [0, 1, 2],
      explain: 'Azure Blob calls this staging blocks and committing a block list. Other stores have similar multipart uploads.',
    },
    {
      type: 'single',
      prompt: 'Several ranges are downloaded in parallel. What must the flow keep track of?',
      options: [
        'Nothing',
        'Which ranges are complete and safely stored, so a restart requests only what is missing',
        'Only the last range',
        'The order of thread IDs',
      ],
      answer: 1,
      explain: 'Store the state in a persistent object store or table keyed by the file and its ETag.',
    },
    {
      type: 'single',
      prompt: 'The server returns 200 with the full body instead of 206 for a range request. What does it mean?',
      options: [
        'The range was empty',
        'The server ignored the range, or the file changed. Treat it as a fresh full download',
        'The download is complete',
        'The server failed',
      ],
      answer: 1,
      explain: 'Writing the full body at a range offset would corrupt the file.',
    },
  ],
  description: `
Quayle Freight downloads nightly archive files of 20 to 40 GB from a partner over HTTPS and uploads them to blob storage. Network breaks near the end of a download mean starting over, and the upload sometimes times out. The team wants transfers that resume.

**Questions**
1. What is the difference between chunked transfer encoding and range requests?
2. How do you resume a download safely?
3. How do you upload a very large file to blob storage?
4. What state do you keep, and where?
`,
  answerTemplate: `## Chunked or ranged

## Resuming a download

## Large uploads

## State
`,
  keyPoints: [
    'Chunked encoding streams a body of unknown length.',
    'Range requests fetch parts of a file and allow resume.',
    'Use If-Range with the ETag so a changed file is not mixed.',
    'Expect 206. A 200 means start over.',
    'Upload in blocks and commit the block list at the end.',
    'Keep range or block state in a persistent store and verify the checksum.',
  ],
  solution: `
**1. Chunked or ranged.** Chunked transfer encoding lets a sender stream a body when the length is not known. It does not help with resume. Range requests ask for a byte range of a file, so a client can fetch parts and resume after a break.

**2. Resuming a download.** Get the size and ETag first. Fetch ranges of a set size, in parallel if the server allows it, and write each at its offset in a temp file. Send If-Range with the ETag. Expect 206 Partial Content. A 200 means the range was ignored or the file changed, so start a fresh download. At the end, check the size and the checksum the partner published.

**3. Large uploads.** Upload the file in blocks, each with an ID, and retry only failed blocks. Commit the block list at the end so the blob appears whole. Stream each block from the temp file, so memory stays small.

**4. State.** Keep the completed ranges and block IDs in a persistent object store or table, keyed by the file name and ETag. A restart reads it and continues. Clear it when the file is verified and committed.
`,
  followUps: [
    {
      q: 'How do you pick the range size?',
      a: 'Big enough to keep request overhead low, small enough that a retry is cheap. Tens of MB is a common start.',
    },
    {
      q: 'What if the partner server does not support ranges?',
      a: 'Ask for split files, or a transfer tool that resumes. Otherwise accept full retries and schedule them early.',
    },
    {
      q: 'Why write to a temp file and not straight to the final path?',
      a: 'Readers must never see a half file. Move it into place only after the checksum matches.',
    },
  ],
}
