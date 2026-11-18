export default {
  id: 'ms-287',
  category: 'mulesoft',
  title: 'FTP Listings and File Times: LIST, MLSD, MDTM, Missing Years and Time Zones',
  level: 'ADVANCED',
  tags: ['myproject', 'ftp', 'planning-platform', 'mlsd', 'time-zones', 'watermark', 'listing'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'What is the main problem with the LIST command for automation?',
      options: [
        'It is encrypted',
        'Its output format is not standard, it differs between Unix and Windows servers, and clients have to guess how to parse it',
        'It lists only one file',
        'It needs active mode',
      ],
      answer: 1,
      explain: 'LIST was meant for people to read. Clients use parsers for common formats and can fail on unusual ones.',
    },
    {
      type: 'single',
      prompt: 'What does MLSD give that LIST does not?',
      options: [
        'Faster transfers',
        'A machine readable listing with facts such as type, size and modify time in UTC',
        'Encryption',
        'File content',
      ],
      answer: 1,
      explain: 'MLSD uses a defined format, and its modify time is in UTC. Older servers may not support it.',
    },
    {
      type: 'single',
      prompt: 'A Unix style LIST line shows "Nov 17 23:40" with no year. What does that mean?',
      options: [
        'The file is from 1970',
        'The file is recent, and the client must guess the year, usually the current one unless that puts the date in the future',
        'The server has no clock',
        'The file is a directory',
      ],
      answer: 1,
      explain: 'Unix style listings show the time for recent files and the year for older ones. Around New Year the guess can go wrong.',
    },
    {
      type: 'single',
      prompt: 'A LIST time shows 23:40 and the server runs on US Eastern time. What is the risk for a watermark that compares times in UTC?',
      options: [
        'None',
        'The time is in the server zone, so a file can look hours older or newer than it is, and the watermark can skip or repeat files',
        'The file is corrupted',
        'The listing fails',
      ],
      answer: 1,
      explain: 'LIST times are usually in the server local zone, with only minute precision. A watermark needs times in one known zone.',
    },
    {
      type: 'multi',
      prompt: 'Which choices make file selection reliable on an FTP server with unclear times?',
      options: [
        'Select by file name with a date and sequence, not by modify time',
        'Move or delete each file after processing, so the folder holds only new files',
        'Record processed names and hashes and skip repeats',
        'Trust the modify time to the second',
      ],
      answer: [0, 1, 2],
      explain: 'Names and folder state are under your control. File times depend on the server and the listing format.',
    },
    {
      type: 'single',
      prompt: 'What does MDTM return?',
      options: [
        'The file size',
        'The modify time of one file, in UTC as YYYYMMDDHHMMSS',
        'The owner',
        'The checksum',
      ],
      answer: 1,
      explain: 'MDTM is a per file command. It is more precise than LIST, but calling it for every file in a large folder is slow.',
    },
  ],
  description: `
Brindle Outdoor reads daily replenishment plans from the planning platform's FTP server, which runs on US Eastern time. The Mule listener uses the watermark. After the change to winter time, two files were skipped. In early January, a December file was read as if it were from next December.

**Questions**
1. How do LIST and MLSD listings differ?
2. Why do LIST times cause trouble?
3. What went wrong at the time change and at New Year?
4. How would you select files reliably?
`,
  answerTemplate: `## LIST and MLSD

## Trouble with LIST times

## Time change and New Year

## Reliable selection
`,
  keyPoints: [
    'LIST output is free form and differs by server.',
    'MLSD is machine readable with UTC times.',
    'Unix LIST shows no year for recent files, so the client guesses.',
    'LIST times are in the server zone, at minute precision.',
    'Select by file name and folder state, not by modify time.',
    'Keep a record of processed files to skip repeats.',
  ],
  solution: `
**1. LIST and MLSD.** LIST returns text meant for people, in a Unix or Windows style, with no standard. MLSD returns one line per file with named facts such as type, size and modify, and the modify time is in UTC. Clients prefer MLSD when the server supports it.

**2. Trouble with LIST times.** The times are usually in the server zone and show only minutes. Recent files have no year. A watermark that stores the newest time it saw then compares values that may be in a different zone or rounded.

**3. Time change and New Year.** When the clocks went back, files written in the repeated hour had times that looked older than the stored watermark, so they were skipped. In January, a listing line for December with no year was guessed as the current year, a date in the future, and the parser handled it wrong.

**4. Reliable selection.** Match files by name, which carries the plan date and a sequence. Move each processed file to an archive folder so the inbound folder only holds new work. Record name and hash in an audit table and skip repeats. Use the watermark only when the server gives MLSD times you trust, and test across a time change.
`,
  followUps: [
    {
      q: 'How can you tell if a server supports MLSD?',
      a: 'Send FEAT after login. The reply lists extensions such as MLST, MDTM, SIZE and REST STREAM.',
    },
    {
      q: 'Why can a file time be older than the time you received it?',
      a: 'Some senders keep the original modify time when they upload. The time tells you when the content changed, not when it arrived.',
    },
    {
      q: 'What would you log when a file is skipped?',
      a: 'The name, the listed time, the watermark value and the reason, so the next skipped file can be explained.',
    },
  ],
}
