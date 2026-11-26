export default {
  id: 'ms-282',
  category: 'mulesoft',
  title: 'ASCII or Binary Mode: Why a Planning File Arrived With Broken Line Endings',
  level: 'BEGINNER',
  tags: ['myproject', 'ftp', 'planning-platform', 'transfer-mode', 'line-endings', 'encoding'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'A Mule app on a Linux worker reads a CSV in ASCII mode from a Windows FTP server. The file is Windows-1252, with CRLF endings and accented store names. What does the app receive?',
      options: [
        'LF line endings, with the accented letters converted to UTF-8',
        'CRLF line endings, with the accented letters converted to UTF-8',
        'LF line endings, with the accented letters still in Windows-1252 bytes',
        'CRLF line endings and the same bytes, since ASCII mode only acts on uploads',
      ],
      answer: 2,
      explain: 'ASCII mode, TYPE A, converts line endings to the convention of the receiving side, so CRLF becomes LF on Linux. It does not convert the character set, so the accented letters keep their Windows-1252 bytes. Set the encoding in the reader and writer of the Mule app. ASCII mode works in both directions, on downloads as well as uploads.',
    },
    {
      type: 'single',
      prompt: 'After a change to the FTP connector config, a zip read with FTP Read and saved unchanged with File Write will not open. Its size differs from the server listing by about 300 bytes. What is the likely cause?',
      options: [
        'Passive mode was turned on, and the firewall dropped bytes on the data connection',
        'File Write used the default encoding of the worker, which re-encoded the zip bytes',
        'The partner zipped it with a newer method, which the archive tool cannot open',
        'It went in ASCII mode, which changed bytes that looked like line endings',
      ],
      answer: 3,
      explain: 'Binary files such as zip, gzip, PGP and images must go in binary mode, TYPE I. ASCII mode rewrites every byte pair that looks like a line ending, so the size changes and the zip is corrupt. A dropped data connection gives an error or a short file, not a rewritten one. File Write writes a binary stream as it is, encoding matters only for text. A newer zip method would not change the size.',
    },
    {
      type: 'multi',
      prompt: 'A team wants to set the FTP connection of a nightly job to ASCII mode. Which of the job files would be damaged or fail a check?',
      options: [
        'A PGP encrypted file',
        'A gzip file',
        'A plain CSV with LF endings, sent from a Linux worker to a Linux server, with no size or hash check',
        'An Excel .xlsx file',
        'A CSV whose SHA-256 hash the receiver checks against a control file',
        'A fixed width text file with LF endings, sent Linux to Linux, checked only by its record count',
      ],
      answer: [0, 1, 3, 4],
      explain: 'Encrypted, compressed and office files are binary, and ASCII mode corrupts them. A CSV checked by hash fails when any line ending changes. A CSV with LF endings between two Linux systems comes out the same, since LF goes over the wire as CRLF and is turned back into LF, and nobody checks its size. The fixed width file between two Linux systems also comes out the same, and a record count does not change with line endings anyway.',
    },
    {
      type: 'single',
      prompt: 'The planning platform rejects a pipe delimited file because each line ends with a stray carriage return. The same FTP connection also carries zip files. What is a sound fix?',
      options: [
        'Switch the connection to ASCII mode, so the server fixes the line endings',
        'Strip the carriage returns with a script on the server after each upload',
        'Set the DataWeave writer encoding to UTF-8, so the carriage return is dropped',
        'Agree the line ending, write it in the transform, transfer in binary',
      ],
      answer: 3,
      explain: 'Agree the line ending with the receiver and write it explicitly in the transform, then keep binary mode so the bytes are copied as they are. ASCII mode might fix the text file, but it would corrupt the zip files on the same connection. A server script treats the symptom and makes the sent file differ from the delivered one. The encoding decides how characters become bytes, not which line ending is written.',
    },
    {
      type: 'single',
      prompt: 'A Mule FTP config sets no transfer mode. A flow reads a text file from a Windows server and writes it unchanged to a Linux server. What happens to the line endings?',
      options: [
        'They become LF, because the connection defaults to ASCII mode',
        'They stay CRLF on read, but the write converts them, since Write defaults to ASCII',
        'They stay CRLF, because the connection defaults to binary mode',
        'They become LF, because the Linux server converts text files it receives',
      ],
      answer: 2,
      explain: 'The transfer mode is set on the connection and defaults to binary, so the bytes, CRLF included, are copied as they are. The mode is not set per Read or Write. A server converts line endings only in ASCII mode, never on its own in binary mode. Check the connector documentation for your version. Most teams keep binary and control line endings in the transform.',
    },
    {
      type: 'single',
      prompt: 'A Windows server lists a 10,000 line CSV at 1,250,000 bytes. After an ASCII mode download to a Linux worker, the file has 1,240,000 bytes. What explains the gap?',
      options: [
        'The data connection closed early, so the last lines were cut off',
        'The accented letters were converted, which changed their byte length',
        'Each CRLF became LF, so the file lost one byte per line',
        'The server listing shows the size on disk in blocks, not the byte count',
      ],
      answer: 2,
      explain: 'The gap of 10,000 bytes matches the 10,000 lines: each CRLF became LF. A size or hash check then reports a mismatch even though no data is lost. A cut off transfer would not match the line count so neatly, and the last lines would be missing. ASCII mode does not convert the character set. FTP listings show the byte size.',
    },
  ],
  description: `
Marrow & Pine Home sends a daily pipe delimited sales file to the planning platform. A Mule app reads the file from a store system FTP server on Windows and writes it to a Linux FTP drop. After a change to the connection, the platform rejects the file: every line ends with a stray carriage return. The same week, a zipped inventory file from the same server cannot be opened.

**Questions**
1. What is the difference between ASCII and binary mode?
2. Which files need which mode?
3. What caused the two problems?
4. How do you make the transfer safe?
`,
  answerTemplate: `## ASCII and binary

## Which mode for which file

## The cause

## A safe setup
`,
  keyPoints: [
    'ASCII mode rewrites line endings. Binary mode copies bytes as they are.',
    'Zip, gzip, PGP and Excel files need binary mode.',
    'ASCII mode changes the file size, so size and hash checks fail.',
    'Agree the line ending with the receiver and write it in the transform.',
    'Keep binary mode on the connector and control the content yourself.',
  ],
  solution: `
**1. ASCII and binary.** In ASCII mode, TYPE A, the client and server convert line endings to their own convention, such as CRLF on Windows and LF on Linux. In binary mode, TYPE I, the bytes are copied without change.

**2. Which mode for which file.** Compressed, encrypted and office files must use binary mode. Plain text can use either, but binary is safer, because the bytes and the size match at both ends.

**3. The cause.** The connection change set the mode wrong for these files. The zip was transferred in a mode that rewrote bytes that looked like line endings, so it was corrupted. The text file kept CRLF endings that the Linux side did not expect, and the platform read the carriage return as part of the last field.

**4. A safe setup.** Use binary mode on the connector. Agree the line ending, encoding and delimiter with the planning platform, and have the DataWeave transform write them explicitly. Check the size or a hash after transfer where the receiver supports it, and keep a sample file for regression tests.
`,
  followUps: [
    {
      q: 'Does ASCII mode convert the encoding, for example from Windows-1252 to UTF-8?',
      a: 'No. Treat it as a line ending conversion only. Set the encoding in the reader and writer of the Mule app.',
    },
    {
      q: 'How would you spot this in a test?',
      a: 'Compare the size and a hash of the file before and after the transfer, and open the file in a hex view to see the line endings.',
    },
    {
      q: 'Why can a file with a trailing CR still look fine in a text editor?',
      a: 'Most editors hide line endings. The receiving parser does not, and reads the CR as data in the last field.',
    },
  ],
}
