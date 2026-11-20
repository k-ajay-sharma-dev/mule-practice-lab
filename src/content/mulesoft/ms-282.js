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
      prompt: 'What does ASCII mode do during an FTP transfer?',
      options: [
        'It strips any byte above 127, so only plain ASCII characters remain',
        'It converts line endings between client and server, such as CRLF and LF',
        'It converts the character set between client and server, such as to UTF-8',
        'It sends the file as text lines, but changes no bytes in it',
      ],
      answer: 1,
      explain: 'ASCII mode, also called TYPE A, rewrites line endings. It does not change the character set or protect anything.',
    },
    {
      type: 'single',
      prompt: 'A zip file downloaded over FTP will not open. What is the likely cause?',
      options: [
        'It was sent in passive mode, which can drop bytes behind a firewall',
        'It went in ASCII mode, which changed bytes that looked like line endings',
        'It was sent in binary mode, which does not keep the zip structure',
        'The download was resumed with REST, which always breaks zip files',
      ],
      answer: 1,
      explain: 'Binary files such as zip, gzip, PGP and images must go in binary mode, TYPE I. ASCII mode corrupts them.',
    },
    {
      type: 'multi',
      prompt: 'Which files must always use binary mode?',
      options: ['A PGP encrypted file', 'A gzip file', 'An Excel file', 'A file whose size and hash must match exactly at both ends'],
      answer: [0, 1, 2, 3],
      explain: 'Binary mode copies bytes as they are. Use it for anything that is not plain text, and for any file you check by size or hash.',
    },
    {
      type: 'single',
      prompt: 'The planning platform rejects a pipe delimited file because every line ends with a stray carriage return. What is a sound fix?',
      options: [
        'Transfer in ASCII mode, so the server fixes the line endings',
        'Agree the line ending, write it in the transform, transfer in binary',
        'Trim the last character of each line in a script on the server',
        'Ask the platform to accept a trailing pipe after the last column',
      ],
      answer: 1,
      explain: 'Agree the line ending with the receiver and write it explicitly in the transform. When the transform writes the agreed line ending and the transfer copies bytes, the file looks the same on both sides.',
    },
    {
      type: 'single',
      prompt: 'In the Mule FTP connector, where is the transfer mode set?',
      options: [
        'In the DataWeave output directive, for example output text/plain',
        'On the connection, with the transfer mode setting, binary by default',
        'On each Read and Write, with ASCII as the default mode',
        'It cannot be set, because the connector always uses binary',
      ],
      answer: 1,
      explain: 'The transfer mode setting takes binary or ASCII. Check the connector documentation for your version. Most teams keep binary and control line endings in the transform.',
    },
    {
      type: 'single',
      prompt: 'Why does a byte count check fail after an ASCII mode transfer between Windows and Linux?',
      options: [
        'Because ASCII mode adds a byte order mark at the start of the file',
        'Because each CRLF becomes LF or back, a byte per line',
        'Because ASCII mode turns each tab into four spaces',
        'Because ASCII mode pads the last block of the file with zeros',
      ],
      answer: 1,
      explain: 'A file with 10,000 lines can shrink or grow by 10,000 bytes. A size or hash check then reports a mismatch.',
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
