export default {
  id: 'ms-265',
  category: 'mulesoft',
  title: 'Writing a File to Azure File Share Over REST: Create File, Put Range and the Declared Length',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-file-share', 'rest-api', 'put-range', 'create-file', 'http-requester'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'What does the Create File call do?',
      options: [
        'Uploads the whole file in one request',
        'Creates the file with a fixed size given in x-ms-content-length, with no content yet',
        'Creates an empty file that grows as you append',
        'Creates a directory',
      ],
      answer: 1,
      explain: 'The file starts with its full declared size. The content is written afterwards with Put Range calls.',
    },
    {
      type: 'single',
      prompt: 'How many bytes can one Put Range call write?',
      options: ['64 KB', 'Up to 4 MiB', '100 MiB', 'No limit'],
      answer: 1,
      explain: 'Larger files are written in several ranges of at most 4 MiB each.',
    },
    {
      type: 'single',
      prompt: 'Which headers tell Put Range to write data to bytes 0 to 1023?',
      options: [
        'x-ms-range: bytes=0-1023 and x-ms-write: update',
        'Range: 0-1024 and x-ms-write: append',
        'x-ms-offset: 0 and x-ms-length: 1024',
        'Content-Range: 1024 and x-ms-type: file',
      ],
      answer: 0,
      explain: 'The range end is inclusive. x-ms-write: clear would zero the range instead of writing data.',
    },
    {
      type: 'multi',
      prompt: 'The flow creates a file with a length of 10,000 bytes but writes only 9,800. What follows?',
      options: [
        'The file keeps the declared size, so its last 200 bytes are zeros',
        'A reader may parse the zeros as a broken last record',
        'Azure trims the file to the written data',
        'The fix is to create the file with the exact length, or to resize it before readers see it',
      ],
      answer: [0, 1, 3],
      explain: 'The declared length wins. Work out the size from the bytes you will write, not from a record count guess.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to write an export file safely for readers that poll the share.',
      items: [
        'Make sure the target directory exists',
        'Create the file under a temporary name with the exact length',
        'Write the content with one or more Put Range calls',
        'Rename it to the final name, or write a control file next to it',
      ],
      explain: 'Readers only match the final name or wait for the control file, so they never see a file that is still being written.',
    },
    {
      type: 'single',
      prompt: 'Why is a payload in a Mule flow often read twice when writing to the share?',
      options: [
        'Azure asks for the content twice',
        'The flow needs the byte length for Create File and then the content for Put Range, so the stream must be repeatable or the content held once',
        'DataWeave always reads streams twice',
        'It is not read twice',
      ],
      answer: 1,
      explain: 'A non repeatable stream can be consumed once. Measure the size from a repeatable stream, or write the transform output to a known length first.',
    },
  ],
  description: `
Quayle Freight exports daily delivery files from Mule to an Azure file share that a customer's old system reads over SMB. The Mule app runs on CloudHub, so it writes with the REST API. Some files arrive at the customer with strange zero bytes at the end, and once the customer read a file that was only half there.

**Questions**
1. Which REST calls write a file, and in what order?
2. What does the declared length do, and how does it explain the zero bytes?
3. How do large files change the calls?
4. How do you stop readers from seeing half written files?
`,
  answerTemplate: `## The calls

## The declared length

## Large files

## Readers and half written files
`,
  keyPoints: [
    'Create File reserves the full size. Put Range writes the content.',
    'Each Put Range writes at most 4 MiB, with an inclusive byte range.',
    'A declared length larger than the data leaves zeros at the end.',
    'Write under a temporary name, then rename, or add a control file.',
    'The flow needs the size before the content, so plan for a repeatable stream.',
  ],
  solution: `
**1. The calls.** Create the directory if needed. Create File with x-ms-type set to file and x-ms-content-length set to the byte size. Then Put Range calls with x-ms-range set to bytes=start-end and x-ms-write set to update. Each call sends that slice of the content in the body.

**2. The declared length.** The file has the declared size from the start, and any range never written reads as zeros. If the flow guesses the size, for example from a record count, or counts characters instead of bytes in UTF-8, the end of the file holds zeros. Work out the byte length of the final content, or resize the file with Set File Properties before readers see it.

**3. Large files.** One Put Range writes at most 4 MiB, so a 1 GiB file needs 256 calls. Keep each range on a boundary, check each response, and retry a failed range on its own. The flow should stream the content and not hold the whole file in memory.

**4. Readers and half written files.** A file appears in listings as soon as Create File succeeds. Write under a temporary name and rename it when complete, if your API version supports rename, or write a small control file after the data file. The reader agreement says to ignore temporary names and to wait for the control file.
`,
  followUps: [
    {
      q: 'Why can counting characters give the wrong length?',
      a: 'In UTF-8 an accented letter takes two or more bytes. The declared length must be the number of bytes, not characters.',
    },
    {
      q: 'One Put Range in the middle fails. Do you start again?',
      a: 'No. Retry only that range with the same offsets. Writing the same bytes to the same range again is safe.',
    },
    {
      q: 'What if the API version you use has no rename?',
      a: 'Use a control file, or write to a staging directory and copy to the final directory. The reader must only look at the final place.',
    },
  ],
}
