export default {
  id: 'ms-337',
  category: 'mulesoft',
  title: 'Compressed Files: Zip Bombs, Zip Slip and Streaming Compression',
  level: 'ADVANCED',
  tags: ['myproject', 'large-files', 'compression', 'zip', 'gzip', 'security'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'A partner sends a 5 MB zip that expands to 40 GB. What is this called, and what is the risk?',
      options: [
        'Normal for CSV or log data, which often packs this well',
        'A zip bomb: unpacking it can fill memory or disk and stop the worker',
        'A corrupt archive, since a real zip cannot grow that much',
        'A split archive whose other parts have not arrived yet',
      ],
      answer: 1,
      explain: 'A ratio of 8,000 to 1 is far beyond what real data packs to, so treat it as a zip bomb. It may be an attack or a mistake. Either way, the flow must protect itself. The zip format allows this growth, so the file need not be corrupt. A split archive part holds only its own share of the data.',
    },
    {
      type: 'multi',
      prompt: 'Which limits protect a flow that unpacks archives against a zip bomb?',
      options: [
        'A maximum total size after unpacking',
        'A maximum number of entries',
        'A maximum ratio of unpacked to packed size',
        'A maximum size of the zip file as received',
        'A check of the unpacked size each entry header states, before you unpack',
        'Rejecting entry names that hold ../ or an absolute path',
      ],
      answer: [0, 1, 2],
      explain: 'Limits on total unpacked size, entry count and ratio stop a bomb, as long as you count bytes while you unpack and stop when a limit is passed. A 5 MB bomb passes any limit on the received size. The sizes in the entry headers can lie, so checking them alone does not help. Rejecting ../ and absolute paths is right too, but it stops zip slip, not a zip bomb.',
    },
    {
      type: 'single',
      prompt: 'An entry in a zip is named ../../app/conf/settings.yaml. What is the danger?',
      options: [
        'None, since the path is cut down to settings.yaml when the entry is written',
        'Zip slip: the entry name escapes the target folder and can overwrite other files',
        'The entry is a symbolic link that points at the app configuration',
        'The YAML entry is loaded as app config as soon as the zip is opened',
      ],
      answer: 1,
      explain: 'Check that each resolved path stays inside the target folder before writing.',
    },
    {
      type: 'single',
      prompt: 'Why is gzip often better than zip for one large data file?',
      options: [
        'It is more secure, since a gzip file cannot hold scripts',
        'It compresses one stream, so it is written and read without an index at the end',
        'It gives a smaller file than zip, since its compression method is stronger',
        'It keeps folder paths, so the receiver can rebuild the layout',
      ],
      answer: 1,
      explain: 'A zip reader often wants the central directory, which sits at the end of the file.',
    },
    {
      type: 'single',
      prompt: 'How do you compress a large outbound file without holding it all in memory?',
      options: [
        'Read the file into a byte array and compress it in one call',
        'Pipe the stream through the compressor while the file is written',
        'Write the file first, then have a second flow read it as a string and compress it',
        'Send it as is and ask the receiver to compress it after upload',
      ],
      answer: 1,
      explain: 'For example the Compression module on a stream, or a small Java helper. Check that the compressor you use streams. Some tools build the whole output first. A byte array or a string holds the whole file in heap, even when a second flow does the work. Sending it as is moves the problem to the transfer and the receiver.',
    },
    {
      type: 'single',
      prompt: 'Where do you unpack received archives?',
      options: [
        'In the app folder, so later steps find the files by a known path',
        'In a temp folder per run with its own disk limit, removed at the end',
        'In a shared folder, so other flows can pick the files up',
        'In memory, so no unpacked file is left on disk after the run',
      ],
      answer: 1,
      explain: 'A per run folder makes cleanup and limits clear.',
    },
  ],
  description: `
Quayle Freight receives zip archives of carrier documents and sends gzip compressed CSV extracts to a partner. One night an archive expanded to tens of gigabytes and filled the disk. A security review also asked how the flow handles entry names with "..".

**Questions**
1. What is a zip bomb, and how do you guard against it?
2. What is zip slip, and how do you prevent it?
3. When would you choose gzip over zip?
4. How do you compress large files without holding them in memory?
`,
  answerTemplate: `## Zip bombs

## Zip slip

## Gzip or zip

## Streaming compression
`,
  keyPoints: [
    'A zip bomb is small packed and huge unpacked.',
    'Limit total unpacked size, entry count and ratio, counted while unpacking.',
    'Zip slip uses ".." in entry names to write outside the target folder.',
    'Resolve each path and check it stays in the target folder.',
    'Gzip suits one large stream. Zip suits many files.',
    'Compress as a stream and unpack into a per run temp folder.',
  ],
  solution: `
**1. Zip bombs.** An archive that is small but expands to a huge size. Count the bytes as you unpack and stop at a total limit. Limit the number of entries and the ratio of unpacked to packed size. Do not trust the sizes in the headers, since they can lie.

**2. Zip slip.** An entry name with \`../\` or an absolute path can escape the target folder when written under its own name. Resolve each entry path against the target folder, check it still starts with that folder, and refuse the archive if not.

**3. Gzip or zip.** Gzip compresses one stream, which fits one large CSV and can be read and written as a stream. Zip holds many files with an index at the end, which fits bundles of documents.

**4. Streaming compression.** Pipe the data through a compressor while writing, so only small buffers are in memory. Unpack received archives into a temp folder per run, with a disk limit, and remove it when the run ends.
`,
  followUps: [
    {
      q: 'What do you do with an archive that breaks a limit?',
      a: 'Stop, move it to a quarantine folder, log the reason, and alert the sender owner.',
    },
    {
      q: 'Do password protected zips make transfers secure?',
      a: 'Old zip encryption is weak. Use a secure transport and, if needed, file encryption such as PGP.',
    },
    {
      q: 'Does compression always save time?',
      a: 'It saves network time for text files, but costs CPU. Already compressed data such as images gains little.',
    },
  ],
}
