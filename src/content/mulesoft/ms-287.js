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
      prompt: 'One client reads file times from two partner servers. On server A the times are right. On server B, which also answers LIST, every entry comes back with an empty modify time. What is the likely cause?',
      options: [
        'Server B is in another time zone, so its times cannot be converted to UTC',
        'Server B needs MDTM turned on before its LIST output includes times',
        'Server B hides the time of files changed in the last day, to save space',
        'LIST has no standard format, and server B uses a layout the parser does not know',
      ],
      answer: 3,
      explain: 'LIST was meant for people to read, so its format differs between servers, such as Unix and Windows styles. Clients use parsers for common formats and can fail on unusual ones, leaving fields empty. A different time zone gives wrong times, not missing ones. MDTM is a separate command and does not change LIST output.',
    },
    {
      type: 'single',
      prompt: 'A server runs on US Eastern time, in November. LIST shows a file at Nov 17 23:40. MLSD shows modify=20261118044000 for the same file. When did the file really change, in UTC?',
      options: [
        'At 23:40 UTC on 17 November, since LIST gives UTC and MLSD gives local time',
        'Unknown, since the two listings disagree by five hours, so one of them is wrong',
        'At 04:40 UTC on 18 November, since MLSD gives UTC and LIST gives local time',
        'At 04:40 Eastern time on 18 November, since MLSD gives the server local time',
      ],
      answer: 2,
      explain: 'MLSD uses a defined, machine readable format, and its modify time is in UTC. LIST times are usually in the server local zone. In November Eastern time is UTC minus five hours, so 23:40 local is 04:40 UTC the next day, and the two listings agree. Older servers may not support MLSD.',
    },
    {
      type: 'single',
      prompt: 'On 2 January 2027 a Unix style LIST line shows "Dec 31 23:40" with no year. How should the client read the date?',
      options: [
        '31 December 2026, the year that keeps a recent file in the past',
        '31 December 2027, since a missing year always means the current year',
        'More than a year old, since only old files are listed without a year',
        'Unknown, since servers hide the year until a file is fully written',
      ],
      answer: 0,
      explain: 'Unix style listings show the time for recent files and the year for older ones. The usual guess is the current year, unless that puts the date in the future, as 31 December 2027 would. So the file is from 31 December 2026. Around New Year a client that always takes the current year gets it wrong.',
    },
    {
      type: 'single',
      prompt: 'A LIST time shows 23:40 and the server runs on US Eastern time. What is the risk for a watermark that compares times in UTC?',
      options: [
        'The watermark is safe, because servers give LIST times in UTC',
        'Times are in the server zone, so the watermark can skip or repeat files',
        'The connector converts LIST times to UTC first, so only the seconds are lost',
        'The listing fails to parse when the zone is not UTC',
      ],
      answer: 1,
      explain: 'A file can look hours older or newer than it is. LIST times are usually in the server local zone, with only minute precision. A watermark needs times in one known zone.',
    },
    {
      type: 'multi',
      prompt: 'An FTP server has an unknown time zone and a clock that drifts, and LIST shows no year for older files. Which three choices make file selection reliable?',
      options: [
        'Select by file name with a date and sequence, not by modify time',
        'Move or delete each file after processing, so the folder holds only new files',
        'Record processed names and hashes and skip repeats',
        'Select files whose LIST modify time is after the last run',
        'Ask MDTM for each file and compare its time, since MDTM is always in UTC',
        'Convert the LIST times from the server zone to UTC before comparing them',
      ],
      answer: [0, 1, 2],
      explain: 'File names, folder state and a record of processed hashes are under your control, so they do not depend on the server clock. A LIST time after the last run fails when the clock drifts or the year is missing. MDTM should be UTC by its standard, but many servers return local time, and a drifting clock is wrong in any zone. Converting to UTC needs the server zone, which is unknown here.',
    },
    {
      type: 'single',
      prompt: 'A folder holds 20,000 files. A client needs exact UTC change times for the five files whose names match today\'s date. How does it get them?',
      options: [
        'Send MDTM on the folder, which returns UTC times for all its files in one reply',
        'Take the LIST times of the five files, which are in UTC to the second',
        'Send MDTM for each of the five, then convert the server local time it returns',
        'Filter the listing by name, then send MDTM for each of the five files',
      ],
      answer: 3,
      explain: 'MDTM is a per file command that returns the modify time in UTC as YYYYMMDDHHMMSS. Filtering by name first keeps the calls to five, since calling MDTM for every file in a large folder is slow. LIST times are in the server local zone, often to the minute only. MDTM does not work on a folder, and it needs no time zone conversion.',
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
