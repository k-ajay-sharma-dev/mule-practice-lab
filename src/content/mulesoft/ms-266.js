export default {
  id: 'ms-266',
  category: 'mulesoft',
  title: 'Large Files on Azure File Share: Streaming Reads, Range Requests and Mule Memory',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-file-share', 'large-files', 'streaming', 'range-requests', 'repeatable-streams'],
  estMinutes: 24,
  quiz: [
    {
      type: 'single',
      prompt: 'A flow reads a 3 GB file from the share with an HTTP GET. With the default repeatable file store stream, what happens to the bytes?',
      options: [
        'All 3 GB are buffered in heap so later steps can read them again',
        'A small buffer stays in memory and the rest spills to a temporary file',
        'The bytes pass through once and a second read of the payload fails',
        'The bytes go to off heap memory, which grows until the file is read',
      ],
      answer: 1,
      explain: 'The file store stream buffers a small amount in memory (512 KB by default) and writes the rest to disk, so later steps can read it again. The in memory repeatable stream is the one that keeps everything in heap, and a non repeatable stream is the one that can be read only once.',
    },
    {
      type: 'single',
      prompt: 'What is a GET with a Range header good for on a large file?',
      options: [
        'Reading only some bytes, to resume a failed download or read in parallel',
        'Asking the service to compress the file before it is sent',
        'Holding a read lock on that part of the file during the download',
        'Getting only the file properties, such as size, without the content',
      ],
      answer: 0,
      explain: 'Range reads return only the bytes asked for. A download that fails at 2.5 GB can continue from there, and several ranges can be read in parallel. A Range header neither compresses nor locks anything, and properties come from a HEAD request.',
    },
    {
      type: 'multi',
      prompt: 'Which steps would load a whole large file into memory and should be avoided?',
      options: [
        'A Logger that prints the payload',
        'Setting a variable to the payload converted to a String',
        'A DataWeave script that reads the records once, in order, with streaming on',
        'A DataWeave script that sorts or groups the whole file',
      ],
      answer: [0, 1, 3],
      explain: 'Logging the payload and turning it into a String both read every byte into memory. Sorting or grouping needs every record at once. A forward only script can stream.',
    },
    {
      type: 'single',
      prompt: 'How many Put Range calls at the 4 MiB maximum does a 1 GiB file need?',
      options: ['4', '64', '256', '1024'],
      answer: 2,
      explain: '1 GiB is 1024 MiB, and 1024 divided by 4 is 256.',
    },
    {
      type: 'single',
      prompt: 'An upload of 400 ranges crashes after range 250. How can a restarted flow avoid writing everything again?',
      options: [
        'It cannot, because a file with missing ranges must be created again',
        'Use a checkpoint or the List Ranges call to find the missing ranges',
        'Send the remaining ranges with x-ms-write: clear to fill the gaps',
        'Append the rest with an Append Block call from the crash point',
      ],
      answer: 1,
      explain: 'The file already has its full size. Only the missing ranges need writing, and List Ranges shows which ranges hold data. A checkpoint in Object Store is a plain record of finished ranges. x-ms-write: clear empties ranges instead of writing them, and Append Block belongs to Blob Storage, not Azure Files.',
    },
    {
      type: 'single',
      prompt: 'How do you check the uploaded file is not corrupted?',
      options: [
        'Treat a 201 status on every Put Range as proof the file is whole',
        'Send Content-MD5 per range and compare a hash or count at the end',
        'Compare the file size in a listing with the size the flow expected',
        'Read the first and last ranges back and check they look right',
      ],
      answer: 1,
      explain: 'A per range MD5 lets the service reject a range damaged in transit. A final hash or count catches a missing or repeated range. The size alone cannot catch this, because Create File sets the full size before any range is written.',
    },
  ],
  description: `
Marrow & Pine Home sends a weekly product catalog export of about 3 GB to a partner through an Azure file share. The Mule worker has 1.5 GB of heap. The first run failed with an out of memory error, and a later run left a file that the partner could not read.

**Questions**
1. How does Mule hold a large payload, and what makes it run out of memory?
2. How do you read and write a large file on the share in pieces?
3. How do you recover from a failure in the middle?
4. How do you prove the file arrived whole?
`,
  answerTemplate: `## Memory in Mule

## Reading and writing in pieces

## Recovering

## Proving the file is whole
`,
  keyPoints: [
    'Repeatable file store streams keep a small buffer in memory and spill to disk.',
    'Logging, converting to String, sorting and grouping pull everything into memory.',
    'Range GETs read part of a file. Put Range writes 4 MiB at a time.',
    'Restart from the missing ranges, using a checkpoint or the list ranges call.',
    'Use a Content-MD5 per range and a final hash or count.',
  ],
  solution: `
**1. Memory in Mule.** A stream in Mule is read lazily. The default repeatable file store stream keeps a small buffer in memory and writes the rest to a temporary file, so the flow can read it again. Memory runs out when a step needs the whole content at once: a Logger with the payload, a variable holding it as a String, or a DataWeave script that sorts, groups or looks at the whole file. Keep transforms forward only and turn on streaming where the format allows it.

**2. Reading and writing in pieces.** To read, a GET with a Range header returns a slice, which suits resuming or parallel reads. To write, Create File with the exact length, then Put Range calls of up to 4 MiB each. A 3 GB file needs over 700 calls, so keep the HTTP connection pooled and check each response.

**3. Recovering.** Since the file has its full size from the start, the flow only needs to write the ranges that are missing. Keep a checkpoint, such as the last finished range in Object Store, or ask the service which ranges hold data. Write under a temporary name so the partner never reads a half written file, and rename when done.

**4. Proving the file is whole.** Send a Content-MD5 with each range, so the service rejects a damaged slice. At the end, compare the size and a hash or record count with what the source produced, and put them in a control file the partner can check too.
`,
  followUps: [
    {
      q: 'Would you raise the worker size instead?',
      a: 'Only as a stopgap. A file twice as big next year breaks it again. Streaming keeps memory flat whatever the size.',
    },
    {
      q: 'Can you write ranges in parallel?',
      a: 'Yes, ranges do not overlap, so a parallel for each with a small limit can speed it up. Keep the limit low to avoid throttling.',
    },
    {
      q: 'Why does the temporary disk space on the worker matter?',
      a: 'The file store stream spills to local disk. A 3 GB payload needs that much free disk, and two runs at once need double.',
    },
  ],
}
