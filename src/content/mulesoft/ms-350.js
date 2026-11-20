export default {
  id: 'ms-350',
  category: 'mulesoft',
  title: 'Broken Accents and a Strange First Column on an FTP Feed: Character Sets and the Byte Order Mark',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'ftp', 'encoding', 'csv', 'planning-platform', 'troubleshooting'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'Store names like "Crème" arrive as "CrÃ¨me" after the flow reads a file from FTP. What does that pattern usually mean?',
      options: [
        'Windows-1252 bytes were read as UTF-8 by the CSV reader',
        'UTF-8 bytes were read as a one byte set such as Windows-1252',
        'ASCII mode on the FTP transfer changed the accented bytes',
        'The file was saved as UTF-16 and read as UTF-8',
      ],
      answer: 1,
      explain: 'Each accented letter is two bytes in UTF-8. Read as a one byte set such as ISO-8859-1 or Windows-1252, it shows as two odd characters. The reverse mix up gives a replacement character instead.',
    },
    {
      type: 'single',
      prompt: 'The opposite happens: "Crème" shows as "Cr?me" or "Cr�me". What is likely?',
      options: [
        'The file is in Windows-1252, and the flow reads it as UTF-8',
        'The file is in UTF-8, and the flow reads it as Windows-1252',
        'Binary mode on the FTP transfer dropped the high bytes',
        'The file starts with a byte order mark the reader did not expect',
      ],
      answer: 0,
      explain: 'The single byte for è is not valid UTF-8 on its own, so it becomes a replacement character.',
    },
    {
      type: 'single',
      prompt: 'Where do you set the character set when reading a CSV in Mule?',
      options: [
        'In the FTP connection config, which converts the bytes on transfer',
        'In the MIME type or encoding setting of the read operation',
        'Nowhere, since the CSV reader detects the encoding from the bytes',
        'In the output directive of the DataWeave script that maps the rows',
      ],
      answer: 1,
      explain: 'For example application/csv; charset=windows-1252 on the read. Without it, the default encoding of the runtime is used, which differs between machines. The output directive sets the encoding of what you write, not what you read.',
    },
    {
      type: 'single',
      prompt: 'After a sender upgrade, the mapping of item_id, the first column, returns null in every row, though the header looks right in a text editor. Why?',
      options: [
        'The sender now quotes the header names, so they no longer match',
        'The file now starts with a byte order mark glued to the first name',
        'The sender now ends lines with CRLF, so the header has a trailing CR',
        'The sender added a new column at the end of each row',
      ],
      answer: 1,
      explain: 'Some tools add a BOM when saving UTF-8. The DataWeave CSV reader drops it only when it decodes the bytes as UTF-8 itself. Decoded with a one byte set, or turned into text before the CSV read, the BOM stays glued to the first name.',
    },
    {
      type: 'multi',
      prompt: 'Which fixes are reasonable for the BOM?',
      options: [
        'Agree with the sender to write UTF-8 without a BOM',
        'Strip a leading BOM before the CSV reader, or map the first column by position',
        'Copy the hidden BOM character into the column name in each mapping',
        'Read the file as Windows-1252 so the BOM bytes are dropped',
      ],
      answer: [0, 1],
      explain: 'Fix it at the source if you can, and guard against it in the reader too. Putting the BOM into mappings breaks again when the sender drops it. Read as Windows-1252, the BOM turns into three odd characters and every accent breaks.',
    },
    {
      type: 'single',
      prompt: 'Which transfer mode keeps the bytes of a UTF-8 CSV unchanged on FTP?',
      options: ['ASCII mode', 'Binary mode', 'Either, they are the same', 'Passive mode'],
      answer: 1,
      explain: 'ASCII mode can change line endings. Encoding is then handled by the reader, not by FTP.',
    },
  ],
  description: `
Brindle Outdoor sends store master data to the planning platform. One feed comes from a legacy system over FTP. After a change on the legacy side, store names with accents looked wrong on the planning screens, and the next day the item feed failed because \`item_id\` was null in every row.

**Questions**
1. How do you tell which encoding mix up happened from what you see?
2. Where do you set the encoding in Mule, and why not rely on the default?
3. Why did \`item_id\` become null?
4. What do you agree with the sender, and what do you guard in the flow?
`,
  answerTemplate: `## Reading the symptoms

## Setting the encoding

## The null item_id

## Agreement and guards
`,
  keyPoints: [
    'Two odd characters per accent mean UTF-8 read as a one byte set.',
    'A replacement character means a one byte set read as UTF-8.',
    'Set the charset on the MIME type or operation, not the runtime default.',
    'A UTF-8 BOM can stick to the first column name.',
    'Transfer in binary mode and decode in the reader.',
    'Agree the encoding and BOM rule in the interface.',
  ],
  solution: `
**1. Symptoms.** "CrÃ¨me" means UTF-8 bytes were read with a one byte set. "Cr?me" or a replacement character means one byte set bytes were read as UTF-8. Open the file in a hex viewer to be sure: è is C3 A8 in UTF-8 and E8 in Windows-1252.

**2. Setting the encoding.** Put the charset on the MIME type of the read, such as \`application/csv; charset=UTF-8\`, or on the operation's encoding setting. The runtime default depends on the machine and can differ between a laptop and CloudHub.

**3. The null item_id.** The sender started writing a UTF-8 byte order mark. The DataWeave CSV reader drops a BOM when it decodes the bytes as UTF-8 itself. This flow decoded the file another way first (a one byte set, or the file read as text before the CSV read), so the mark stayed part of the first header, so the column was named with an invisible character in front, and \`item_id\` did not match.

**4. Agreement and guards.** Agree UTF-8 without a BOM in the interface, with a sample file. In the flow, transfer in binary mode, strip a leading BOM if present, and check that the expected headers exist before loading. Fail the file with a clear reason when they do not.
`,
  followUps: [
    {
      q: 'How would you check the headers before a load?',
      a: 'Read the first line, compare its column names with the expected list, and reject the file with a missing column message before any row is loaded.',
    },
    {
      q: 'Why not convert everything to ASCII to be safe?',
      a: 'Store and item names lose letters, and the planning screens and labels then show wrong names.',
    },
    {
      q: 'Can the same problem happen on SFTP or a file share?',
      a: 'Yes. Encoding is about how the bytes are read, so every transport needs the charset agreed and set.',
    },
  ],
}
