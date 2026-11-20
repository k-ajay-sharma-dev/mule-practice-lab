export default {
  id: 'inc-184',
  category: 'incidents',
  title: 'Nightly Contact Sync Misses Records: Offset Paging Over a List That Changes While You Read It',
  level: 'ADVANCED',
  tags: ['pagination', 'sync', 'apis', 'data-quality'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-16 01:00:02 INFO  [contact-sync] Page offset=0 limit=500 returned 500 contacts', relevant: false },
      { text: '2026-11-16 01:00:09 INFO  [contact-sync] Page offset=500 limit=500 returned 500 contacts', relevant: true, why: 'The sync reads pages by offset while the source list is still changing.' },
      { text: '2026-11-16 01:00:11 INFO  [crm-source] 37 contacts deleted by the duplicate merge job', relevant: true, why: 'Records were removed from the earlier pages during the read.' },
      { text: '2026-11-16 01:00:15 INFO  [contact-sync] Page offset=1000 limit=500 returned 500 contacts', relevant: true, why: 'After the deletes, every later record moved up by 37, so 37 records were skipped at the page boundary.' },
      { text: '2026-11-16 01:02:40 INFO  [contact-sync] Sync finished, 48,963 read, source count 49,000', relevant: true, why: 'The totals do not match, which shows records were missed.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why were some contacts never read?',
        options: [
          'Deletes in earlier pages moved later records up past the next offset',
          'The merge job locked 37 contacts, so the API left them out of its pages',
          'The last page held fewer than 500 records, and the sync stopped before it',
          'The API caps one client at a fixed number of records per night',
        ],
        answer: 0,
        explain: 'Offsets count positions, not records. When 37 earlier records disappear, every later record moves up by 37, and the next offset jumps past 37 of them.',
      },
      {
        type: 'single',
        prompt: 'Which paging method avoids this?',
        options: [
          'Keyset paging: sort by id and ask for records after the last id read',
          'Offset paging with pages of 100, so that fewer records move per page',
          'Offset paging that reads all pages in parallel, so that it ends sooner',
          'Offset paging with a retry of any page that returns fewer records',
        ],
        answer: 0,
        explain: 'Keyset paging asks for "id greater than the last one seen", so deletes and inserts elsewhere do not move the next starting point.',
      },
      {
        type: 'multi',
        prompt: 'What else can make the sync complete?',
        options: [
          'Compare counts at the end and alert on a gap',
          'Use a cursor from the API if it offers one',
          'Run the merge job at a different time from the sync',
          'Sort by last name, which changes when people marry',
        ],
        answer: [0, 1, 2],
        explain: 'A count check shows gaps, an API cursor is built for stable reads, and not running both jobs at once removes the trigger. Sorting by a value that changes makes paging worse.',
      },
      {
        type: 'single',
        prompt: 'Inserts during the read can also cause problems with offsets. What happens then?',
        options: [
          'Records move down, so a record at a page boundary is read twice',
          'Records move down, so a record at a page boundary is skipped',
          'New records always land on the last page, so offsets are not affected',
          'The next page returns more than `limit` records to make up the shift',
        ],
        answer: 0,
        explain: 'An insert before the current position pushes records down, so the next page starts with one already read. That causes duplicates instead of gaps.',
      },
      {
        type: 'order',
        prompt: 'Order the fix.',
        items: [
          'Confirm the gap from the counts and the merge job timing',
          'Run a full resync once to repair the missing contacts',
          'Switch the sync to keyset paging or an API cursor',
          'Add a count check with an alert at the end of each run',
          'Agree a schedule so the merge job and the sync do not overlap',
        ],
        explain: 'Prove it, repair the data, fix the method, add a guard, and remove the trigger.',
      },
    ],
  },
  description: `
## Symptoms
- A marketing platform receives contacts every night from the CRM. About 50 contacts a night never arrive.
- The missing contacts are different each night, and they are never at the start of the list.

## Change / Context
- \`contact-sync\` reads the CRM contacts API page by page with \`offset\` and \`limit=500\`, sorted by creation date.
- A month ago the CRM team added a job that merges duplicate contacts. It runs at about 01:00.
- The sync logs a total but does not compare it with the source count.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-16 01:00:09 INFO  [contact-sync] Page offset=500 limit=500 returned 500 contacts
2026-11-16 01:00:11 INFO  [crm-source] 37 contacts deleted by the duplicate merge job
2026-11-16 01:00:15 INFO  [contact-sync] Page offset=1000 limit=500 returned 500 contacts
2026-11-16 01:02:40 INFO  [contact-sync] Sync finished, 48,963 read, source count 49,000
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
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
    'Offset paging counts positions, so deletes during the read skip records.',
    'Inserts during the read cause the same records to be read twice.',
    'Keyset paging by a stable key, or an API cursor, avoids both.',
    'Compare the count read with the source count and alert on a gap.',
    'Do not run a job that changes the list while another pages through it.',
    'Repair the missing data with a full resync once.',
  ],
  solution: `
**Diagnosis.** The sync pages by offset while the merge job deletes contacts. Each delete before the current page moves every later contact up one position, so the next offset jumps past them. The final count is 37 short.

**Immediate mitigation.** Run a full resync once, when the merge job is not running, to bring the missing contacts across.

**Root cause.** Offset paging assumes the list does not change during the read. The new merge job broke that assumption, and the sync had no count check to notice.

**Permanent fix.**
- Use keyset paging: sort by a stable key such as the contact id and ask for the next page after the last id read. Or use the API's cursor if it has one.
- Make the sync idempotent, so reading a record twice does no harm.

**Prevention.** Compare the number read with the source count each night and alert on a gap. Agree a schedule so jobs that change the list do not run during the sync.
`,
  followUps: [
    { q: 'Why sort by id and not by creation date?', a: 'Many records can share a creation time, which makes "after the last one" unclear. A unique id gives one exact starting point.' },
    { q: 'What if the API only supports offsets?', a: 'Read a snapshot when nothing changes it, filter by a stable range such as an id range per request, or ask the API owner for a cursor.' },
    { q: 'Why make the sync idempotent too?', a: 'Any paging method may read a record twice after a retry. Upserts by id make repeats harmless.' },
    { q: 'How would you spot this kind of gap sooner?', a: 'Log the count read and the source count on the last line of every run, and alert when they differ.' },
  ],
}
