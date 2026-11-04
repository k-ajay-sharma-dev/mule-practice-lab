export default {
  id: 'inc-009',
  category: 'incidents',
  title: 'Customer Names Arrive as "M�ller" in Salesforce',
  level: 'BEGINNER',
  tags: ['encoding', 'files', 'sftp', 'dataweave'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '00:59:58.004 INFO  [runtime] customer-import v1.8.0 file.encoding=UTF-8', relevant: true, why: 'The app default encoding is UTF-8, while the legacy CRM writes ISO-8859-1.' },
      { text: '01:00:03.220 INFO  [customer-import] Reading /outbound/customers_20261102.csv (2.4 MB) mimeType=application/csv', relevant: true, why: 'The new SFTP Read declares no charset, so the default UTF-8 is used to decode a Latin-1 file.' },
      { text: '01:00:05.871 INFO  [customer-import] Parsed 18,442 rows, upserting to Salesforce', relevant: false },
      { text: '01:00:06.002 DEBUG [customer-import] Row 1204 lastName="M�ller" city="M�nchen"', relevant: true, why: 'The replacement character U+FFFD appears where Latin-1 byte 0xFC (ü) could not be decoded as UTF-8.' },
      { text: '01:01:10.400 INFO  [health] GET /health 200 (3 ms)', relevant: false },
      { text: '01:02:40.019 INFO  [customer-import] Upsert finished: 18,442 success, 0 failed', relevant: true, why: 'No error at all: the corrupted text is valid, so the problem is silent.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'The ISO-8859-1 file is now decoded as UTF-8 because the new SFTP Read has no charset',
          'Salesforce does not support accented characters',
          'The legacy CRM started writing corrupted files',
          'DataWeave strips non-ASCII characters by default',
        ],
        answer: 0,
        explain: 'Byte 0xFC (ü in Latin-1) is invalid in UTF-8, so the decoder inserts U+FFFD. ASCII is identical in both encodings, so "Smith" is fine and nothing fails.',
      },
      {
        type: 'single',
        prompt: 'How do you repair the names already damaged in Salesforce?',
        options: [
          'Run a DataWeave script that replaces the replacement character with ü',
          'Fix the charset, redeploy, and re-run the import from the original source files since the release',
          'Nothing; new imports will fix them over time',
          'Convert the Salesforce field encoding to ISO-8859-1',
        ],
        answer: 1,
        explain: 'The conversion is **lossy**: the replacement character could have been ü, é, ø and more. Only the original files hold the correct bytes.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Declare the encoding explicitly and configurably, e.g. outputMimeType="application/csv; charset=ISO-8859-1"',
          'Document the character set in every file interface contract',
          'Test files with accents, umlauts and non-Latin characters in MUnit',
          'An alert if parsed records contain U+FFFD',
          'Change the JVM default encoding to ISO-8859-1 for all apps',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Encoding belongs to each interface. Changing the JVM default would break every other UTF-8 interface in the app.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Compare the old and new read configuration and spot the dropped charset',
          'Set the charset on the SFTP Read and redeploy',
          'Re-run the import from the original files since the release',
          'Spot-check known names such as Müller and José in Salesforce',
          'Add non-ASCII test data and a U+FFFD alert',
        ],
        explain: 'Find the change, fix the decoding, repair data from source, verify, then prevent regressions.',
      },
    ],
  },
  description: `
## Symptoms
- Since yesterday's release, customer names with accents/umlauts are corrupted in Salesforce: **"Müller" → "M�ller"**, **"José" → "Jos�"**.
- Plain ASCII names (e.g. "Smith") are fine. No errors are logged.
- Records created before the release look correct.

## Change / Context
- \`customer-import\` reads a nightly CSV from the legacy CRM over SFTP. The legacy system writes files in **ISO-8859-1 (Latin-1)**.
- Release notes: *"Replaced the old File-based download step with the SFTP connector's Read operation; cleaned up MIME type settings."*
- The old step was configured with \`outputMimeType="application/csv; charset=ISO-8859-1"\`. The new Read operation has no MIME type or encoding set. The app's default encoding is **UTF-8**.

## Logs
\`\`\`
01:00:03.220 INFO  [customer-import] Reading /outbound/customers_20261102.csv (2.4 MB)
01:00:05.871 INFO  [customer-import] Parsed 18,442 rows, upserting to Salesforce
01:02:40.019 INFO  [customer-import] Upsert finished: 18,442 success, 0 failed
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Identifies the encoding mismatch: ISO-8859-1 bytes are being decoded as UTF-8 because the new Read operation lost the charset setting.',
    'Explains why only non-ASCII characters break: ASCII bytes are the same in both encodings; Latin-1 bytes such as 0xFC (ü) are invalid in UTF-8 and become the replacement character �.',
    'Notes the corruption is lossy: � cannot be converted back, so affected records must be repaired from the source files, not "fixed" in Salesforce.',
    'Immediate: set the encoding on the SFTP Read (e.g. outputMimeType application/csv with charset ISO-8859-1 or outputEncoding), redeploy, and re-run the import for the affected files.',
    'Prevention: declare the encoding explicitly in the interface contract and config, and add a test file with non-ASCII characters to the regression suite.',
  ],
  solution: `
**Diagnosis.** The legacy file is **ISO-8859-1**, where "ü" is the single byte \`0xFC\`. The new SFTP Read has no charset, so Mule uses the app default **UTF-8** to read it. \`0xFC\` is not a valid UTF-8 sequence, so the decoder substitutes the **replacement character � (U+FFFD)**. ASCII characters are identical in both encodings, which is why "Smith" is fine and no error is raised — the CSV still parses.

**Immediate mitigation.**
1. Set the encoding on the Read operation, e.g. \`outputMimeType="application/csv; charset=ISO-8859-1"\` (or \`outputEncoding="ISO-8859-1"\`), and redeploy.
2. The damage is **lossy** — "�" cannot be turned back into "ü". Re-run the import from the **original source files** for every night since the release (the upsert overwrites the bad names), or restore those fields from a backup.
3. Spot-check a few known names (Müller, José, Øster) in Salesforce.

**Root cause.** The refactoring dropped the charset declaration that told Mule how to decode the file, and the default encoding (UTF-8) did not match the producer's encoding (ISO-8859-1). Nothing in testing used non-ASCII data.

**Permanent fix.** Keep the encoding explicit and configurable (property \`legacy.file.charset\`), set it on the read, and write to Salesforce as UTF-8 (DataWeave output). Ideally ask the legacy team to produce UTF-8, but still declare it explicitly.

**Prevention.** Document the character set in every file interface contract; include test files with accents, umlauts and non-Latin characters in MUnit/regression tests; optionally add a check that fails or alerts if a parsed record contains U+FFFD.
`,
  followUps: [
    { q: 'If you saw "MÃ¼ller" instead of "M�ller", what would that tell you?', a: 'That is the opposite mistake: UTF-8 bytes (0xC3 0xBC for ü) were decoded as ISO-8859-1/Windows-1252, so each byte became its own character. It points to a UTF-8 producer being read with a Latin-1 setting.' },
    { q: 'Where can the encoding be set in a Mule 4 app?', a: 'On the operation that reads the data (outputMimeType with a charset, or outputEncoding), in DataWeave output directives for what you write, and as the application/runtime default encoding as a fallback.' },
    { q: 'How do you prove the file really is ISO-8859-1?', a: 'Inspect the raw bytes (hex dump) of a known name: "ü" as one byte 0xFC means Latin-1, as two bytes 0xC3 0xBC means UTF-8. Confirm with the producing system\'s export settings.' },
  ],
}
