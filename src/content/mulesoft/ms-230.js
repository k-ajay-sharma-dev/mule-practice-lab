export default {
  id: 'ms-230',
  category: 'mulesoft',
  title: 'Compression Module: Gzip a Large Export, Zip Several Files and Extract Partner Archives Safely',
  level: 'ADVANCED',
  tags: ['myproject', 'compression', 'gzip', 'zip', 'file', 'sftp', 'security', 'streaming', 'manufacturing'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'A nightly export is one large CSV file. The partner wants it smaller and does not need several files in one. Which format fits?',
      options: ['Gzip', 'Base64 encoding', 'PGP encryption', 'A zip split into 10 MB parts'],
      answer: 0,
      explain: 'Gzip compresses a single stream of data. Zip is an archive format that can hold many named files. Base64 makes data larger, and PGP is for secrecy, not size.',
    },
    {
      type: 'single',
      prompt: 'Mule must send three CSV files to a supplier as one file. Which operation of the Compression module fits?',
      options: [
        'Compress, with the gzip strategy',
        'Archive, with the zip strategy',
        'Decompress, with the zip strategy',
        'Extract, with the zip strategy',
      ],
      answer: 1,
      explain: 'Archive takes several entries, each with a name and content, and writes one zip. Compress works on one piece of content. Decompress and Extract go the other way.',
    },
    {
      type: 'single',
      prompt: 'A partner sends a 2 MB zip that expands to 40 GB. What is this, and what stops it?',
      options: [
        'A normal archive of highly compressed text',
        'A zip bomb, stopped by limits on size and entries',
        'A corrupt file that Mule repairs during extract',
        'A PGP file sent with the wrong extension',
      ],
      answer: 1,
      explain: 'A small archive can expand to fill memory or disk. Check the entry count and the expanded size before or while extracting, and reject archives that go over your limits.',
    },
    {
      type: 'single',
      prompt: 'An entry inside a partner zip is named `../../config/app.yaml`. The flow writes each entry to disk under its own name. What is the risk?',
      options: [
        'None, Extract strips path parts from names',
        'The entry may be written outside the target folder',
        'Mule skips entries whose names have slashes',
        'The whole archive fails to extract',
      ],
      answer: 1,
      explain: 'Entry names come from the sender. A name with `../` can land outside the target folder and overwrite other files. Check the names, or build the stored names yourself, before writing anything.',
    },
    {
      type: 'multi',
      prompt: 'A nightly flow compresses CSV reports, JSON dumps and a folder of JPEG photos before upload, and a later step must read the CSV. Which statements are true?',
      options: [
        'Compressed CSV or JSON is often much smaller than the original',
        'Compressing a JPEG or an already zipped file gains little',
        'Compression costs CPU time, so test it with real file sizes',
        'Compressed data can be read by DataWeave as CSV without decompressing it',
        'Gzip can bundle the photo folder into one archive with an entry per file',
        'The highest compression level costs the same CPU as the lowest, so always use it',
      ],
      answer: [0, 1, 2],
      explain: 'Text compresses well and already compressed data does not. Compression costs CPU, and higher levels cost more for a small extra gain, so test with real file sizes. Gzip compresses one stream, so several files need Zip to keep an entry per file. DataWeave needs the decompressed content to read CSV.',
    },
    {
      type: 'order',
      prompt: 'Order the steps for an inbound partner zip of order files.',
      items: [
        'Pick up the zip from SFTP once the upload is complete',
        'Check the archive against size and entry limits',
        'Extract the entries',
        'Check each entry name and type, and skip what is not expected',
        'Parse each order file with DataWeave and process it',
      ],
      explain: 'Limits and name checks come before any content is trusted or written. Parsing is the last step.',
    },
  ],
  description: `
Holloway Precision Parts exchanges files with suppliers over SFTP. Two new needs came up in one sprint:

- The nightly stock export is a 900 MB CSV file. The supplier asks for it gzipped.
- A new supplier sends its order files as one zip per day, with up to 50 CSV files inside. The architect has asked for a design that is safe against bad archives.

The team has the Mule Compression module but has not used it before.

**Questions**
1. When do you use gzip, and when do you use zip?
2. Which Compression module operations fit the export and the inbound zip?
3. What can go wrong with an archive from outside, and how do you guard against it?
4. What do you watch for with large files, memory and CPU?
`,
  answerTemplate: `## Gzip or zip

## Operations for each job

## Untrusted archives

## Large files
`,
  keyPoints: [
    'Gzip compresses one stream of data. Zip is an archive of named entries.',
    'Compress and Decompress work on one piece of content. Archive and Extract work with several named entries.',
    'A zip bomb is a small archive that expands to a huge size, so set limits on entries and expanded size.',
    'Entry names come from the sender. Never write them as paths without checking.',
    'Text compresses well. Images and already compressed files gain little.',
    'Test with real file sizes and watch memory, disk and CPU.',
  ],
  solution: `
**1. Gzip or zip.** Gzip shrinks one stream, which fits the single export file. The result is often named with \`.gz\` at the end. Zip holds several named files in one archive, which fits the supplier's 50 order files.

**2. Operations.** For the export, build the CSV in DataWeave, compress it with the gzip strategy, and write it over SFTP with a temporary name before renaming it. For the inbound file, extract the zip with the zip strategy and go through its entries one by one. If Holloway ever needs to send several files in one zip, the archive operation builds it from a set of named entries.

**3. Untrusted archives.** Two attacks matter. A **zip bomb** is a small file that expands to gigabytes and fills memory or disk. Check the archive size before you extract, count the entries and their sizes as you read them, and reject the archive when it goes over your limits. Test how your module version behaves with a very large archive before you trust it with partner files. A **path in an entry name**, such as \`../../config/app.yaml\`, can write outside the target folder. Check each name against the pattern you expect, such as \`ORD-\` and digits with \`.csv\`, and skip or reject anything else. Move rejected archives to a quarantine folder and alert someone.

**4. Large files.** Keep the export as a stream from the source to SFTP and avoid steps that load it all, such as logging the payload. Compression uses CPU, so measure the time with a real 900 MB file before go-live and check that it fits the window. For inbound zips, process one entry at a time instead of holding every file in memory at once.
`,
  followUps: [
    {
      q: 'Does gzip protect the export from being read?',
      a: 'No. Anyone can decompress it. If the content must stay secret, encrypt it, for example with PGP, after compressing. Compressing first works better, because encrypted data does not compress.',
    },
    {
      q: 'The supplier sends a zip that is half uploaded when the flow picks it up. What happens?',
      a: 'The extract fails because the archive is incomplete, or worse, a partial file is read. Agree a temporary name or a done file with the supplier, and only pick up files that are complete.',
    },
    {
      q: 'An HTTP API returns gzip compressed responses. Do you need the Compression module?',
      a: 'Check first what the HTTP connector already handles for that response in your version. If the body still arrives compressed, decompress it with the gzip strategy before DataWeave reads it.',
    },
  ],
}
